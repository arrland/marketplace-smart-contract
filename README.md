# MarketPlace Smart Contract Documentation

## Overview
The [MarketPlace](./contracts/MarketPlace.sol) smart contract is designed to facilitate various types of sell offers for NFTs (ERC721 and ERC1155) using ERC20 tokens as payment. It supports three types of sell offers: Bidding, Buy Now, and Staking. The contract includes features such as whitelisting of NFTs and payment tokens, role-based permissions, and reentrancy protection to ensure secure transactions.

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
    - `uint256 stakeDuration`: The duration for which the tokens will be staked (only applicable for STAKE sell offers).
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
    amounts: [1, 1],
    stakeDuration: 0
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
  - `SellOfferType sellOfferType`: The type of the sell offer (BID, BUYNOW, or STAKE).
  - `address bidderAddress`: The address of the bidder or buyer.
  - `uint256 bidsCount`: The total number of bids placed.

#### 4. `NewSellOfferCreated`
- **Description**: Emitted when a new sell offer is created.
- **Parameters**:
  - `uint256 sellOfferId`: The ID of the newly created sell offer.
  - `uint256 createdAt`: The timestamp when the sell offer was created.
  - `uint256[] tokenIds`: The IDs of the tokens involved in the sell offer.
  - `address nftAddress`: The address of the NFT contract.
  - `OfferDetails details`: A struct containing detailed information about the sell offer, which includes:
    - `uint256 startTime`: The start time of the sell offer.
    - `uint256 endTime`: The end time of the sell offer.
    - `IERC20 paymentToken`: The ERC20 token used for payment.
    - `uint256 price`: The price of the sell offer.
    - `SellOfferType sellOfferType`: The type of the sell offer (BID, BUYNOW, or STAKE).
    - `address payoutAddress`: The address where the payout will be sent.
    - `bool isERC1155`: A boolean indicating whether the sell offer is for an ERC1155 token.
    - `uint256[] tokenAmounts`: An array of token amounts (only used if `isERC1155` is true).
    - `uint256 stakeDuration`: The duration of the stake (only used if `sellOfferType` is STAKE).
  - `address creatorAddress`: The address of the creator of the sell offer.

#### 5. `NFTClaimed`
- **Description**: Emitted when an NFT is claimed.
- **Parameters**:
  - `uint256 indexed sellOfferId`: The ID of the sell offer.
  - `uint256 indexed tokenId`: The ID of the token claimed.
  - `address winnerAddress`: The address of the winner who claimed the NFT.
  - `uint256 claimTime`: The timestamp when the NFT was claimed.

## TimeLock Smart Contract Documentation

### Overview
The `TimeLock` contract is designed to lock ERC20 tokens for a specified period. It is primarily used in conjunction with the `MarketPlace` contract to handle staking sell offers.

### Key Features
- **Token Locking**: Allows tokens to be locked for a specified period.
- **Role-Based Access**: Only the marketplace contract can lock tokens.
- **Non-Reentrancy**: Ensures that functions cannot be re-entered while they are still executing.

### Public Functions

#### 1. `deposit(address _token, uint256 _amount, address _user, uint256 _unlockTime)`
- **Parameters:**
  - `address _token`: The address of the ERC20 token to be locked.
  - `uint256 _amount`: The amount of tokens to lock.
  - `address _user`: The address of the user for whom the tokens are being locked.
  - `uint256 _unlockTime`: The Unix timestamp when the tokens will be unlocked.
- **Usage Example:**
  ```javascript
  await timeLockContract.deposit("0xTokenAddress", ethers.parseEther("10"), "0xUserAddress", 1700000000);
  ```

#### 2. `withdraw(uint256 _index)`
- **Parameters:**
  - `uint256 _index`: The index of the locked token entry to withdraw.
- **Usage Example:**
  ```javascript
  await timeLockContract.withdraw(0);
  ```

### Events Description

#### 1. `TokenLocked`
- **Description**: Emitted when tokens are locked.
- **Parameters**:
  - `address indexed user`: The address of the user for whom the tokens are locked.
  - `IERC20 indexed token`: The ERC20 token that was locked.
  - `uint256 amount`: The amount of tokens locked.
  - `uint256 unlockTime`: The timestamp when the tokens will be unlocked.
  - `uint256 index`: The index of the locked token entry.

#### 2. `TokenReleased`
- **Description**: Emitted when tokens are released.
- **Parameters**:
  - `address indexed user`: The address of the user who is withdrawing the tokens.
  - `IERC20 indexed token`: The ERC20 token that was released.
  - `uint256 amount`: The amount of tokens released.
  - `uint256 index`: The index of the locked token entry.

### Modifiers

#### 1. `onlyMarketplaceContract`
- **Description**: Ensures that only the marketplace contract can call the function.
- **Usage Example:**
  ```solidity
  modifier onlyMarketplaceContract() {
      require(hasRole(MARKETPLACE_ROLE, msg.sender), "Caller does not have marketplace role");
      _;
  }
  ```

### Administrative Functions

#### 1. `setMarketplaceContractAddress(address _marketplaceContract)`
- **Description**: Sets a new marketplace contract address and updates the role.
- **Parameters:**
  - `address _marketplaceContract`: The new marketplace contract address.
- **Usage Example:**
  ```javascript
  await timeLockContract.setMarketplaceContractAddress("0xNewMarketplaceAddress");
  ```

This documentation provides an overview of the key functionalities and usage examples for the `MarketPlace` and `TimeLock` smart contracts. For more detailed information, refer to the contract code and comments.
