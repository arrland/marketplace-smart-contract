// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

// This is a dummy token contract used solely for unit testing purposes and will not be deployed on the mainnet.
contract DummyTokenBurnable is ERC20, ERC20Burnable {
    constructor(uint256 initialSupply) ERC20("DummyToken", "DT") {
        _mint(msg.sender, initialSupply);
    }
}