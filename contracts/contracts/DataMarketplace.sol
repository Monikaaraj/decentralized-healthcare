// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DataMarketplace is Ownable {
    IERC20 public healthToken;

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

    // Events
    event BountyCreated(uint256 indexed bountyId, address indexed creator, string description, uint256 reward, uint256 totalEscrow);
    event BountyFulfilled(uint256 indexed bountyId, address indexed fulfiller, string ipfsCID, uint256 reward);

    constructor(address _healthTokenAddress) Ownable(msg.sender) {
        healthToken = IERC20(_healthTokenAddress);
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

    // Patient fulfills a bounty by providing their CID and gets paid instantly
    function fulfillBounty(uint256 _bountyId, string memory _ipfsCID) public {
        Bounty storage bounty = bounties[_bountyId];
        require(bounty.isActive, "Bounty is not active");
        require(bounty.remainingEscrow >= bounty.rewardPerFulfillment, "Insufficient escrow remaining");

        // Transfer reward from contract to patient
        require(healthToken.transfer(msg.sender, bounty.rewardPerFulfillment), "Reward transfer failed");

        bounty.remainingEscrow -= bounty.rewardPerFulfillment;
        
        // If not enough for another fulfillment, deactivate it
        if (bounty.remainingEscrow < bounty.rewardPerFulfillment) {
            bounty.isActive = false;
        }

        emit BountyFulfilled(_bountyId, msg.sender, _ipfsCID, bounty.rewardPerFulfillment);
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
