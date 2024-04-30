// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IMarketPlace {
    function placeBid(uint256 sellOfferId, uint256 tokenId, uint256 amount, bytes32[] calldata proof) external;
    function buyNow(uint256 sellOfferId, uint256 tokenId, bytes32[] calldata proof) external;
}

contract DummyNonReceiver {
    IMarketPlace public marketPlace;

    constructor(address _marketPlace) {
        marketPlace = IMarketPlace(_marketPlace);
    }

    function attemptPlaceBid(uint256 sellOfferId, uint256 tokenId, uint256 amount, bytes32[] memory proof) external {
        marketPlace.placeBid(sellOfferId, tokenId, amount, proof);
    }

    function attemptBuyNow(uint256 sellOfferId, uint256 tokenId, bytes32[] memory proof) external {
        marketPlace.buyNow(sellOfferId, tokenId, proof);
    }
}