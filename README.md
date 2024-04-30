# MarketPlace Smart Contract Documentation

## Overview
The [MarketPlace](file:///Users/dominik/blockchain/auction-smart-contract/contracts/MarketPlace.sol#19%2C10-19%2C10) smart contract is designed to facilitate various types of sell offers for NFTs (ERC721 and ERC1155) using ERC20 tokens as payment. It supports three types of sell offers: Bidding, Buy Now, and Staking. The contract includes features such as whitelisting of NFTs and payment tokens, role-based permissions, and reentrancy protection to ensure secure transactions.

## Key Features
- **Multiple Sell Offer Types**: Supports Bidding, Buy Now, and Staking sell offers.
- **Role-Based Permissions**: Different roles for creating sell offers, managing whitelists, and more.
- **Whitelisting**: NFT addresses and payment tokens can be whitelisted to ensure only approved tokens are used.
- **Reentrancy Protection**: Ensures that functions cannot be re-entered while they are still executing.
- **ERC1155 and ERC721 Support**: Can handle both types of NFTs.
- **Time Extension on Bids**: Automatically extends the bidding period when a bid is placed near the end time.

## Public Functions

### Public Functions and Usage Examples

#### 1. `createSellOffer(SellOfferParams params)`
- **Parameters:**
  - `SellOfferParams params`: A struct that encapsulates all the required parameters to create a sell offer on the marketplace. The structure includes:
    - `uint256[] tokenIds`: Array of token IDs for the NFTs involved in the sell offer.
    - `address nftAddress`: The contract address of the NFT.
    - `uint256 startTime`: The start time of the sell offer as a Unix timestamp.
    - `uint256 endTime`: The end time of the sell offer as a Unix timestamp.
    - `IERC20 paymentToken`: The ERC20 token used for payments in the sell offer.
    - `uint256 price`: The price for the sell offer in terms of the payment token.
    - `SellOfferType sellOfferType`: The type of sell offer, which can be BID, BUYNOW, or STAKE.
    - `bytes32 merkleRoot`: The Merkle root used for cryptographic verification in the sell offer.
    - `address payoutAddress`: The address where the payment will be sent upon successful sell offer.
    - `bool isERC1155`: A boolean indicating whether the NFT is ERC1155 (true) or ERC721 (false).
    - `uint256[] amounts`: Array of amounts corresponding to the `tokenIds` for ERC1155 tokens; for ERC721, this is typically an array of ones.
- **Usage Example:**
  ```javascript
  const params = {
    tokenIds: [1, 2],
    nftAddress: "0xNFTAddress",
    startTime: 1670000000,
    endTime: 1680000000,
    paymentToken: "0xPaymentTokenAddress",
    price: ethers.parseEther("10"),
    sellOfferType: "BID",
    merkleRoot: "0xMerkleRoot",
    payoutAddress: "0xPayoutAddress",
    isERC1155: true,
    amounts: [1, 1]
  };
  await marketPlaceContract.createSellOffer(params);
  ```

#### 2. `cancel(uint256 sellOfferId)`
- **Parameters:**
  - `uint256 sellOfferId`: The ID of the sell offer to cancel.
- **Usage Example:**
  ```javascript
  await marketPlaceContract.cancel(1);
  ```

#### 3. `payout(uint256 sellOfferId)`
- **Parameters:**
  - `uint256 sellOfferId`: The ID of the sell offer to payout.
- **Usage Example:**
  ```javascript
  await marketPlaceContract.payout(1);
  ```

#### 4. `claimNFT(uint256 sellOfferId, uint256 tokenId)`
- **Parameters:**
  - `uint256 sellOfferId`: The ID of the sell offer.
  - `uint256 tokenId`: The ID of the token to claim.
- **Usage Example:**
  ```javascript
  await marketPlaceContract.claimNFT(1, 101);
  ```

#### 5. `placeBid(uint256 sellOfferId, uint256 tokenId, uint256 amount, bytes32[] proof)`
- **Parameters:**
  - `uint256 sellOfferId`: The ID of the sell offer.
  - `uint256 tokenId`: The ID of the token.
  - `uint256 amount`: The amount of the bid.
  - `bytes32[] proof`: Merkle proof for verification.
- **Usage Example:**
  ```javascript
  const proof = ["0x123...", "0x456..."];
  const amount = ethers.parseEther("5");
  await marketPlaceContract.placeBid(1, 101, amount, proof);
  ```

#### 6. `buyNow(uint256 sellOfferId, uint256 tokenId, bytes32[] proof)`
- **Parameters:**
  - `uint256 sellOfferId`: The ID of the sell offer.
  - `uint256 tokenId`: The ID of the token.
  - `bytes32[] proof`: Merkle proof for verification.
- **Usage Example:**
  ```javascript
  const proof = ["0x789...", "0xabc..."];
  await marketPlaceContract.buyNow(1, 101, proof);
  ```

  ### Events Description

  #### 1. `SellOfferPayout`
  - **Description**: Emitted when a sell offer is successfully paid out.
  - **Parameters**:
    - `uint256 indexed sellOfferId`: The ID of the sell offer.
    - `uint256 amount`: The total amount paid out.
    - `uint256[] tokenIds`: The IDs of the tokens involved in the payout.
    - `uint256 payoutDate`: The timestamp when the payout occurred.

  #### 2. `SellOfferCanceled`
  - **Description**: Emitted when a sell offer is canceled.
  - **Parameters**:
    - `uint256 indexed sellOfferId`: The ID of the sell offer that was canceled.

  #### 3. `onBuyOrBid`
  - **Description**: Emitted when a buy or bid action is performed on a sell offer.
  - **Parameters**:
    - `uint256 indexed sellOfferId`: The ID of the sell offer.
    - `address nftAddress`: The address of the NFT involved.
    - `uint256 price`: The price at which the buy or bid was made.
    - `uint256 timestamp`: The timestamp when the buy or bid occurred.
    - `uint256 tokenEndTime`: The end time for the token sell offer.
    - `uint256 tokenId`: The ID of the token involved.
    - `SellOfferType sellOfferType`: The type of the sell offer.
    - `address bidderAddress`: The address of the bidder or buyer.
    - `uint256 bidsCount`: The count of bids made on the sell offer.

  #### 4. `NFTClaimed`
  - **Description**: Emitted when an NFT is claimed after a successful bid.
  - **Parameters**:
    - `uint256 sellOfferId`: The ID of the sell offer.
    - `uint256 tokenId`: The ID of the token claimed.
    - `address winnerAddress`: The address of the winner who claimed the NFT.
    - `uint256 timestamp`: The timestamp when the NFT was claimed.

  #### 5. `NewSellOfferCreated`
  - **Description**: Emitted when a new sell offer is created.
  - **Parameters**:
    - `uint256 sellOfferId`: The ID of the new sell offer.
    - `uint256 createdAt`: The timestamp when the sell offer was created.
    - `uint256[] tokenIds`: The IDs of the tokens involved in the sell offer.
    - `address nftAddress`: The address of the NFT involved.
    - `uint256 startTime`: The start time of the sell offer.
    - `uint256 endTime`: The end time of the sell offer.
    - `IERC20 paymentToken`: The payment token used in the sell offer.
    - `uint256 price`: The price of the sell offer.
    - `SellOfferType sellOfferType`: The type of the sell offer.
    - `address payoutAddress`: The payout address for the sell offer.
    - `bool isERC1155`: Indicates if the sell offer involves ERC1155 tokens.
    - `address creatorAddress`: The address of the creator of the sell offer.
    - `uint256[] tokenAmounts`: The amounts of the tokens involved in the sell offer.

