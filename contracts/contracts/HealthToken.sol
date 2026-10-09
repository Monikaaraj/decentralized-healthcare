// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract HealthToken is ERC20, Ownable {
    // Mint 1 Million HLTH tokens to the deployer on creation
    constructor() ERC20("HealthToken", "HLTH") Ownable(msg.sender) {
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }

    // A simple faucet function so testing wallets can grab 100 HLTH tokens for free
    function requestTokens() public {
        uint256 amount = 100 * 10 ** decimals();
        _mint(msg.sender, amount);
    }
}
