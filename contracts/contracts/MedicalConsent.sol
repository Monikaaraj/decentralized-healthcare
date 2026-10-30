// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract MedicalConsent is Ownable {
    
    // Struct to hold patient record information
    struct Record {
        string cid;
        uint256 timestamp;
        address uploader;
        bool exists;
        bytes32 merkleRoot; // Non-zero if anchored via Merkle Tree batch
    }

    // Mapping from patient address -> record ID -> Record
    mapping(address => mapping(uint256 => Record)) private patientRecords;
    
    // Mapping from (patient address, CID) -> uploader (to lookup doctor royalty on research fulfillment)
    mapping(address => mapping(string => address)) public recordUploaderByCid;

    // Mapping from patient address -> record count
    mapping(address => uint256) public patientRecordCount;

    // Mapping for consent: patient -> doctor -> bool
    mapping(address => mapping(address => bool)) public consent;

    // Struct for Doctor Verification via NMC
    struct DoctorApplication {
        string username;
        string name;
        string licenseNumber;
        bool hasApplied;
        bool isApproved;
        bool isRejected;
    }

    mapping(string => DoctorApplication) public doctorProfiles;
    string[] public doctorUsernames;

    // Struct for Researcher Verification via ICMR / Institutional Review Board (IRB)
    struct ResearcherApplication {
        string username;
        string name;
        string institution;
        string researchId;
        bool hasApplied;
        bool isApproved;
        bool isRejected;
    }

    mapping(string => ResearcherApplication) public researcherProfiles;
    string[] public researcherUsernames;

    // Merkle Tree Batch Storage
    struct MerkleBatch {
        bytes32 root;
        uint256 timestamp;
        address doctor;
        uint256 recordCount;
    }
    mapping(bytes32 => MerkleBatch) public merkleBatches;
    bytes32[] public batchRootsHistory;

    // Events
    event RecordAdded(address indexed patient, uint256 indexed recordId, string cid);
    event MerkleBatchCommitted(bytes32 indexed merkleRoot, address indexed doctor, uint256 recordCount);
    event ConsentGranted(address indexed patient, address indexed doctor);
    event ConsentRevoked(address indexed patient, address indexed doctor);
    event RecordDeleted(address indexed patient, uint256 indexed recordId);
    event DoctorApplied(string username, string name, string licenseNumber);
    event DoctorVerified(string username);
    event DoctorRejected(string username);
    event ResearcherApplied(string username, string name, string institution, string researchId);
    event ResearcherVerified(string username);
    event ResearcherRejected(string username);
    event DevDataReset();

    constructor() Ownable(msg.sender) {}

    // Add a new medical record (IPFS CID) directly by patient
    function addRecord(string memory _cid) external {
        uint256 recordId = patientRecordCount[msg.sender];
        patientRecords[msg.sender][recordId] = Record({
            cid: _cid,
            timestamp: block.timestamp,
            uploader: msg.sender,
            exists: true,
            merkleRoot: bytes32(0)
        });
        patientRecordCount[msg.sender]++;
        recordUploaderByCid[msg.sender][_cid] = msg.sender;

        emit RecordAdded(msg.sender, recordId, _cid);
    }

    // Doctor adds an individual medical record for a specific patient
    function addRecordForPatient(address _patient, string memory _cid, string memory _doctorUsername) external {
        require(doctorProfiles[_doctorUsername].isApproved, "Access Denied: Not a verified doctor");
        require(consent[_patient][msg.sender], "Access Denied: Doctor does not have consent");
        
        uint256 recordId = patientRecordCount[_patient];
        patientRecords[_patient][recordId] = Record({
            cid: _cid,
            timestamp: block.timestamp,
            uploader: msg.sender,
            exists: true,
            merkleRoot: bytes32(0)
        });
        patientRecordCount[_patient]++;
        recordUploaderByCid[_patient][_cid] = msg.sender;

        emit RecordAdded(_patient, recordId, _cid);
    }

    /**
     * @notice Merkle Tree Batch Upload:
     * Commits a cryptographic Merkle Root representing N prescriptions in ONE single transaction,
     * while simultaneously routing each prescription directly into each patient's individual account!
     * Saves massive gas and allows 1-click batching for doctors.
     */
    function commitMerkleBatch(
        bytes32 _merkleRoot,
        address[] calldata _patients,
        string[] calldata _cids,
        string calldata _doctorUsername
    ) external {
        require(doctorProfiles[_doctorUsername].isApproved, "Access Denied: Not a verified doctor");
        require(_patients.length == _cids.length, "Mismatched patients and CIDs length");
        require(_patients.length > 0, "Empty batch");

        // 1. Anchor the 32-byte Merkle Root on-chain
        merkleBatches[_merkleRoot] = MerkleBatch({
            root: _merkleRoot,
            timestamp: block.timestamp,
            doctor: msg.sender,
            recordCount: _patients.length
        });
        batchRootsHistory.push(_merkleRoot);

        // 2. Deliver each prescription directly into each patient's account
        for (uint256 i = 0; i < _patients.length; i++) {
            address patient = _patients[i];
            require(consent[patient][msg.sender], "Access Denied: Doctor does not have consent for patient");

            uint256 recordId = patientRecordCount[patient];
            patientRecords[patient][recordId] = Record({
                cid: _cids[i],
                timestamp: block.timestamp,
                uploader: msg.sender,
                exists: true,
                merkleRoot: _merkleRoot
            });
            patientRecordCount[patient]++;
            recordUploaderByCid[patient][_cids[i]] = msg.sender;

            emit RecordAdded(patient, recordId, _cids[i]);
        }

        emit MerkleBatchCommitted(_merkleRoot, msg.sender, _patients.length);
    }

    /**
     * @notice Cryptographic verification of any prescription against its Merkle Root
     */
    function verifyPrescriptionProof(
        bytes32 _merkleRoot,
        bytes32[] calldata _proof,
        address _patient,
        string calldata _cid,
        uint256 _timestamp
    ) external view returns (bool) {
        require(merkleBatches[_merkleRoot].timestamp > 0, "Merkle Root not registered");
        bytes32 leaf = keccak256(abi.encodePacked(_patient, _cid, _timestamp));
        return MerkleProof.verify(_proof, _merkleRoot, leaf);
    }

    // Grant access to a doctor
    function grantConsent(address _doctor) external {
        consent[msg.sender][_doctor] = true;
        emit ConsentGranted(msg.sender, _doctor);
    }

    // Revoke access from a doctor
    function revokeConsent(address _doctor) external {
        consent[msg.sender][_doctor] = false;
        emit ConsentRevoked(msg.sender, _doctor);
    }

    // Get a specific record (Only Patient or Consented Doctor can access)
    function getRecord(address _patient, uint256 _recordId) external view returns (string memory cid, address uploader, uint256 timestamp) {
        require(
            msg.sender == _patient || consent[_patient][msg.sender],
            "Access Denied: No consent from patient"
        );
        require(patientRecords[_patient][_recordId].exists, "Record does not exist");
        
        Record memory rec = patientRecords[_patient][_recordId];
        return (rec.cid, rec.uploader, rec.timestamp);
    }

    // Get total records for a patient
    function getRecordCount(address _patient) external view returns (uint256) {
        require(
            msg.sender == _patient || consent[_patient][msg.sender],
            "Access Denied: No consent from patient"
        );
        return patientRecordCount[_patient];
    }

    // Lookup who uploaded / authorized a specific CID for a patient (used for royalty distribution)
    function getUploaderOfCid(address _patient, string memory _cid) external view returns (address) {
        return recordUploaderByCid[_patient][_cid];
    }

    // Delete a medical record
    function deleteRecord(uint256 _recordId) external {
        require(patientRecords[msg.sender][_recordId].exists, "Record does not exist");
        require(patientRecords[msg.sender][_recordId].uploader == msg.sender, "Can only delete your own records");
        
        patientRecords[msg.sender][_recordId].exists = false;
        patientRecords[msg.sender][_recordId].cid = "";
        
        emit RecordDeleted(msg.sender, _recordId);
    }

    // Apply for NMC Verification
    function applyForVerification(string memory _username, string memory _name, string memory _licenseNumber) external {
        require(!doctorProfiles[_username].hasApplied, "Already applied");
        doctorProfiles[_username] = DoctorApplication({
            username: _username,
            name: _name,
            licenseNumber: _licenseNumber,
            hasApplied: true,
            isApproved: false,
            isRejected: false
        });
        doctorUsernames.push(_username);
        emit DoctorApplied(_username, _name, _licenseNumber);
    }

    // NMC Admin approves a doctor
    function approveDoctor(string memory _username) external onlyOwner {
        require(doctorProfiles[_username].hasApplied, "Doctor has not applied");
        doctorProfiles[_username].isApproved = true;
        doctorProfiles[_username].isRejected = false;
        emit DoctorVerified(_username);
    }

    // NMC Admin rejects a doctor
    function rejectDoctor(string memory _username) external onlyOwner {
        require(doctorProfiles[_username].hasApplied, "Doctor has not applied");
        doctorProfiles[_username].isApproved = false;
        doctorProfiles[_username].isRejected = true;
        emit DoctorRejected(_username);
    }

    // Fetch all doctor usernames (for NMC Portal)
    function getAllDoctors() external view returns (string[] memory) {
        return doctorUsernames;
    }

    // Apply for Researcher / IRB Verification
    function applyForResearcherVerification(
        string memory _username,
        string memory _name,
        string memory _institution,
        string memory _researchId
    ) external {
        require(!researcherProfiles[_username].hasApplied, "Already applied");
        researcherProfiles[_username] = ResearcherApplication({
            username: _username,
            name: _name,
            institution: _institution,
            researchId: _researchId,
            hasApplied: true,
            isApproved: false,
            isRejected: false
        });
        researcherUsernames.push(_username);
        emit ResearcherApplied(_username, _name, _institution, _researchId);
    }

    // Admin approves a researcher
    function approveResearcher(string memory _username) external onlyOwner {
        require(researcherProfiles[_username].hasApplied, "Researcher has not applied");
        researcherProfiles[_username].isApproved = true;
        researcherProfiles[_username].isRejected = false;
        emit ResearcherVerified(_username);
    }

    // Admin rejects a researcher
    function rejectResearcher(string memory _username) external onlyOwner {
        require(researcherProfiles[_username].hasApplied, "Researcher has not applied");
        researcherProfiles[_username].isApproved = false;
        researcherProfiles[_username].isRejected = true;
        emit ResearcherRejected(_username);
    }

    // Fetch all researcher usernames
    function getAllResearchers() external view returns (string[] memory) {
        return researcherUsernames;
    }

    // Dev utility: Reset all data
    function resetDevData() external {
        for (uint i = 0; i < doctorUsernames.length; i++) {
            delete doctorProfiles[doctorUsernames[i]];
        }
        delete doctorUsernames;

        for (uint i = 0; i < researcherUsernames.length; i++) {
            delete researcherProfiles[researcherUsernames[i]];
        }
        delete researcherUsernames;

        emit DevDataReset();
    }
}
