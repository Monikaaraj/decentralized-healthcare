// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DataMarketplace is Ownable {
    IERC20 public healthToken;

    struct DataListing {
        address patient;
        string ipfsCID;
        uint256 price;
        bool isActive;
    }

    // Mapping from listing ID to DataListing
    mapping(uint256 => DataListing) public listings;
    uint256 public nextListingId;

    // Event when a patient lists data for sale
    event DataListed(uint256 indexed listingId, address indexed patient, string ipfsCID, uint256 price);
    // Event when a researcher buys data
    event DataPurchased(uint256 indexed listingId, address indexed researcher, address indexed patient, uint256 price);

    constructor(address _healthTokenAddress) Ownable(msg.sender) {
        healthToken = IERC20(_healthTokenAddress);
    }

    // Patient lists their data CID for sale at a specific HLTH token price
    function listData(string memory _ipfsCID, uint256 _price) public returns (uint256) {
        require(_price > 0, "Price must be greater than zero");

        uint256 listingId = nextListingId++;
        listings[listingId] = DataListing({
            patient: msg.sender,
            ipfsCID: _ipfsCID,
            price: _price,
            isActive: true
        });

        emit DataListed(listingId, msg.sender, _ipfsCID, _price);
        return listingId;
    }

    // Researcher buys access to the data by paying the HLTH token price
    function purchaseData(uint256 _listingId) public {
        DataListing storage listing = listings[_listingId];
        require(listing.isActive, "Listing is not active");
        require(listing.patient != msg.sender, "Cannot buy your own data");

        uint256 price = listing.price;
        require(healthToken.balanceOf(msg.sender) >= price, "Insufficient HLTH balance");

        // Transfer HLTH tokens from the researcher to the patient
        // Note: The researcher must have called `approve()` on the HealthToken contract first!
        require(healthToken.transferFrom(msg.sender, listing.patient, price), "Token transfer failed");

        emit DataPurchased(_listingId, msg.sender, listing.patient, price);
    }

    // Patient can delist their data
    function delistData(uint256 _listingId) public {
        DataListing storage listing = listings[_listingId];
        require(listing.patient == msg.sender, "Only the owner can delist");
        require(listing.isActive, "Already delisted");

        listing.isActive = false;
    }
}
