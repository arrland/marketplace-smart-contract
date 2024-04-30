pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";
import "./TimeLock.sol";

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { IERC20 } from "@openzeppelin/contracts/interfaces/IERC20.sol";

interface IERC20BurnableUpgradeable is IERC20 {
    function burn(uint256 amount) external;
}

contract MarketPlace is Initializable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, ERC1155HolderUpgradeable  {
    using SafeERC20 for IERC20;

    bytes32 public constant BID_SELLOFFER_CREATOR_ROLE = keccak256("BID_SELLOFFER_CREATOR_ROLE");
    bytes32 public constant BUYNOW_SELLOFFER_CREATOR_ROLE = keccak256("BUYNOW_SELLOFFER_CREATOR_ROLE");
    bytes32 public constant STAKE_SELLOFFER_CREATOR_ROLE = keccak256("STAKE_SELLOFFER_CREATOR_ROLE");    

    event NFTClaimed(
        uint256 indexed sellOfferId,
        uint256 indexed tokenId,
        address winnerAddress,
        uint256 claimTime
    );
    event NewSellOfferCreated(
        uint256 sellOfferId,
        uint256 createdAt,
        uint256[] tokenIds,
        address nftAddress,
        uint256 startTime,
        uint256 endTime,
        IERC20 paymentToken,
        uint256 price,
        SellOfferType sellOfferType,
        address payoutAddress,
        bool isERC1155,
        address creatorAddress,
        uint256[] tokenAmounts
    );

    event onBuyOrBid(
        uint256 indexed sellOfferId,
        address nftAddress,
        uint256 price,
        uint256 buyDate,
        uint256 endSaleDate,
        uint256 tokenId,
        SellOfferType sellOfferType,
        address bidderAddress,
        uint256 bidsCount
    );

    event SellOfferPayout(
        uint256 indexed sellOfferId,
        uint256 amount,
        uint256[] tokenIds,
        uint256 payoutDate
    );

    event SellOfferCanceled(uint256 indexed sellOfferId);

    enum SellOfferType {
        BID,
        BUYNOW,
        STAKE
    }

    struct Bid {
        uint256 amt;
        address userAddress;
        uint256 createdAt;
    }

    struct SellOffers {
        mapping(uint256 => Bid[]) tokenBid;
        uint256[] tokenIds;        
        uint256 createdAt;
        address nftAddress;
        uint256 startTime;
        uint256 endTime;
        bool isEnded;
        uint256 price;
        SellOfferType sellOfferType;
        IERC20 paymentToken;
        bytes32 merkleRoot;
        uint256 largestBidLength;
        address payoutAddress;
        bool isERC1155;
        mapping(uint256 => uint256) tokenAmounts; // Only used if isERC1155 is true
        address creatorAddress;
        mapping(uint256 => bool) tokenClaimed;
        mapping(uint256 => uint256) tokenEndTime;
        bool isCanceled;
        bool isPayout;
    }

    struct SellOfferParams {        
        uint256[] tokenIds;
        address nftAddress;
        uint256 startTime;
        uint256 endTime;
        IERC20 paymentToken;
        uint256 price;
        SellOfferType sellOfferType;
        bytes32 merkleRoot;
        address payoutAddress;
        bool isERC1155;
        uint256[] amounts;
    }   

    mapping(uint256 => mapping(uint256 => uint256)) public tokenToTotalBid;
    mapping(address => uint256[]) public sellOffersByCreator;
    mapping(address => bool) public whitelistedNFTs;

    address public timeLock;        

    SellOffers[] public sellOfferDetails;    

    uint256 public TimeExtendOnBid;
    mapping(address => bool) public whitelistedPaymentTokens;

    // Modifier to check if the payment token is whitelisted
    modifier onlyWhitelistedToken(address _token) {
        require(whitelistedPaymentTokens[_token], "Payment token not whitelisted");
        _;
    }

    modifier onlyIfSellOfferExist(uint256 sellOfferId) {
        require(sellOfferId < sellOfferDetails.length, "SellOffer does not exist");
        _;
    }

    modifier checkForBuyNow(SellOffers storage _sellOffer, uint256 tokenId) {
        require(!_sellOffer.isCanceled, "SellOffer has been canceled");
        require(
            _sellOffer.startTime < block.timestamp,
            "SellOffer has not started yet"
        );
        require(
            _sellOffer.endTime > block.timestamp,
            "SellOffer has already ended"
        );
        require(
            checkTokenIdExist(_sellOffer, tokenId),
            "Token ID does not exist in this SellOffer"
        );
        _;
    }

    modifier checkForBid(uint256 sellOfferId, uint256 tokenId) {
        SellOffers storage sellOffer = sellOfferDetails[sellOfferId];
        require(!sellOffer.isCanceled, "SellOffer has been canceled");
        require(sellOffer.startTime < block.timestamp, "SellOffer has not started yet");
        uint256 effectiveEndTime = sellOffer.tokenEndTime[tokenId] == 0 ? sellOffer.endTime : sellOffer.tokenEndTime[tokenId];
        require(effectiveEndTime > block.timestamp, "SellOffer has already ended for this token");
        require(checkTokenIdExist(sellOffer, tokenId), "Token ID does not exist in this sellOffer");
        _;
    }

    modifier onlyAnyRole(bytes32 role1, bytes32 role2, bytes32 role3) {
        require(
            hasRole(role1, _msgSender()) ||
            hasRole(role2, _msgSender()) ||
            hasRole(role3, _msgSender()),
            "AccessControl: sender does not have any of the required roles"
        );
        _;
    }

    function initialize(address _admin, address _whitelistedToken, address[] memory _whitelistedNFTs) external initializer {
        __ReentrancyGuard_init();
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(BID_SELLOFFER_CREATOR_ROLE, _admin);     
        _grantRole(BUYNOW_SELLOFFER_CREATOR_ROLE, _admin);     
        _grantRole(STAKE_SELLOFFER_CREATOR_ROLE, _admin);        
        TimeExtendOnBid = 10*60;   
        whitelistedPaymentTokens[_whitelistedToken] = true;
        for (uint256 i = 0; i < _whitelistedNFTs.length; i++) {
            whitelistedNFTs[_whitelistedNFTs[i]] = true;
        }
    }

    // Handles the transfer of ERC721 tokens
    function _transferERC721Tokens(
        address nftAddress,
        uint256[] memory tokenIds,
        address from,
        address to
    ) internal {
        IERC721 nft721 = IERC721(nftAddress);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            nft721.safeTransferFrom(from, to, tokenIds[i]);
        }
    }

    // Handles the transfer of ERC1155 tokens
    function _transferERC1155Tokens(
        address nftAddress,
        uint256[] memory tokenIds,
        uint256[] memory amounts,
        address from,
        address to
    ) internal {
        IERC1155 nft1155 = IERC1155(nftAddress);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            nft1155.safeTransferFrom(from, to, tokenIds[i], amounts[i], "");
        }
    }

    function createSellOffer(SellOfferParams calldata params) external nonReentrant onlyWhitelistedToken(address(params.paymentToken)) {
        if (params.sellOfferType == SellOfferType.BID) {
            require(hasRole(BID_SELLOFFER_CREATOR_ROLE, _msgSender()), "Must have BID_SELLOFFER_CREATOR_ROLE to create this type of sellOffer");
        } else if (params.sellOfferType == SellOfferType.BUYNOW) {
            require(hasRole(BUYNOW_SELLOFFER_CREATOR_ROLE, _msgSender()), "Must have BUYNOW_SELLOFFER_CREATOR_ROLE to create this type of sellOffer");
        } else if (params.sellOfferType == SellOfferType.STAKE) {
            require(hasRole(STAKE_SELLOFFER_CREATOR_ROLE, _msgSender()), "Must have STAKE_SELLOFFER_CREATOR_ROLE to create this type of sellOffer");
        } else {
            revert("Invalid sellOffer type");
        }
        require(whitelistedNFTs[params.nftAddress], "NFT address not whitelisted");
        require(params.endTime > block.timestamp, "End time must be in the future");        
        require(params.startTime < params.endTime, "Start time must be before end time");    
        require(params.tokenIds.length > 0, "Must include at least one token");
        require(params.amounts.length > 0, "Must include at least one amount");
        require(params.tokenIds.length == params.amounts.length, "Token IDs and amounts length mismatch");
        SellOffers storage _sellOffer = sellOfferDetails.push();
        _sellOffer.createdAt = block.timestamp;        
        _sellOffer.tokenIds = params.tokenIds;
        _sellOffer.nftAddress = params.nftAddress;
        _sellOffer.startTime = params.startTime;
        _sellOffer.endTime = params.endTime;
        _sellOffer.paymentToken = params.paymentToken;
        _sellOffer.price = params.price;
        _sellOffer.sellOfferType = params.sellOfferType;
        _sellOffer.merkleRoot = params.merkleRoot;
        _sellOffer.isPayout = false;
        _sellOffer.isCanceled = false;
        _sellOffer.payoutAddress = params.payoutAddress;
        _sellOffer.isERC1155 = params.isERC1155;
        _sellOffer.creatorAddress = msg.sender;

        uint256 sellOfferId = sellOfferDetails.length - 1;
        sellOffersByCreator[msg.sender].push(sellOfferId);

        // Initialize the tokenAmounts mapping for each tokenId
        if (params.isERC1155) {
            require(params.tokenIds.length == params.amounts.length, "Token IDs and amounts length mismatch");
            for (uint256 i = 0; i < params.tokenIds.length; i++) {
                _sellOffer.tokenAmounts[params.tokenIds[i]] = params.amounts[i];
            }
            _transferERC1155Tokens(params.nftAddress, params.tokenIds, params.amounts, msg.sender, address(this));
        } else {
            for (uint256 i = 0; i < params.tokenIds.length; i++) {
                _sellOffer.tokenAmounts[params.tokenIds[i]] = 1; // For ERC721 tokens, the amount is always 1
            }
            _transferERC721Tokens(params.nftAddress, params.tokenIds, msg.sender, address(this));
        }


        emit NewSellOfferCreated(
            sellOfferId, // Added sellOffer ID here, assuming it's the index of the last sellOffer created
            _sellOffer.createdAt,
            _sellOffer.tokenIds,
            _sellOffer.nftAddress,
            _sellOffer.startTime,
            _sellOffer.endTime,
            _sellOffer.paymentToken,
            _sellOffer.price,
            _sellOffer.sellOfferType,
            _sellOffer.payoutAddress,
            _sellOffer.isERC1155,
            _sellOffer.creatorAddress,
            params.amounts
        );
    }

    function addPaymentTokenToWhitelist(address _token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        whitelistedPaymentTokens[_token] = true;        
    }

    function removePaymentTokenFromWhitelist(address _token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        whitelistedPaymentTokens[_token] = false;        
    }

    function addNFTToWhitelist(address _nftAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        whitelistedNFTs[_nftAddress] = true;
    }

    function removeNFTFromWhitelist(address _nftAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        whitelistedNFTs[_nftAddress] = false;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(AccessControlUpgradeable, ERC1155HolderUpgradeable) returns (bool) {
        return AccessControlUpgradeable.supportsInterface(interfaceId) || ERC1155HolderUpgradeable.supportsInterface(interfaceId);
    }

    function removeSellOfferIdFromCreatorMapping(uint256 sellOfferId, address creator) internal {
        uint256[] storage offerIds = sellOffersByCreator[creator];
        for (uint256 i = 0; i < offerIds.length; i++) {
            if (offerIds[i] == sellOfferId) {
                offerIds[i] = offerIds[offerIds.length - 1];
                offerIds.pop();
                break;
            }
        }
    }

    function findUserBidIndex(
        Bid[] memory bids,
        address user
    ) internal pure returns (int256) {
        for (uint256 i = 0; i < bids.length; i++) {
            if (bids[i].userAddress == user) {
                return int256(i);
            }
        }
        return -1;
    }

    function _verifyMerkleProof(bytes32 merkleRoot, bytes32[] memory proof, address bidder) internal pure {
        if (merkleRoot != bytes32(0)) {
            bytes32 leaf = keccak256(abi.encodePacked(bidder));
            require(
                MerkleProof.verify(proof, merkleRoot, leaf),
                "Invalid Merkle Proof."
            );    
        }        
    }

    function _updateBid(Bid[] storage bids, uint256 amt, address bidder, IERC20 paymentToken) internal {
        uint256 size = bids.length;
        if (size == 0) {
            bids.push(Bid({amt: amt, userAddress: bidder, createdAt: block.timestamp}));
        } else {
            // Assuming the last bid is the highest bid
            Bid storage lastBid = bids[size - 1];
            require(
                    lastBid.amt < amt,
                    "New bid is not higher than the current highest bid."
            );
            require(
                lastBid.userAddress != msg.sender,
                "You already made a bid"
            );            
            // Update the bid to the new highest bidder
            bids.push(Bid({amt: amt, userAddress: bidder, createdAt: block.timestamp}));
            // Refund the previous highest bid
            paymentToken.safeTransfer(lastBid.userAddress, lastBid.amt);
        }
    }

    function _updateSellOfferBidLength(uint256 sellOfferId, uint256 tokenId) internal {
        SellOffers storage _sellOffer = sellOfferDetails[sellOfferId];
        uint256 totalBidLength = ++tokenToTotalBid[sellOfferId][tokenId];
        _sellOffer.largestBidLength = _sellOffer.largestBidLength < totalBidLength ? totalBidLength : _sellOffer.largestBidLength;
    }

    function _hasSellOfferEndedForToken(uint256 sellOfferId, uint256 tokenId) internal view returns (bool) {
        SellOffers storage _sellOffer = sellOfferDetails[sellOfferId];
        return block.timestamp > _sellOffer.tokenEndTime[tokenId];
    }

    function _checkERC1155Receiver(address to, uint256 tokenId, uint256 amount, bytes memory data) internal {
        if (isContract(to)) {
            require(
                IERC1155Receiver(to).onERC1155Received(address(this), address(0), tokenId, amount, data) == IERC1155Receiver.onERC1155Received.selector,
                "ERC1155: transfer to non ERC1155Receiver implementer"
            );
        }
    }

    function placeBid(
        uint256 sellOfferId,
        uint256 tokenId,
        uint256 amount,
        bytes32[] memory proof
    )
        external
        nonReentrant
        onlyIfSellOfferExist(sellOfferId)
        checkForBid(sellOfferId, tokenId)
    {
        
        SellOffers storage _sellOffer = sellOfferDetails[sellOfferId];
        require(
            _sellOffer.sellOfferType == SellOfferType.BID ||
                _sellOffer.sellOfferType == SellOfferType.STAKE,
            "Can't place bid."
        );
        if (_sellOffer.isERC1155) {
            _checkERC1155Receiver(msg.sender, tokenId, 1, "");  // Assuming 'amount' for ERC11155 is 1 for bid check
        }
        _verifyMerkleProof(_sellOffer.merkleRoot, proof, msg.sender);
        require(amount >= _sellOffer.price, "Amount should be greater than price");
 
        Bid[] storage bids = _sellOffer.tokenBid[tokenId];
        IERC20 paymentToken = _sellOffer.paymentToken;
        _updateBid(bids, amount, msg.sender, paymentToken);
        paymentToken.safeTransferFrom(msg.sender, address(this), amount);
        _updateSellOfferBidLength(sellOfferId, tokenId);
        if (_sellOffer.tokenEndTime[tokenId] == 0) {
            _sellOffer.tokenEndTime[tokenId] = _sellOffer.endTime + TimeExtendOnBid;
        } else {
            _sellOffer.tokenEndTime[tokenId] = _sellOffer.tokenEndTime[tokenId] + TimeExtendOnBid;
        }

        emit onBuyOrBid(
            sellOfferId,
            _sellOffer.nftAddress,
            amount,
            block.timestamp,
            _sellOffer.tokenEndTime[tokenId],
            tokenId,
            _sellOffer.sellOfferType,
            msg.sender,
            bids.length
        );
    }

    function buyNow(
        uint256 sellOfferId,
        uint256 tokenId,
        bytes32[] memory proof
    )
        external
        nonReentrant
        onlyIfSellOfferExist(sellOfferId)
        checkForBuyNow(sellOfferDetails[sellOfferId], tokenId)
    {
        SellOffers storage _sellOffer = sellOfferDetails[sellOfferId];
        require(_sellOffer.sellOfferType == SellOfferType.BUYNOW, "SellOffer type is not Buy Now.");
        _verifyMerkleProof(_sellOffer.merkleRoot, proof, msg.sender);
        if (_sellOffer.isERC1155) {
            _checkERC1155Receiver(msg.sender, tokenId, 1, "");  // Assuming 'amount' for ERC11155 is 1 for bid check
        }
        Bid[] storage bids = _sellOffer.tokenBid[tokenId];
        require(bids.length == 0, "Already bought");
        bids.push(Bid({amt: _sellOffer.price, userAddress: msg.sender, createdAt: block.timestamp}));
        IERC20 paymentToken = _sellOffer.paymentToken;
        if (_sellOffer.payoutAddress == address(0)) {
            bytes4 methodId = bytes4(keccak256("burnFrom(address,uint256)"));
            bytes memory data = abi.encodeWithSelector(methodId, msg.sender, _sellOffer.price);

            // Perform a low-level call to attempt to call `burnFrom`
            (bool success, ) = address(paymentToken).call(data);

            if (success) {                
                // If the burnFrom call was successful, do nothing more here
            } else {
                // If the burnFrom call was not successful, transfer tokens normally
                paymentToken.safeTransferFrom(msg.sender, _sellOffer.creatorAddress, _sellOffer.price);
            }
        } else {
            paymentToken.safeTransferFrom(msg.sender, _sellOffer.payoutAddress, _sellOffer.price);
        }
        _transferTokenToWinner(_sellOffer, tokenId, msg.sender);
        
        emit onBuyOrBid(
            sellOfferId,
            _sellOffer.nftAddress,
            _sellOffer.price,
            block.timestamp,
            block.timestamp,
            tokenId,
            _sellOffer.sellOfferType,
            msg.sender,
            bids.length
        );
    }

    function cancel(uint256 sellOfferId) external nonReentrant {
        SellOffers storage sellOffer = sellOfferDetails[sellOfferId];
        require(!sellOffer.isCanceled, "SellOffer is already canceled");
        require(msg.sender == sellOffer.creatorAddress, "Only the creator can cancel the sellOffer");
        require(block.timestamp <= sellOffer.endTime, "Cancellation period has ended");
        for (uint256 i = 0; i < sellOffer.tokenIds.length; i++) {
            require(sellOffer.tokenBid[sellOffer.tokenIds[i]].length == 0, "SellOffer has bids");
        }
        removeSellOfferIdFromCreatorMapping(sellOfferId, msg.sender);

        sellOffer.isCanceled = true;

        // Return any tokens or NFTs locked in the sellOffer to the creator
        for (uint256 i = 0; i < sellOffer.tokenIds.length; i++) {
            if (sellOffer.isERC1155) {
                IERC1155(sellOffer.nftAddress).safeTransferFrom(address(this), sellOffer.creatorAddress, sellOffer.tokenIds[i], sellOffer.tokenAmounts[sellOffer.tokenIds[i]], "");
            } else {
                IERC721(sellOffer.nftAddress).safeTransferFrom(address(this), sellOffer.creatorAddress, sellOffer.tokenIds[i]);
            }
        }

        emit SellOfferCanceled(sellOfferId);
    }

    function payout(uint256 sellOfferId) public {
        SellOffers storage _sellOffer = sellOfferDetails[sellOfferId];
        require(_sellOffer.sellOfferType == SellOfferType.BID || _sellOffer.sellOfferType == SellOfferType.STAKE, "Payout is only allowed for BID or STAKE type SellOffers");
        require(!_sellOffer.isPayout, "SellOffer is already payout");
        require(msg.sender == _sellOffer.creatorAddress, "Only the creator can payout");
        require(!_sellOffer.isCanceled && (_sellOffer.endTime + _sellOffer.largestBidLength * TimeExtendOnBid < block.timestamp), "SellOffer can't be payout");

        // Cache frequently accessed storage variables in memory
        uint256[] memory tokenIds = _sellOffer.tokenIds;
        mapping(uint256 => Bid[]) storage tokenBid = _sellOffer.tokenBid;

  
        removeSellOfferIdFromCreatorMapping(sellOfferId, msg.sender);
        _sellOffer.isPayout = true;

        IERC20 paymentToken = _sellOffer.paymentToken;        
        uint256 totalTokenToSend = 0;

        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            Bid[] storage bids = tokenBid[tokenId];
            uint256 size = bids.length;
            if (size > 0) {
                totalTokenToSend += bids[size - 1].amt;                
            } else {
                // If no bids were placed, return the NFT to the creator
                if (_sellOffer.isERC1155) {
                    IERC1155(_sellOffer.nftAddress).safeTransferFrom(address(this), _sellOffer.creatorAddress, tokenId, _sellOffer.tokenAmounts[tokenId], "");
                } else {
                    IERC721(_sellOffer.nftAddress).safeTransferFrom(address(this), _sellOffer.creatorAddress, tokenId);
                }
            }
        }
        
        if (totalTokenToSend > 0 && _sellOffer.sellOfferType == SellOfferType.BID && _sellOffer.payoutAddress != address(0)) {
            paymentToken.safeTransfer(_sellOffer.payoutAddress, totalTokenToSend);
        }
        emit SellOfferPayout(sellOfferId, totalTokenToSend, tokenIds, block.timestamp);
    }

    function getSellOffersNeedingPayoutForCreator(address creatorAddress) external view returns (uint256[] memory) {
        uint256[] storage offerIds = sellOffersByCreator[creatorAddress];
        uint256[] memory tempSellOfferIds = new uint256[](offerIds.length);
        uint256 count = 0;

        for (uint256 i = 0; i < offerIds.length; i++) {
            SellOffers storage sellOffer = sellOfferDetails[offerIds[i]];
            bool isPayoutEligible = !sellOffer.isPayout && !sellOffer.isCanceled && 
                                    (sellOffer.endTime + sellOffer.largestBidLength * TimeExtendOnBid < block.timestamp);
            if (isPayoutEligible) {
                tempSellOfferIds[count++] = offerIds[i];
            }
        }

        uint256[] memory sellOfferIds = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            sellOfferIds[i] = tempSellOfferIds[i];
        }

        return sellOfferIds;
    }

    function payoutSellOffersForCreator(uint256 numberOfSellOffers) external nonReentrant {
        uint256[] memory sellOfferIds = this.getSellOffersNeedingPayoutForCreator(msg.sender);
        uint256 count = sellOfferIds.length;
        require(numberOfSellOffers <= count, "Number of sell offers to payout exceeds the total number of sell offers.");

        // Start from the last sell offer and move backwards, processing up to the specified number of sell offers
        uint256 limit = numberOfSellOffers < count ? numberOfSellOffers : count;
        for (uint256 i = count; i > count - limit-1; i--) {
            uint256 sellOfferId = sellOfferIds[i - 1];
            SellOffers storage sellOffer = sellOfferDetails[sellOfferId];
            require(sellOffer.creatorAddress == msg.sender, "Caller is not the creator of this sell offer.");
            payout(sellOfferId);
        }
    }

    function claimNFT(uint256 sellOfferId, uint256 tokenId) external nonReentrant {
        SellOffers storage _sellOffer = sellOfferDetails[sellOfferId];
        require(_sellOffer.sellOfferType != SellOfferType.BUYNOW, "Claiming not allowed for BUYNOW SellOffers");

        require(!_sellOffer.tokenClaimed[tokenId], "NFT already claimed");        
        require(_hasSellOfferEndedForToken(sellOfferId, tokenId), "SellOffer not yet ended");
        
        Bid[] storage bids = _sellOffer.tokenBid[tokenId];
        require(bids.length > 0, "No bids for this token");
        Bid storage winningBid = bids[bids.length - 1];
        uint256 amount = winningBid.amt;
        
        require(msg.sender == winningBid.userAddress, "Caller is not the winner");
        _sellOffer.tokenClaimed[tokenId] = true;
        IERC20 paymentToken = _sellOffer.paymentToken;
        // If the sellOffer type is STAKE, lock the payment token in the TimeLock contract
        if (_sellOffer.sellOfferType == SellOfferType.STAKE) {            
            
            paymentToken.approve(address(timeLock), amount);
            TimeLock(timeLock).deposit(address(paymentToken), amount, winningBid.userAddress);
        } else {
            if (_sellOffer.payoutAddress == address(0)) {
                IERC20BurnableUpgradeable(address(paymentToken)).burn(amount);
            }
        }
        _transferTokenToWinner(_sellOffer, tokenId, winningBid.userAddress);

        emit NFTClaimed(sellOfferId, tokenId, winningBid.userAddress, block.timestamp);
    }

    function _transferTokenToWinner(SellOffers storage _sellOffer, uint256 tokenId, address winnerAddress) internal {
        if (_sellOffer.isERC1155) {
            IERC1155(_sellOffer.nftAddress).safeTransferFrom(address(this), winnerAddress, tokenId, _sellOffer.tokenAmounts[tokenId], "");
        } else {
            IERC721(_sellOffer.nftAddress).safeTransferFrom(address(this), winnerAddress, tokenId);
        }
    }

    function isContract(address account) internal view returns (bool) {
        uint256 size;
        assembly { size := extcodesize(account) }
        return size > 0;
    }

    function getTokenBid(
        uint256 sellOfferId,
        uint256 tokenId
    ) external view returns (Bid[] memory bids) {
        bids = sellOfferDetails[sellOfferId].tokenBid[tokenId];
    }

    function getTokenIds(
        uint256 sellOfferId
    ) external view returns (uint256[] memory tokenIds) {
        return sellOfferDetails[sellOfferId].tokenIds;
    }

    function getTokenLastBid(
        uint256 sellOfferId,
        uint256 tokenId
    ) external view returns (Bid memory bid, uint256 numOfOffer) {
        Bid[] memory bids = sellOfferDetails[sellOfferId].tokenBid[tokenId];
        if (bids.length == 0) return (bid, 0);
        bid = bids[bids.length - 1];
        numOfOffer = bids.length;
    }

    function currentsellOfferId() external view returns (uint256) {
        return sellOfferDetails.length-1;
    }



    function checkTokenIdExist(
        SellOffers storage _sellOffer,
        uint256 tokenId
    ) internal view returns (bool) {
        for (uint256 i = 0; i < _sellOffer.tokenIds.length; i++) {
            if (_sellOffer.tokenIds[i] == tokenId) {
                return true;
            }
        }
        return false;
    }

    function setTimeExtendOnBid(uint256 _TimeExtendOnBid) public onlyRole(DEFAULT_ADMIN_ROLE) {
        TimeExtendOnBid = _TimeExtendOnBid;
    }

    function setTimeLockAddress(address _timeLock) public onlyRole(DEFAULT_ADMIN_ROLE) {
        timeLock = _timeLock;
    }
}




