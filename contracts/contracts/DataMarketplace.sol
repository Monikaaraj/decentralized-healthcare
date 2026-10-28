// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IMedicalConsent {
    function getUploaderOfCid(address _patient, string memory _cid) external view returns (address);
}

contract DataMarketplace is Ownable {
    IERC20 public healthToken;
    IMedicalConsent public medicalConsent;

    struct Bounty {
        address creator;
        string description;
        uint256 rewardPerFulfillment;
        uint256 remainingEscrow;
        bool isActive;
    }

    // Mapping from bounty ID to Bounty
    mapping(uint256 => Bounty) public bounties;
    uint256 public nextBountyId;

    // 20% Doctor Royalty Constant (Basis Points: 2000 / 10000 = 20%)
    uint256 public constant DOCTOR_ROYALTY_BPS = 2000;
    uint256 public constant BPS_DENOMINATOR = 10000;

    // Events
    event BountyCreated(uint256 indexed bountyId, address indexed creator, string description, uint256 reward, uint256 totalEscrow);
    event BountyFulfilled(
        uint256 indexed bountyId,
        address indexed fulfiller,
        string ipfsCID,
        uint256 reward,
        address indexed doctor,
        uint256 doctorRoyalty
    );
    event MedicalConsentUpdated(address indexed consentAddress);

    constructor(address _healthTokenAddress) Ownable(msg.sender) {
        healthToken = IERC20(_healthTokenAddress);
    }

    function setMedicalConsent(address _medicalConsentAddress) external onlyOwner {
        medicalConsent = IMedicalConsent(_medicalConsentAddress);
        emit MedicalConsentUpdated(_medicalConsentAddress);
    }

    // Researcher creates a bounty and deposits tokens into escrow
    function createBounty(string memory _description, uint256 _reward, uint256 _totalEscrow) public returns (uint256) {
        require(_reward > 0, "Reward must be > 0");
        require(_totalEscrow >= _reward, "Escrow must cover at least one reward");
        
        // Transfer escrow from researcher to this contract
        require(healthToken.transferFrom(msg.sender, address(this), _totalEscrow), "Token escrow failed");

        uint256 bountyId = nextBountyId++;
        bounties[bountyId] = Bounty({
            creator: msg.sender,
            description: _description,
            rewardPerFulfillment: _reward,
            remainingEscrow: _totalEscrow,
            isActive: true
        });

        emit BountyCreated(bountyId, msg.sender, _description, _reward, _totalEscrow);
        return bountyId;
    }

    /**
     * @notice Patient fulfills a bounty by providing their verified CID.
     * Splitting logic:
     * - If the record was verified/uploaded by a Doctor:
     *     Doctor receives 20% Royalty (DOCTOR_ROYALTY_BPS)
     *     Patient receives 80%
     * - If self-uploaded by patient:
     *     Patient receives 100%
     */
    function fulfillBounty(uint256 _bountyId, string memory _ipfsCID) public {
        Bounty storage bounty = bounties[_bountyId];
        require(bounty.isActive, "Bounty is not active");
        require(bounty.remainingEscrow >= bounty.rewardPerFulfillment, "Insufficient escrow remaining");

        uint256 totalReward = bounty.rewardPerFulfillment;
        uint256 doctorShare = 0;
        uint256 patientShare = totalReward;
        address doctor = address(0);

        // Check if a doctor authored / uploaded this record
        if (address(medicalConsent) != address(0)) {
            doctor = medicalConsent.getUploaderOfCid(msg.sender, _ipfsCID);
            if (doctor != address(0) && doctor != msg.sender) {
                // Calculate 20% royalty for doctor
                doctorShare = (totalReward * DOCTOR_ROYALTY_BPS) / BPS_DENOMINATOR;
                patientShare = totalReward - doctorShare;

                // Transfer 20% royalty to doctor
                require(healthToken.transfer(doctor, doctorShare), "Doctor royalty transfer failed");
            }
        }

        // Transfer remaining reward (80% or 100%) to patient
        require(healthToken.transfer(msg.sender, patientShare), "Patient reward transfer failed");

        bounty.remainingEscrow -= totalReward;
        
        // If not enough for another fulfillment, deactivate it
        if (bounty.remainingEscrow < bounty.rewardPerFulfillment) {
            bounty.isActive = false;
        }

        emit BountyFulfilled(_bountyId, msg.sender, _ipfsCID, patientShare, doctor, doctorShare);
    }

    // Researcher can cancel their bounty to withdraw remaining escrow
    function cancelBounty(uint256 _bountyId) public {
        Bounty storage bounty = bounties[_bountyId];
        require(bounty.creator == msg.sender, "Only creator can cancel");
        require(bounty.isActive, "Bounty already inactive");

        bounty.isActive = false;
        
        // Refund remaining escrow
        if (bounty.remainingEscrow > 0) {
            require(healthToken.transfer(msg.sender, bounty.remainingEscrow), "Refund failed");
        }
    }
}
