// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract MedicalConsent is Ownable {
    
    // Struct to hold patient record information
    struct Record {
        string cid;
        uint256 timestamp;
        address uploader;
        bool exists;
    }

    // Mapping from patient address -> record ID -> Record
    mapping(address => mapping(uint256 => Record)) private patientRecords;
    
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

    // Events
    event RecordAdded(address indexed patient, uint256 indexed recordId, string cid);
    event ConsentGranted(address indexed patient, address indexed doctor);
    event ConsentRevoked(address indexed patient, address indexed doctor);
    event RecordDeleted(address indexed patient, uint256 indexed recordId);
    event DoctorApplied(string username, string name, string licenseNumber);
    event DoctorVerified(string username);
    event DoctorRejected(string username);
    event DevDataReset();

    constructor() Ownable(msg.sender) {}

    // Add a new medical record (IPFS CID)
    function addRecord(string memory _cid) external {
        uint256 recordId = patientRecordCount[msg.sender];
        patientRecords[msg.sender][recordId] = Record({
            cid: _cid,
            timestamp: block.timestamp,
            uploader: msg.sender,
            exists: true
        });
        patientRecordCount[msg.sender]++;

        emit RecordAdded(msg.sender, recordId, _cid);
    }

    // Doctor adds a medical record for a specific patient
    function addRecordForPatient(address _patient, string memory _cid, string memory _doctorUsername) external {
        require(doctorProfiles[_doctorUsername].isApproved, "Access Denied: Not a verified doctor");
        require(consent[_patient][msg.sender], "Access Denied: Doctor does not have consent");
        
        uint256 recordId = patientRecordCount[_patient];
        patientRecords[_patient][recordId] = Record({
            cid: _cid,
            timestamp: block.timestamp,
            uploader: msg.sender,
            exists: true
        });
        patientRecordCount[_patient]++;

        emit RecordAdded(_patient, recordId, _cid);
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

    // Dev utility: Reset all data
    function resetDevData() external {
        for (uint i = 0; i < doctorUsernames.length; i++) {
            delete doctorProfiles[doctorUsernames[i]];
        }
        delete doctorUsernames;

        emit DevDataReset();
    }
}
