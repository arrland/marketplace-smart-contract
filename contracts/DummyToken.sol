// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// This is a dummy token contract used solely for unit testing purposes and will not be deployed on the mainnet.
contract DummyToken is ERC20 {
    constructor(uint256 initialSupply) ERC20("DummyToken", "DT") {
        _mint(msg.sender, initialSupply);
    }
}