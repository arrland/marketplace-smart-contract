// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SimpleERC721 is ERC721, Ownable {
    uint256 public tokenIds;

    constructor(string memory name, string memory symbol, address initialOwner) ERC721(name, symbol) Ownable(initialOwner) {}

    function mint(address to) public onlyOwner returns (uint256) {
        tokenIds++;
        uint256 newItemId = tokenIds;
        _mint(to, newItemId);
        return newItemId;
    }
}
