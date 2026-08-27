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

    // Events
    event RecordAdded(address indexed patient, uint256 indexed recordId, string cid);
    event ConsentGranted(address indexed patient, address indexed doctor);
    event ConsentRevoked(address indexed patient, address indexed doctor);

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
    function addRecordForPatient(address _patient, string memory _cid) external {
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
}
