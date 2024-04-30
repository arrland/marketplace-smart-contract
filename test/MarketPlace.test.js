const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");


describe("SellOffer", function () {
    let sellOffer, simpleERC1155, dummyToken, marketPlace;
    let deployer, bidder, payoutAddress, bidAuctionCreator, buyNowAuctionCreator, stakeAuctionCreator, unauthorizedUser;
    let otherBidder;
    let SellOfferParams;
    let auctionAddress;
    let timeLockAddress;
    let timeLock;

    beforeEach(async function () {
        // Get signers
        [deployer, bidder, payoutAddress, bidAuctionCreator, buyNowAuctionCreator, stakeAuctionCreator, unauthorizedUser, otherBidder] = await ethers.getSigners();

        // Deploy DummyToken (ERC20) for payments
        const DummyToken = await ethers.getContractFactory("DummyToken");
        dummyToken = await DummyToken.deploy(ethers.parseEther("10000"));
        const dummyTokenAddress = await dummyToken.getAddress();
       
        // Deploy SimpleERC1155 (ERC11155) for NFTs
        const SimpleERC1155 = await ethers.getContractFactory("SimpleERC1155");
        simpleERC1155 = await SimpleERC1155.deploy(deployer.address);

        // Deploy SellOffer contract
        const MarketPlace = await ethers.getContractFactory("MarketPlace");
        marketPlace = await upgrades.deployProxy(MarketPlace, [deployer.address, dummyTokenAddress, [await simpleERC1155.getAddress()]], {initializer: 'initialize'});
        auctionAddress = await marketPlace.getAddress();

        const DummyNonReceiver = await ethers.getContractFactory("DummyNonReceiver");
        dummyNonReceiver = await DummyNonReceiver.deploy(auctionAddress);
        dummyNonReceiverAddress = await dummyNonReceiver.getAddress();

        // Mint DummyToken to bidder for testing
        await dummyToken.transfer(bidder.address, ethers.parseEther("1000"));
        await dummyToken.transfer(otherBidder.address, ethers.parseEther("1000"));

        // Mint NFT to SellOffer contract for auctioning
        await simpleERC1155.mint(deployer.address, 1, 1, ethers.toUtf8Bytes(""));
        await simpleERC1155.mint(bidAuctionCreator.address, 2, 1, ethers.toUtf8Bytes(""));
        await simpleERC1155.mint(buyNowAuctionCreator.address, 3, 1, ethers.toUtf8Bytes(""));
        await simpleERC1155.mint(stakeAuctionCreator.address, 4, 1, ethers.toUtf8Bytes(""));

        

        const TimeLock = await ethers.getContractFactory("TimeLock");
        timeLock = await TimeLock.deploy(deployer.address, 0, auctionAddress);
        timeLockAddress = await timeLock.getAddress();

        await marketPlace.setTimeLockAddress(timeLockAddress);

        
        await simpleERC1155.connect(deployer).setApprovalForAll(auctionAddress, true);
        await simpleERC1155.connect(bidAuctionCreator).setApprovalForAll(auctionAddress, true);
        await simpleERC1155.connect(buyNowAuctionCreator).setApprovalForAll(auctionAddress, true);
        await simpleERC1155.connect(stakeAuctionCreator).setApprovalForAll(auctionAddress, true);

        const BID_SELLOFFER_CREATOR_ROLE = await marketPlace.BID_SELLOFFER_CREATOR_ROLE();
        const BUYNOW_SELLOFFER_CREATOR_ROLE = await marketPlace.BUYNOW_SELLOFFER_CREATOR_ROLE();
        const STAKE_SELLOFFER_CREATOR_ROLE = await marketPlace.STAKE_SELLOFFER_CREATOR_ROLE();

        // Grant roles to specific accounts
        await marketPlace.connect(deployer).grantRole(BID_SELLOFFER_CREATOR_ROLE, bidAuctionCreator.address);
        await marketPlace.connect(deployer).grantRole(BUYNOW_SELLOFFER_CREATOR_ROLE, buyNowAuctionCreator.address);
        await marketPlace.connect(deployer).grantRole(STAKE_SELLOFFER_CREATOR_ROLE, stakeAuctionCreator.address);
        
        SellOfferParams = await generateSellOfferParams([1]);
    });

    async function advanceTimeTo(targetTimestamp) {
        const currentBlock = await ethers.provider.getBlock('latest');
        const currentTime = currentBlock.timestamp;
        const timeToAdvance = targetTimestamp - currentTime;
        if (timeToAdvance > 0) {
          await ethers.provider.send("evm_increaseTime", [timeToAdvance]);
          await ethers.provider.send("evm_mine");
        }
    }

    async function generateSellOfferParams(tokenIds, sellOfferType = "BID", isERC1155 = true, amounts = [], startTimeOffset = 60, endTimeOffset = 86400) {
        let sellOfferTypeValue;
        if (sellOfferType === "BID") {
            sellOfferTypeValue = 0;
        } else if (sellOfferType === "BUYNOW") {
            sellOfferTypeValue = 1;
        } else if (sellOfferType === "STAKE") {
            sellOfferTypeValue = 2;
        } else {
            sellOfferTypeValue = 99;
        }

        if (amounts.length === 0) {
            amounts = tokenIds.map(() => 1); // Default to 1 unit per tokenId if not specified
        }

        const currentBlock = await ethers.provider.getBlock('latest');
        const currentTimestamp = currentBlock.timestamp+1;
        const startTime = currentTimestamp + startTimeOffset; // Default 1 minute from now
        const endTime = currentTimestamp + endTimeOffset; // Default 1 day from now

        return {
            tokenIds: tokenIds,
            nftAddress: await simpleERC1155.getAddress(),
            startTime: startTime,
            endTime: endTime,
            paymentToken: await dummyToken.getAddress(),
            price: ethers.parseEther("5"),
            sellOfferType: sellOfferTypeValue,
            payoutAddress: payoutAddress.address,
            isERC1155: isERC1155,
            amounts: amounts,
            merkleRoot: "0x" + "0".repeat(64)
        };
    }
    

    describe("Deployment", function () {
        it("Should assign the DEFAULT_ADMIN_ROLE to the deployer", async function () {
            const DEFAULT_ADMIN_ROLE = await marketPlace.DEFAULT_ADMIN_ROLE();
            expect(await marketPlace.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)).to.be.true;
        });
        it("Should assign the BID_SELLOFFER_CREATOR_ROLE to the deployer", async function () {
            const BID_SELLOFFER_CREATOR_ROLE = await marketPlace.BID_SELLOFFER_CREATOR_ROLE();
            expect(await marketPlace.hasRole(BID_SELLOFFER_CREATOR_ROLE, deployer.address)).to.be.true;
        });

        it("Should assign the BUYNOW_SELLOFFER_CREATOR_ROLE to the deployer", async function () {
            const BUYNOW_SELLOFFER_CREATOR_ROLE = await marketPlace.BUYNOW_SELLOFFER_CREATOR_ROLE();
            expect(await marketPlace.hasRole(BUYNOW_SELLOFFER_CREATOR_ROLE, deployer.address)).to.be.true;
        });

        it("Should assign the STAKE_SELLOFFER_CREATOR_ROLE to the deployer", async function () {
            const STAKE_SELLOFFER_CREATOR_ROLE = await marketPlace.STAKE_SELLOFFER_CREATOR_ROLE();
            expect(await marketPlace.hasRole(STAKE_SELLOFFER_CREATOR_ROLE, deployer.address)).to.be.true;
        });
    });

    describe("SellOffer Creation", function () {
        it("Should allow whitelisting NFTs for selling", async function () {
            const nftAddressToAdd = await simpleERC1155.getAddress();
            await marketPlace.connect(deployer).addNFTToWhitelist(nftAddressToAdd);
            // Check if the NFT address is now whitelisted
            expect(await marketPlace.whitelistedNFTs(nftAddressToAdd)).to.be.true;
        });

        it("Should allow removing NFTs from whitelist", async function () {
            const nftAddressToRemove = await simpleERC1155.getAddress();
            // First add to whitelist
            await marketPlace.connect(deployer).addNFTToWhitelist(nftAddressToRemove);
            // Then remove from whitelist
            await marketPlace.connect(deployer).removeNFTFromWhitelist(nftAddressToRemove);
            // Check if the NFT address is now not whitelisted
            expect(await marketPlace.whitelistedNFTs(nftAddressToRemove)).to.be.false;
        });
        it("Should not allow creating a sell offer with an NFT address that is not whitelisted", async function () {
            const SimpleERC1155 = await ethers.getContractFactory("SimpleERC1155");
            const nonWhitelistedNFT = await SimpleERC1155.deploy(deployer.address);
            const nonWhitelistedNFTAddress = await nonWhitelistedNFT.getAddress();
            const invalidSellOfferParams = await generateSellOfferParams([15], "BID", true, [1]);
            invalidSellOfferParams.nftAddress = nonWhitelistedNFTAddress;

            await expect(marketPlace.connect(deployer).createSellOffer(invalidSellOfferParams))
                .to.be.revertedWith("NFT address not whitelisted");
        });
        it("Should create a new sellOffer correctly", async function () {                
            const tx = await marketPlace.connect(deployer).createSellOffer(SellOfferParams);
            await tx.wait();

            // Fetch the newly created sellOffer details
            const newsellOfferId = await marketPlace.currentsellOfferId();
            console.log("New SellOffer ID:", newsellOfferId.toString());
            const createdAuction = await marketPlace.sellOfferDetails(newsellOfferId); // Adjust for zero-based indexing

            // Verify the sellOffer details
            expect(createdAuction.nftAddress).to.equal(SellOfferParams.nftAddress);
            expect(createdAuction.startTime).to.equal(SellOfferParams.startTime);
            expect(createdAuction.endTime).to.equal(SellOfferParams.endTime);
            expect(createdAuction.paymentToken).to.equal(SellOfferParams.paymentToken);
            expect(createdAuction.price.toString()).to.equal(SellOfferParams.price.toString());
            expect(createdAuction.payoutAddress).to.equal(SellOfferParams.payoutAddress);
            expect(createdAuction.isERC1155).to.equal(SellOfferParams.isERC1155);
                

        });

        it("Should allow all roles to add new sellOffer after assigning roles", async function () {    
            // Generate sellOffer parameters for each role
            const bidAuctionCreatorSellOfferParams = await generateSellOfferParams([2], "BID");
            const buyNowAuctionCreatorSellOfferParams = await generateSellOfferParams([3], "BUYNOW");
            const stakeAuctionCreatorSellOfferParams = await generateSellOfferParams([4], "STAKE");
    
            // Test for BID_SELLOFFER_CREATOR_ROLE
            await expect(await marketPlace.connect(bidAuctionCreator).createSellOffer(bidAuctionCreatorSellOfferParams))
                .to.emit(marketPlace, 'NewSellOfferCreated');

            let newsellOfferId = await marketPlace.currentsellOfferId();
            const bidAuction = await marketPlace.sellOfferDetails(newsellOfferId);
                
            expect(bidAuction.sellOfferType).to.equal(bidAuctionCreatorSellOfferParams.sellOfferType);

            // Test for BUYNOW_SELLOFFER_CREATOR_ROLE
            await expect(marketPlace.connect(buyNowAuctionCreator).createSellOffer(buyNowAuctionCreatorSellOfferParams))
                .to.emit(marketPlace, 'NewSellOfferCreated');

            newsellOfferId = await marketPlace.currentsellOfferId();
            const buyNowAuction = await marketPlace.sellOfferDetails(newsellOfferId);
                
            expect(buyNowAuction.sellOfferType).to.equal(buyNowAuctionCreatorSellOfferParams.sellOfferType);

            // Test for STAKE_SELLOFFER_CREATOR_ROLE
            await expect(marketPlace.connect(stakeAuctionCreator).createSellOffer(stakeAuctionCreatorSellOfferParams))
                .to.emit(marketPlace, 'NewSellOfferCreated');
            newsellOfferId = await marketPlace.currentsellOfferId();
            const stakeAuction = await marketPlace.sellOfferDetails(newsellOfferId);
                
            expect(stakeAuction.sellOfferType).to.equal(stakeAuctionCreatorSellOfferParams.sellOfferType);
        });

        it("Should not allow users without BID_SELLOFFER_CREATOR_ROLE to add bid auctions", async function () {
            const unauthorizedBidSellOfferParams = await generateSellOfferParams([5], "BID");
            await expect(marketPlace.connect(unauthorizedUser).createSellOffer(unauthorizedBidSellOfferParams))
                .to.be.revertedWith("Must have BID_SELLOFFER_CREATOR_ROLE to create this type of sellOffer");
        });

        it("Should not allow users without BUYNOW_SELLOFFER_CREATOR_ROLE to add buy now auctions", async function () {
            const unauthorizedBuyNowSellOfferParams = await generateSellOfferParams([6], "BUYNOW");
            await expect(marketPlace.connect(unauthorizedUser).createSellOffer(unauthorizedBuyNowSellOfferParams))
                .to.be.revertedWith("Must have BUYNOW_SELLOFFER_CREATOR_ROLE to create this type of sellOffer");
        });

        it("Should not allow users without STAKE_SELLOFFER_CREATOR_ROLE to add stake auctions", async function () {
            const unauthorizedStakeSellOfferParams = await generateSellOfferParams([7], "STAKE");
            await expect(marketPlace.connect(unauthorizedUser).createSellOffer(unauthorizedStakeSellOfferParams))
                .to.be.revertedWith("Must have STAKE_SELLOFFER_CREATOR_ROLE to create this type of sellOffer");
        });

        it("Should revert createSellOffer if end time is not in the future", async function () {
            const currentTimestamp = await ethers.provider.getBlock('latest');
            const startTime = currentTimestamp.timestamp + 60; // Start time 60 seconds from now
            const endTime = currentTimestamp.timestamp - 100; // End time 100 seconds in the past
            const futureSellOfferParams = await generateSellOfferParams([8], "BID", true, [1]);
            futureSellOfferParams.startTime = startTime;
            futureSellOfferParams.endTime = endTime;
            await expect(marketPlace.connect(bidAuctionCreator).createSellOffer(futureSellOfferParams))
                .to.be.revertedWith("End time must be in the future");
        });

        it("Should revert createSellOffer with no tokenIds", async function () {
            const noTokenIdsSellOfferParams = await generateSellOfferParams([], "BID");            
            await expect(marketPlace.connect(bidAuctionCreator).createSellOffer(noTokenIdsSellOfferParams))
                .to.be.revertedWith("Must include at least one token");
        });

        it("Should revert createSellOffer with invalid marketPlace type", async function () {
            const invalidSellOfferParams = await generateSellOfferParams([11], "INVALID_TYPE");            
            await expect(marketPlace.connect(bidAuctionCreator).createSellOffer(invalidSellOfferParams))
                .to.be.reverted;
        });

        it("Should revert createSellOffer if start time is not before end time", async function () {
            const invalidTimeSellOfferParams = await generateSellOfferParams([9], "BID", true, [1]);
            const futureEndTime = (await ethers.provider.getBlock('latest')).timestamp + 86400; // 1 day in the future
            const startTime = futureEndTime + 1; // Set start time after end time
            invalidTimeSellOfferParams.startTime = startTime;
            invalidTimeSellOfferParams.endTime = futureEndTime;            
            await expect(marketPlace.connect(bidAuctionCreator).createSellOffer(invalidTimeSellOfferParams))
                .to.be.revertedWith("Start time must be before end time");
        });

        it("Should revert createSellOffer for ERC1155 auctions if tokenIds and amounts length mismatch", async function () {
            const mismatchedAmountsSellOfferParams = await generateSellOfferParams([10, 11], "BID", true, [1]); // Only one amount for two tokenIds
            await expect(marketPlace.connect(bidAuctionCreator).createSellOffer(mismatchedAmountsSellOfferParams))
                .to.be.revertedWith("Token IDs and amounts length mismatch");
        });

        it("Should correctly transfer ERC1155 tokens from the sellOffer creator to the marketPlace contract", async function () {
            const tokenIds = [12, 13];
            const amounts = [3, 5];
            const erc1155SellOfferParams = await generateSellOfferParams(tokenIds, "BID", true, amounts);
            
            // Simulate the sellOffer creator minting tokens to themselves before creating the sellOffer
            await simpleERC1155.mint(bidAuctionCreator.address, tokenIds[0], amounts[0], ethers.toUtf8Bytes(""));
            await simpleERC1155.mint(bidAuctionCreator.address, tokenIds[1], amounts[1], ethers.toUtf8Bytes(""));

            // Approve the marketPlace contract to transfer ERC1155 tokens on behalf of the sellOffer creator
            await simpleERC1155.connect(bidAuctionCreator).setApprovalForAll(auctionAddress, true);

            // Start the sellOffer with the specified parameters
            await marketPlace.connect(bidAuctionCreator).createSellOffer(erc1155SellOfferParams);

            // Check that the marketPlace contract now holds the correct amount of each token
            const balanceToken1 = await simpleERC1155.balanceOf(auctionAddress, tokenIds[0]);
            const balanceToken2 = await simpleERC1155.balanceOf(auctionAddress, tokenIds[1]);

            expect(balanceToken1).to.equal(BigInt(amounts[0]));
            expect(balanceToken2).to.equal(BigInt(amounts[1]));
        });

        it("Should only allow auctions to be created with whitelisted payment tokens", async function () {
            const nonWhitelistedToken = await ethers.getContractFactory("DummyToken");
            const nonWhitelistedTokenInstance = await nonWhitelistedToken.deploy(ethers.parseEther("1000"));
        
            const nonWhitelistedTokenAddress = await nonWhitelistedTokenInstance.getAddress();

            const invalidSellOfferParams = await generateSellOfferParams([10], "BID", true, [1], 60, 86400);
            invalidSellOfferParams.paymentToken = nonWhitelistedTokenAddress;

            await expect(marketPlace.connect(bidAuctionCreator).createSellOffer(invalidSellOfferParams))
                .to.be.revertedWith("Payment token not whitelisted");

            // Now test with a whitelisted token
            await simpleERC1155.mint(bidAuctionCreator.address, 13, 1, ethers.toUtf8Bytes(""));
            const validSellOfferParams = await generateSellOfferParams([13], "BID");
            validSellOfferParams.paymentToken = await dummyToken.getAddress();

            await expect(marketPlace.connect(bidAuctionCreator).createSellOffer(validSellOfferParams))
                .to.emit(marketPlace, 'NewSellOfferCreated');          
        });        
    });

    describe("Bidding", function () {
        let startTime, endTime;
        beforeEach(async function () {
            await simpleERC1155.mint(bidAuctionCreator.address, 20, 1, ethers.toUtf8Bytes(""));
            await simpleERC1155.mint(buyNowAuctionCreator.address, 21, 1, ethers.toUtf8Bytes(""));
            await simpleERC1155.mint(stakeAuctionCreator.address, 22, 1, ethers.toUtf8Bytes(""));
            const bidSellOfferParams = await generateSellOfferParams([20], "BID", true, [1]);

            startTime = bidSellOfferParams.startTime;
            endTime = bidSellOfferParams.endTime;
            
            await expect(marketPlace.connect(bidAuctionCreator).createSellOffer(bidSellOfferParams))
                .to.emit(marketPlace, 'NewSellOfferCreated');
            
        });

        it("Should fail when dummyNonReceiver attempts to buy now", async function () {
            const sellOfferId = await marketPlace.currentsellOfferId();
            await advanceTimeTo(startTime + 1);
                
            await expect(
                dummyNonReceiver.attemptBuyNow(sellOfferId, 20, [])
            ).to.be.reverted;
        
        });

        it("Should fail when dummyNonReceiver attempts to place a bid", async function () {
            
            const sellOfferId = await marketPlace.currentsellOfferId();
            await advanceTimeTo(startTime + 1);
            
            await expect(
                dummyNonReceiver.attemptPlaceBid(sellOfferId, 20, ethers.parseEther("10"), [])
            ).to.be.reverted;
        });

        it("Should allow users to place bids on an sellOffer of BID type", async function () {
            const sellOfferId = await marketPlace.currentsellOfferId();
            const tokenId = 20; // Assuming a token with ID 20 is part of the sellOffer
            const bidAmount = ethers.parseEther("10"); // Bid amount in ether

            // Fetch the marketPlace details to ensure it's a BID type sellOffer
            const auctionDetails = await marketPlace.sellOfferDetails(sellOfferId);
            expect(auctionDetails.sellOfferType).to.equal(0n);

            await advanceTimeTo(startTime + 1);

            // Approve the marketPlace contract to spend the bid amount on behalf of the bidder
            await dummyToken.connect(bidder).approve(auctionAddress, bidAmount);
            const block = await ethers.provider.getBlock('latest');
            // Place a bid
            await expect(marketPlace.connect(bidder).placeBid(sellOfferId, tokenId, bidAmount, []))
                .to.emit(marketPlace, 'onBuyOrBid');
            // Verify the bid was recorded
            const bids = await marketPlace.getTokenBid(sellOfferId, tokenId);
            expect(bids.length).to.equal(1);
            expect(bids[0].amt).to.equal(bidAmount);
            expect(bids[0].userAddress).to.equal(bidder.address);
        });

        it("Should reject bids on non-existent auctions", async function () {
            const nonExistentsellOfferId = 9999; // Assuming this sellOffer ID does not exist
            const tokenId = 20; // Assuming a token with ID 20
            const bidAmount = ethers.parseEther("5"); // Bid amount in ether

            // Attempt to place a bid on a non-existent sellOffer
            await expect(marketPlace.connect(bidder).placeBid(nonExistentsellOfferId, tokenId, bidAmount, []))
                .to.be.revertedWith("SellOffer does not exist");
        });

        it("Should reject bids placed before the sellOffer starts", async function () {
            const sellOfferId = await marketPlace.currentsellOfferId();
            const tokenId = 20; // Assuming a token with ID 20 is part of the sellOffer
            const bidAmount = ethers.parseEther("10"); // Bid amount in ether
            await dummyToken.connect(bidder).approve(auctionAddress, bidAmount);

            // Attempt to place a bid before the sellOffer starts
            await advanceTimeTo(startTime - 1);
            await expect(marketPlace.connect(bidder).placeBid(sellOfferId, tokenId, bidAmount, []))
                .to.be.revertedWith("SellOffer has not started yet");
        });

        it("Should reject bids placed exactly at the sellOffer end time", async function () {
            const sellOfferId = await marketPlace.currentsellOfferId();
            const tokenId = 20; // Assuming a token with ID 20 is part of the sellOffer
            const bidAmount = ethers.parseEther("10"); // Bid amount in ether
            await dummyToken.connect(bidder).approve(auctionAddress, bidAmount);

            // Attempt to place a bid exactly at the end time
            await advanceTimeTo(endTime);
            await expect(marketPlace.connect(bidder).placeBid(sellOfferId, tokenId, bidAmount, []))
                .to.be.revertedWith("SellOffer has already ended for this token");
        });

        it("Should reject bids placed after the sellOffer has ended", async function () {
            const sellOfferId = await marketPlace.currentsellOfferId();
            const tokenId = 20; // Assuming a token with ID 20 is part of the sellOffer
            const bidAmount = ethers.parseEther("10"); // Bid amount in ether
            await dummyToken.connect(bidder).approve(auctionAddress, bidAmount);

            // Attempt to place a bid after the sellOffer has ended
            await advanceTimeTo(endTime + 1);
            await expect(marketPlace.connect(bidder).placeBid(sellOfferId, tokenId, bidAmount, []))
                .to.be.revertedWith("SellOffer has already ended for this token");
        });

        it("Should allow bids placed exactly at the sellOffer start time", async function () {
            const sellOfferId = await marketPlace.currentsellOfferId();
            const tokenId = 20; // Assuming a token with ID 20 is part of the sellOffer
            const bidAmount = ethers.parseEther("10"); // Bid amount in ether
            await dummyToken.connect(bidder).approve(auctionAddress, bidAmount);

            // Attempt to place a bid exactly at the start time
            await advanceTimeTo(startTime);
            await expect(marketPlace.connect(bidder).placeBid(sellOfferId, tokenId, bidAmount, []))
                .to.emit(marketPlace, 'onBuyOrBid');
        });

        it("Should reject bids on BUYNOW type auctions", async function () {
            // Create a BUYNOW type sellOffer
            const buynowSellOfferParams = await generateSellOfferParams([21], "BUYNOW");
            await marketPlace.connect(buyNowAuctionCreator).createSellOffer(buynowSellOfferParams);
            const buynowsellOfferId = await marketPlace.currentsellOfferId();
            const tokenId = 21; // Assuming a token with ID 21 is part of the BUYNOW sellOffer
            const bidAmount = ethers.parseEther("10"); // Bid amount in ether
            await dummyToken.connect(bidder).approve(auctionAddress, bidAmount);

            // Attempt to place a bid on a BUYNOW type sellOffer
            await advanceTimeTo(buynowSellOfferParams.startTime);
            await expect(marketPlace.connect(bidder).placeBid(buynowsellOfferId, tokenId, bidAmount, []))
                .to.be.revertedWith("Can't place bid.");
        });

        it("Should allow bids on BID and STAKE type auctions", async function () {
            // Create a BID type sellOffer
            const bidsellOfferId = await marketPlace.currentsellOfferId();
            const bidTokenId = 20; // Assuming a token with ID 22 is part of the BID sellOffer
            const bidAmount = ethers.parseEther("10"); // Bid amount in ether
            await dummyToken.connect(bidder).approve(auctionAddress, bidAmount);

            // Attempt to place a bid on a BID type sellOffer
            await advanceTimeTo(startTime);
            await expect(marketPlace.connect(bidder).placeBid(bidsellOfferId, bidTokenId, bidAmount, []))
                .to.emit(marketPlace, 'onBuyOrBid');

            // Create a STAKE type sellOffer
            const stakeSellOfferParams = await generateSellOfferParams([22], "STAKE");
            await marketPlace.connect(stakeAuctionCreator).createSellOffer(stakeSellOfferParams);
            const stakesellOfferId = await marketPlace.currentsellOfferId();
            const stakeTokenId = 22; // Assuming a token with ID 23 is part of the STAKE sellOffer
            const stakeBidAmount = ethers.parseEther("10"); // Bid amount in ether
            await dummyToken.connect(bidder).approve(auctionAddress, stakeBidAmount);

            // Attempt to place a bid on a STAKE type sellOffer
            await advanceTimeTo(stakeSellOfferParams.startTime);
            await expect(marketPlace.connect(bidder).placeBid(stakesellOfferId, stakeTokenId, stakeBidAmount, []))
                .to.emit(marketPlace, 'onBuyOrBid');
        });

        it("Should reject bids below the minimum price or not higher than the last highest bid", async function () {            
            const sellOfferId = await marketPlace.currentsellOfferId();
            const tokenId = 20; // Assuming a token with ID 23 is part of the BID sellOffer
            const minimumBidAmount = ethers.parseEther("5"); // Minimum bid amount in ether

            // Approve the sellOffer contract to spend the bidder's tokens
            await dummyToken.connect(bidder).approve(auctionAddress, ethers.parseEther("100"));
            await advanceTimeTo(startTime);
            // Attempt to place a bid below the minimum price
            const lowBidAmount = ethers.parseEther("4"); // Lower than the minimum bid amount
            await expect(marketPlace.connect(bidder).placeBid(sellOfferId, tokenId, lowBidAmount, []))
                .to.be.revertedWith("Amount should be greater than price");

            // Place a valid first bid
          
            await marketPlace.connect(bidder).placeBid(sellOfferId, tokenId, minimumBidAmount, []);

            // Attempt to place a bid not higher than the last highest bid
            const equalBidAmount = ethers.parseEther("5"); // Equal to the last highest bid
            await expect(marketPlace.connect(bidder).placeBid(sellOfferId, tokenId, equalBidAmount, []))
                .to.be.revertedWith("New bid is not higher than the current highest bid.");
        });

        it("Should reject consecutive bids by the same user without an intervening higher bid", async function () {
            const sellOfferId = await marketPlace.currentsellOfferId();
            const tokenId = 20; // Assuming a token with ID 20 is part of the sellOffer
            const bidAmount = ethers.parseEther("10"); // Bid amount in ether

            // Approve the sellOffer contract to spend the bidder's tokens
            await dummyToken.connect(bidder).approve(auctionAddress, ethers.parseEther("100"));
            await advanceTimeTo(startTime);
            // Place a valid first bid
            await marketPlace.connect(bidder).placeBid(sellOfferId, tokenId, bidAmount, []);

            // Attempt to place another bid by the same user without an intervening higher bid
            const secondBidAmount = ethers.parseEther("15"); // Higher than the first bid but by the same user
            await expect(marketPlace.connect(bidder).placeBid(sellOfferId, tokenId, secondBidAmount, []))
                .to.be.revertedWith("You already made a bid");
        });

        it("Should correctly transfer the bid amount from the bidder to the sellOffer contract", async function () {
            const sellOfferId = await marketPlace.currentsellOfferId();
            const tokenId = 20; // Assuming a token with ID 20 is part of the sellOffer
            const bidAmount = ethers.parseEther("10"); // Bid amount in ether

            // Approve the sellOffer contract to spend the bid amount on behalf of the bidder
            await dummyToken.connect(bidder).approve(auctionAddress, bidAmount);

            // Record the initial balances of the bidder and the sellOffer contract
            const initialBidderBalance = BigInt(await dummyToken.balanceOf(bidder.address));
            const initialAuctionBalance = BigInt(await dummyToken.balanceOf(auctionAddress));

            // Place a bid
            await advanceTimeTo(startTime);
            await marketPlace.connect(bidder).placeBid(sellOfferId, tokenId, bidAmount, []);

            // Record the final balances of the bidder and the sellOffer contract
            const finalBidderBalance = BigInt(await dummyToken.balanceOf(bidder.address));
            const finalAuctionBalance = BigInt(await dummyToken.balanceOf(auctionAddress));

            // Calculate the expected balances after the bid
            const expectedBidderBalance = initialBidderBalance - bidAmount;
            const expectedAuctionBalance = initialAuctionBalance + bidAmount;

            // Assert that the balances are as expected
            expect(finalBidderBalance).to.equal(expectedBidderBalance);
            expect(finalAuctionBalance).to.equal(expectedAuctionBalance);
        });

        it("Should lock the bid amount in a TimeLock contract for STAKE auctions after sellOffer ends and user claims NFT", async function () {
            const stakeSellOfferParams = await generateSellOfferParams([22], "STAKE");
            await marketPlace.connect(stakeAuctionCreator).createSellOffer(stakeSellOfferParams);

            const sellOfferId = await marketPlace.currentsellOfferId();
            const tokenId = 22; // Assuming a token with ID 20 is part of the sellOffer
            const bidAmount = ethers.parseEther("10"); // Bid amount in ether

            // Approve the sellOffer contract to spend the bidder's tokens
            await dummyToken.connect(bidder).approve(auctionAddress, bidAmount);

            // Place a bid in a STAKE sellOffer
            await advanceTimeTo(startTime+1);
            await marketPlace.connect(bidder).placeBid(sellOfferId, tokenId, bidAmount, []);

            // End the sellOffer
            await advanceTimeTo(endTime+10*60+1);
            
            // Claim the NFT
            await marketPlace.connect(bidder).claimNFT(sellOfferId, tokenId);

            // Check if the bid amount is locked in the TimeLock contract
            const lockedTokens = await timeLock.getUserLocks(bidder.address);
            const lockedAmount = lockedTokens[0].amount;
            const expectedLockedAmount = BigInt(bidAmount);

            // Assert that the locked amount in the TimeLock contract is equal to the bid amount
            expect(lockedAmount).to.equal(expectedLockedAmount);
        });
        // Add more bidding related tests here
    });

    describe("Claim NFT Functionality", function () {
        let sellOfferId, tokenId, bidAmount, startTime, endTime;

        beforeEach(async function () {
            // Setup sellOffer parameters
            await simpleERC1155.mint(bidAuctionCreator.address, 20, 1, ethers.toUtf8Bytes(""));
            await simpleERC1155.mint(buyNowAuctionCreator.address, 21, 1, ethers.toUtf8Bytes(""));
            const SellOfferParams = await generateSellOfferParams([20], "BID");
            startTime = SellOfferParams.startTime;
            endTime = SellOfferParams.endTime;
            await marketPlace.connect(bidAuctionCreator).createSellOffer(SellOfferParams);
            sellOfferId = await marketPlace.currentsellOfferId();
            tokenId = 20; // Assuming a token with ID 30 is part of the sellOffer
            bidAmount1 = ethers.parseEther("5"); // Bid amount in ether
            bidAmount2 = ethers.parseEther("6"); // Bid amount in ether

            // Approve and place a bid
            await dummyToken.connect(bidder).approve(auctionAddress, bidAmount2);
            await dummyToken.connect(otherBidder).approve(auctionAddress, bidAmount1);
            await advanceTimeTo(startTime + 1);
            await marketPlace.connect(otherBidder).placeBid(sellOfferId, tokenId, bidAmount1, []);
            await marketPlace.connect(bidder).placeBid(sellOfferId, tokenId, bidAmount2, []);
            
        });

        it("Should allow the highest bidder to claim the NFT after the sellOffer ends", async function () {
            // End the sellOffer
            await advanceTimeTo(endTime + (10 * 60)*2 + 1);

            // Claim the NFT
            await expect(marketPlace.connect(bidder).claimNFT(sellOfferId, tokenId))
                .to.emit(marketPlace, 'NFTClaimed')               

            // Check ownership of the NFT
            const ownerBalance = await simpleERC1155.balanceOf(bidder.address, tokenId);
            expect(ownerBalance).to.equal(1);
        });

        it("Should fail to claim the NFT if the sellOffer has not ended", async function () {
            // Attempt to claim the NFT before the sellOffer ends
            await expect(marketPlace.connect(bidder).claimNFT(sellOfferId, tokenId))
                .to.be.revertedWith("SellOffer not yet ended");
        });

        it("Should fail to claim the NFT if the caller is not the highest bidder", async function () {
            // End the sellOffer
            await advanceTimeTo(endTime + (10 * 60)*2 + 1);

            // Another user attempts to claim the NFT
            await expect(marketPlace.connect(otherBidder).claimNFT(sellOfferId, tokenId))
                .to.be.revertedWith("Caller is not the winner");
        });
        it("Should not allow claiming NFTs for BUYNOW auctions", async function () {
            const buynowSellOfferParams = await generateSellOfferParams([21], "BUYNOW");
            await marketPlace.connect(buyNowAuctionCreator).createSellOffer(buynowSellOfferParams);
            const buynowsellOfferId = await marketPlace.currentsellOfferId();
            const tokenId = 21; // Assuming a token with ID 21 is part of the BUYNOW sellOffer

            // Attempt to claim the NFT for a BUYNOW sellOffer
            await expect(marketPlace.connect(bidder).claimNFT(buynowsellOfferId, tokenId))
                .to.be.revertedWith("Claiming not allowed for BUYNOW SellOffers");
        });
        it("Should fail to claim the NFT if it has already been claimed", async function () {
            // End the sellOffer
            await advanceTimeTo(endTime + (10 * 60)*2 + 1);

            // First claim attempt
            await expect(marketPlace.connect(bidder).claimNFT(sellOfferId, tokenId))
                .to.emit(marketPlace, 'NFTClaimed');

            // Second claim attempt
            await expect(marketPlace.connect(bidder).claimNFT(sellOfferId, tokenId))
                .to.be.revertedWith("NFT already claimed");
        });
    });

    describe("SellOffer Buy Now", function () {
        let startTime, endTime, sellOfferId;
        beforeEach(async function () {
            await simpleERC1155.mint(bidAuctionCreator.address, 20, 1, ethers.toUtf8Bytes(""));
            await simpleERC1155.mint(buyNowAuctionCreator.address, 21, 1, ethers.toUtf8Bytes(""));
            await simpleERC1155.mint(stakeAuctionCreator.address, 22, 1, ethers.toUtf8Bytes(""));
            const buynowSellOfferParams = await generateSellOfferParams([21], "BUYNOW");

            startTime = buynowSellOfferParams.startTime;
            endTime = buynowSellOfferParams.endTime;
            
            await expect(marketPlace.connect(buyNowAuctionCreator).createSellOffer(buynowSellOfferParams))
                .to.emit(marketPlace, 'NewSellOfferCreated');      
            sellOfferId = await marketPlace.currentsellOfferId();   
            const bidAmount = ethers.parseEther("10"); // Bid amount in ether
            await dummyToken.connect(bidder).approve(auctionAddress, bidAmount);   
        });
        describe("Burn Functionality in Buy Now SellOffer", function () {
            let tokenId, sellOfferId, auctionPrice, buynowSellOfferParams, dummyTokenBurnable;

            beforeEach(async function () {

                const DummyTokenBurnable = await ethers.getContractFactory("DummyTokenBurnable");
                const initialSupply = ethers.parseEther("1000000"); // Initial supply of 1,000,000 tokens
                dummyTokenBurnable = await DummyTokenBurnable.deploy(initialSupply);

                const dummyTokenBurnableAddress = await dummyTokenBurnable.getAddress();
                await marketPlace.addPaymentTokenToWhitelist(dummyTokenBurnableAddress);

                await dummyTokenBurnable.transfer(bidder.address, ethers.parseEther("1000"));
                
                
                tokenId = 21; // Assuming a token with ID 21
                auctionPrice = ethers.parseEther("5"); // SellOffer price in ether   
                await simpleERC1155.mint(buyNowAuctionCreator.address, 21, 1, ethers.toUtf8Bytes(""));             
                buynowSellOfferParams = await generateSellOfferParams([tokenId], "BUYNOW");
                buynowSellOfferParams.payoutAddress = ethers.ZeroAddress;
                await dummyTokenBurnable.connect(bidder).approve(auctionAddress, auctionPrice);                                   
            });

            it("Should burn tokens if payoutAddress is zero", async function () {                
                buynowSellOfferParams.paymentToken = await dummyTokenBurnable.getAddress();                
                await marketPlace.connect(buyNowAuctionCreator).createSellOffer(buynowSellOfferParams);
                sellOfferId = await marketPlace.currentsellOfferId();
                await advanceTimeTo(buynowSellOfferParams.startTime + 1);
                // Perform buy now action
                const initialBalance = await dummyTokenBurnable.balanceOf(buyNowAuctionCreator.address);
                const initialTotalSupply = await dummyTokenBurnable.totalSupply();
                await marketPlace.connect(bidder).buyNow(sellOfferId, tokenId, []);
                const finalTotalSupply = await dummyTokenBurnable.totalSupply();
                expect(finalTotalSupply).to.equal(initialTotalSupply - auctionPrice);
        
                const finalBalance = await dummyTokenBurnable.balanceOf(buyNowAuctionCreator.address);
                expect(initialBalance).to.equal(finalBalance);
            });

            it("Should transfer tokens to creator if burnFrom fails", async function () {
                await marketPlace.connect(buyNowAuctionCreator).createSellOffer(buynowSellOfferParams);
                sellOfferId = await marketPlace.currentsellOfferId();
                
                // Perform buy now action
                await advanceTimeTo(buynowSellOfferParams.startTime + 1);
                await marketPlace.connect(bidder).buyNow(sellOfferId, tokenId, []);

                // Verify that tokens are transferred to the sellOffer creator instead
                const creatorBalance = await dummyToken.balanceOf(buyNowAuctionCreator.address);
                expect(creatorBalance).to.equal(auctionPrice);
            });
        });
        it("Should transfer the NFT from the contract to the buyer upon successful purchase", async function () {
            const tokenId = 21; // Assuming a token with ID 21
            const auctionPrice = ethers.parseEther("5"); // SellOffer price in ether

            // First valid buy now to simulate the token being bought
            await advanceTimeTo(startTime + 1);
            await marketPlace.connect(bidder).buyNow(sellOfferId, tokenId, []);

            // Check the ownership of the NFT to ensure it is transferred to the buyer
            const ownerOfToken = await simpleERC1155.balanceOf(bidder.address, tokenId);
            expect(ownerOfToken).to.equal(1);
        });
        it("Should transfer the correct amount of tokens from the buyer to the contract during a buy now action", async function () {
            const tokenId = 21; // Assuming a token with ID 21
            const auctionPrice = ethers.parseEther("5"); // SellOffer price in ether

            // First valid buy now to simulate the token being bought
            await advanceTimeTo(startTime + 1);
            await marketPlace.connect(bidder).buyNow(sellOfferId, tokenId, []);

            // Check the balance of the contract to ensure it received the correct amount
            const contractBalance = await dummyToken.balanceOf(payoutAddress.address);
            const expectedBalance = BigInt(auctionPrice);

            // Assert that the contract balance is increased by the sellOffer price
            expect(contractBalance).to.equal(expectedBalance);
        });
        it("Should revert if the token has already been bought", async function () {
            const tokenId = 21; // Assuming a token with ID 21
            const bidAmount = ethers.parseEther("10"); // Bid amount in ether

            // First valid buy now to simulate the token being bought
            await advanceTimeTo(startTime + 1);
            await marketPlace.connect(bidder).buyNow(sellOfferId, tokenId, []);

            // Attempt to buy now again for the same token
            await expect(marketPlace.connect(bidder).buyNow(sellOfferId, tokenId, []))
                .to.be.revertedWith("Already bought");
        });
        it("Should revert if the provided token ID does not exist within the sellOffer", async function () {
            const invalidTokenId = 999; // Assuming this token ID does not exist in any sellOffer
            // Attempt to buy now with a non-existent token ID
            await advanceTimeTo(startTime+1);
            await expect(marketPlace.connect(bidder).buyNow(sellOfferId, invalidTokenId, []))
                .to.be.revertedWith("Token ID does not exist in this SellOffer");
        });

        it("Should allow a valid buy now during the sellOffer period", async function () {
            await advanceTimeTo(startTime+1);
            await expect(marketPlace.connect(bidder).buyNow(sellOfferId, 21, []))
                .to.emit(marketPlace, 'onBuyOrBid');
        });

        it("Should revert when trying to buy from a non-existent sellOffer", async function () {
            const nonExistentsellOfferId = 9999; // Assuming this sellOffer ID does not exist
            const tokenId = 21; // Assuming a token with ID 21
            const bidAmount = ethers.parseEther("10"); // Bid amount in ether

            // Attempt to buy from a non-existent sellOffer
            await expect(marketPlace.connect(bidder).buyNow(nonExistentsellOfferId, tokenId, []))
                .to.be.revertedWith("SellOffer does not exist");
        });
        it("Should revert if the sellOffer type is not BUYNOW when trying to buy now", async function () {
            const bidSellOfferParams = await generateSellOfferParams([20], "BID");
            await marketPlace.connect(bidAuctionCreator).createSellOffer(bidSellOfferParams);
            const bidsellOfferId = await marketPlace.currentsellOfferId();
            const tokenId = 20; // Assuming a token with ID 20 is part of the BID sellOffer
            await advanceTimeTo(bidSellOfferParams.startTime+1);
            // Attempt to buy now on a BID type sellOffer
            await expect(marketPlace.connect(bidder).buyNow(bidsellOfferId, tokenId, []))
                .to.be.revertedWith("SellOffer type is not Buy Now.");
        });

        it("Should revert if trying to buy now before the sellOffer start time", async function () {        
            await advanceTimeTo(startTime - 1); // Move time to just before sellOffer start
            const tokenId = 20; 
            await expect(marketPlace.connect(bidder).buyNow(sellOfferId, tokenId, []))
                .to.be.revertedWith("SellOffer has not started yet");
        });

        it("Should revert if trying to buy now after the sellOffer end time", async function () {
            await advanceTimeTo(endTime + 1); // Move time to just after sellOffer end
            const tokenId = 20; 
            await expect(marketPlace.connect(bidder).buyNow(sellOfferId, tokenId, []))
                .to.be.revertedWith("SellOffer has already ended");
        });

        
    });

    describe("SellOffer Cancellation", function () {
        let sellOfferId, creator, nonCreator, tokenId, bidAmount, sellOfferParams;

        beforeEach(async function () {
            creator = bidAuctionCreator; // Assuming bidAuctionCreator is the creator of the sellOffer
            nonCreator = otherBidder; // Assuming otherBidder is not the creator of the sellOffer
            tokenId = 20; // Assuming a token with ID 20
            bidAmount = ethers.parseEther("5"); // Bid amount in ether
            await simpleERC1155.mint(bidAuctionCreator.address, 20, 1, ethers.toUtf8Bytes(""));
            await dummyToken.connect(bidder).approve(auctionAddress, bidAmount);
            // Create a new sellOffer
            sellOfferParams = await generateSellOfferParams([tokenId], "BID");
            await marketPlace.connect(creator).createSellOffer(sellOfferParams);
            sellOfferId = await marketPlace.currentsellOfferId();
        });

        it("Should allow the creator to successfully cancel the sellOffer before any bids and before it ends", async function () {
            await expect(marketPlace.connect(creator).cancel(sellOfferId))
                .to.emit(marketPlace, 'SellOfferCanceled');
        });

        it("Should only allow the creator or an authorized role to cancel the sellOffer", async function () {
            await expect(marketPlace.connect(nonCreator).cancel(sellOfferId))
                .to.be.revertedWith("Only the creator can cancel the sellOffer");
        });

        it("Should not allow cancellation after the sellOffer has ended", async function () {
            // Move time to just after sellOffer end
            await advanceTimeTo(sellOfferParams.endTime + 1);
            await expect(marketPlace.connect(creator).cancel(sellOfferId))
                .to.be.revertedWith("Cancellation period has ended");
        });

        it("Should not allow cancellation once a bid has been placed", async function () {
            // Place a bid
            await advanceTimeTo(sellOfferParams.startTime + 1);
            await marketPlace.connect(bidder).placeBid(sellOfferId, tokenId, bidAmount, []);
            await expect(marketPlace.connect(creator).cancel(sellOfferId))
                .to.be.revertedWith("SellOffer has bids");
        });

        it("Should ensure that canceling one sellOffer does not affect others", async function () {
            // Create another sellOffer
            await simpleERC1155.mint(bidAuctionCreator.address, 21, 1, ethers.toUtf8Bytes(""));
            const anotherSellOfferParams = await generateSellOfferParams([21], "BID"); // Assuming token ID 21
            await marketPlace.connect(creator).createSellOffer(anotherSellOfferParams);
            const anotherSellOfferId = await marketPlace.currentsellOfferId();

            // Cancel the first sellOffer
            await marketPlace.connect(creator).cancel(sellOfferId);

            // Check the second sellOffer is still active
            const sellOfferDetails = await marketPlace.sellOfferDetails(anotherSellOfferId);
            expect(sellOfferDetails.isCanceled).to.be.false;
        });
        it("Should fail to cancel a sellOffer if it is already canceled", async function () {
            // Cancel the sellOffer first time
            await marketPlace.connect(creator).cancel(sellOfferId);

            // Attempt to cancel the same sellOffer again
            await expect(marketPlace.connect(creator).cancel(sellOfferId))
                .to.be.revertedWith("SellOffer is already canceled");
        });

        // it("Should handle reentrancy attacks when canceling a sellOffer", async function () {
        //     // This test would require a custom contract to attempt reentrancy, which is not shown here
        //     // For demonstration, assume we have a ReentrancyAttackContract and we will use it to test
        //     const ReentrancyAttack = await ethers.getContractFactory("ReentrancyAttack");
        //     const reentrancyAttack = await ReentrancyAttack.deploy(marketPlace.address);
        //     await expect(reentrancyAttack.attack(sellOfferId))
        //         .to.be.revertedWith("Reentrant call detected");
        // });
    });

    describe("Payout Functionality", function () {
        let sellOfferId, creator, bidder, sellOfferParams, bidAmount, bidderInitialBalance;

        beforeEach(async function () {
            creator = bidAuctionCreator; // Assuming bidAuctionCreator is the creator of the sellOffer
            bidder = otherBidder; // Assuming otherBidder is a bidder
            bidAmount = ethers.parseEther("5");
            await simpleERC1155.mint(creator.address, 20, 1, ethers.toUtf8Bytes(""));
            await dummyToken.connect(bidder).approve(auctionAddress, bidAmount);
            sellOfferParams = await generateSellOfferParams([20], "BID");
            await marketPlace.connect(creator).createSellOffer(sellOfferParams);
            sellOfferId = await marketPlace.currentsellOfferId();
            await advanceTimeTo(sellOfferParams.startTime + 1);
            bidderInitialBalance = await dummyToken.balanceOf(bidder.address);
            await marketPlace.connect(bidder).placeBid(sellOfferId, 20, bidAmount, []);
            await advanceTimeTo(sellOfferParams.endTime + 10*60 + 1);
        });

        it("Should successfully execute payout by the sell offer creator when conditions are met", async function () {
            await expect(marketPlace.connect(creator).payout(sellOfferId))
                .to.emit(marketPlace, 'SellOfferPayout');
        });

        it("Should only allow the sell offer creator to initiate the payout", async function () {
            await expect(marketPlace.connect(bidder).payout(sellOfferId))
                .to.be.revertedWith("Only the creator can payout");
        });

        it("Should not allow payout if the sell offer is already marked as paid out", async function () {
            await marketPlace.connect(creator).payout(sellOfferId);
            await expect(marketPlace.connect(creator).payout(sellOfferId))
                .to.be.revertedWith("SellOffer is already payout");
        });

        it("Should not allow payout if the sell offer is canceled", async function () {
            await simpleERC1155.mint(creator.address, 21, 1, ethers.toUtf8Bytes(""));
            await dummyToken.connect(bidder).approve(auctionAddress, bidAmount);
            sellOfferParams = await generateSellOfferParams([21], "BID");
            await marketPlace.connect(creator).createSellOffer(sellOfferParams);
            sellOfferId = await marketPlace.currentsellOfferId();
            await advanceTimeTo(sellOfferParams.startTime + 1);
            await marketPlace.connect(creator).cancel(sellOfferId);
            await advanceTimeTo(sellOfferParams.endTime + 10*60 + 1);
            await expect(marketPlace.connect(creator).payout(sellOfferId))
                .to.be.revertedWith("SellOffer can't be payout");
        });

        it("Should not allow payout before the auction has officially ended", async function () {
            await simpleERC1155.mint(creator.address, 21, 1, ethers.toUtf8Bytes(""));
            await dummyToken.connect(bidder).approve(auctionAddress, bidAmount);
            sellOfferParams = await generateSellOfferParams([21], "BID");
            await marketPlace.connect(creator).createSellOffer(sellOfferParams);
            sellOfferId = await marketPlace.currentsellOfferId();
            await advanceTimeTo(sellOfferParams.startTime + 1);
            await marketPlace.connect(bidder).placeBid(sellOfferId, 21, bidAmount, []);
            await expect(marketPlace.connect(creator).payout(sellOfferId))
                .to.be.revertedWith("SellOffer can't be payout");
        });

        it("Should ensure the correct amount of tokens is transferred to the payout address", async function () {
            const payoutAddressInitialBalance = await dummyToken.balanceOf(sellOfferParams.payoutAddress);
                       
            await marketPlace.connect(creator).payout(sellOfferId);

            const payoutAddressFinalBalance = await dummyToken.balanceOf(sellOfferParams.payoutAddress);
            const bidderFinalBalance = await dummyToken.balanceOf(bidder.address);

            // Calculate expected balances after the payout
            const expectedPayoutAddressFinalBalance = payoutAddressInitialBalance+bidAmount;
            const expectedBidderFinalBalance = bidderInitialBalance - bidAmount;

            // Assert that the creator's balance has increased by the bidAmount
            expect(payoutAddressFinalBalance).to.equal(expectedPayoutAddressFinalBalance, "Payout address's balance should increase by the bid amount");

            // Assert that the bidder's balance has decreased by the bidAmount
            expect(bidderFinalBalance).to.equal(expectedBidderFinalBalance, "Bidder's balance should decrease by the bid amount");
        });

        it("Should handle multiple tokens correctly in the payout", async function () {
            // Mint multiple tokens to the creator
            await simpleERC1155.mint(creator.address, 21, 1, ethers.toUtf8Bytes(""));
            await simpleERC1155.mint(creator.address, 22, 1, ethers.toUtf8Bytes(""));
            await simpleERC1155.mint(creator.address, 23, 1, ethers.toUtf8Bytes(""));

            // Approve the auction contract to spend tokens on behalf of the bidder
            await dummyToken.connect(bidder).approve(auctionAddress, ethers.parseEther("300"));

            // Create a sell offer with multiple tokens
            sellOfferParams = await generateSellOfferParams([21, 22, 23], "BID");
            await marketPlace.connect(creator).createSellOffer(sellOfferParams);
            sellOfferId = await marketPlace.currentsellOfferId();
            const payoutAddressInitialBalance = await dummyToken.balanceOf(sellOfferParams.payoutAddress);
            // Place bids on multiple tokens
            await advanceTimeTo(sellOfferParams.startTime + 1);
            await marketPlace.connect(bidder).placeBid(sellOfferId, 21, ethers.parseEther("100"), []);
            await marketPlace.connect(bidder).placeBid(sellOfferId, 22, ethers.parseEther("100"), []);
            await marketPlace.connect(bidder).placeBid(sellOfferId, 23, ethers.parseEther("100"), []);

            // Advance time to after the auction end time
            await advanceTimeTo(sellOfferParams.endTime + (10*60)*3+ 1);

            // Execute payout
            await marketPlace.connect(creator).payout(sellOfferId);

            // Check balances after payout
            const payoutAddressFinalBalance = await dummyToken.balanceOf(sellOfferParams.payoutAddress);
            const expectedPayoutAddressFinalBalance = BigInt(payoutAddressInitialBalance) + BigInt(ethers.parseEther("300"));
            expect(payoutAddressFinalBalance.toString()).to.equal(expectedPayoutAddressFinalBalance.toString(), "Payout address's balance should increase by the total bid amount");
        });
        it("Should return NFT to creator if no bids are made after payout", async function () {
            // Mint an NFT to the creator
            await simpleERC1155.mint(creator.address, 24, 1, ethers.toUtf8Bytes(""));

            // Approve the auction contract to spend NFT on behalf of the creator
            await simpleERC1155.connect(creator).setApprovalForAll(auctionAddress, true);

            // Create a sell offer with the NFT
            const sellOfferParams = await generateSellOfferParams([24], "BID");
            await marketPlace.connect(creator).createSellOffer(sellOfferParams);
            const sellOfferId = await marketPlace.currentsellOfferId();

            // Advance time to after the auction end time
            await advanceTimeTo(sellOfferParams.endTime + 1);

            // Execute payout
            await marketPlace.connect(creator).payout(sellOfferId);

            // Check that the NFT has been returned to the creator
            const creatorBalance = await simpleERC1155.balanceOf(creator.address, 24);
            expect(creatorBalance).to.equal(1, "Creator should have the NFT returned after payout with no bids");
        });

        it("Should retrieve sell offers needing payout for a creator", async function () {
            // Mint and create sell offers
            await simpleERC1155.mint(creator.address, 25, 1, ethers.toUtf8Bytes(""));
            await simpleERC1155.mint(creator.address, 26, 1, ethers.toUtf8Bytes(""));
            await simpleERC1155.connect(creator).setApprovalForAll(auctionAddress, true);

            const sellOfferParams1 = await generateSellOfferParams([25], "BID");
            const sellOfferParams2 = await generateSellOfferParams([26], "BID");

            await marketPlace.connect(creator).createSellOffer(sellOfferParams1);
            const sellOfferId1 = await marketPlace.currentsellOfferId();

            await marketPlace.connect(creator).createSellOffer(sellOfferParams2);
            const sellOfferId2 = await marketPlace.currentsellOfferId();

            // Advance time to after the auction end time for both sell offers
            await advanceTimeTo(sellOfferParams1.endTime + 1);
            await advanceTimeTo(sellOfferParams2.endTime + 1);

            // Retrieve sell offers needing payout
            const sellOffersNeedingPayout = await marketPlace.getSellOffersNeedingPayoutForCreator(creator.address);

            // Check if the retrieved sell offers are correct
            expect(sellOffersNeedingPayout).to.include.members([BigInt(sellOfferId1), BigInt(sellOfferId2)], "Should retrieve correct sell offers needing payout for the creator");
        });

        it("Should correctly payout the last ten sell offers for a creator", async function () {
            // Mint and create multiple sell offers
            for (let i = 0; i < 15; i++) {
                await simpleERC1155.mint(creator.address, 30 + i, 1, ethers.toUtf8Bytes(""));
                await simpleERC1155.connect(creator).setApprovalForAll(auctionAddress, true);
                const sellOfferParams = await generateSellOfferParams([30 + i], "BID");
                await marketPlace.connect(creator).createSellOffer(sellOfferParams);
            }

            // Advance time to after the last auction end time
            const lastSellOfferParams = await generateSellOfferParams([44], "BID");
            await advanceTimeTo(lastSellOfferParams.endTime + 1);

            // Call payoutLastTenSellOffersForCreator
            await marketPlace.connect(creator).payoutSellOffersForCreator(10);

            // Retrieve all sell offers for the creator and check the last ten are marked as payout
            const sellOffers = await marketPlace.getSellOffersNeedingPayoutForCreator(creator.address);
            expect(sellOffers.length).to.equal(5, "Only the first five sell offers should need payout");

            // Check that the last ten sell offers have been marked as payout
            for (let i = 5; i < 15; i++) {
                const currentSellOfferId = await marketPlace.currentsellOfferId();
                const sellOfferId = BigInt(currentSellOfferId) - BigInt(15 - i);
                const sellOfferDetails = await marketPlace.sellOfferDetails(Number(sellOfferId));
                expect(sellOfferDetails.isPayout).to.be.true;
            }
        });

        // it("Should handle multiple tokens correctly in the payout", async function () {
        //     // Assuming multiple tokens are involved in the sell offer
        //     await simpleERC1155.mint(creator.address, 21, 1, ethers.toUtf8Bytes(""));
        //     await marketPlace.connect(bidder).placeBid(sellOfferId, 21, bidAmount, []);
        //     await marketPlace.connect(creator).payout(sellOfferId);
        //     const sellOfferDetails = await marketPlace.sellOfferDetails(sellOfferId);
        //     expect(sellOfferDetails.tokenIds).to.include.members([20, 21]);
        // });
    });


    describe("Access Control", function () {
        it("Should only allow the owner to create auctions", async function () {
            // Test that only the owner can create auctions
        });

        it("Should only allow the owner or designated role to end auctions", async function () {
            // Test that only the owner or a designated role can end auctions
        });

        // Add more access control related tests here
    });

    // Add more test categories as needed
});
