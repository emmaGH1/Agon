import chai from "chai";
const { expect } = chai;
import hre from "hardhat";
const { ethers } = hre;
import { mine } from "@nomicfoundation/hardhat-network-helpers";

describe("AgentBidArena", function () {
  let agentBidArena;
  let owner, creator, bidder1, bidder2;

  beforeEach(async function () {
    [owner, creator, bidder1, bidder2] = await ethers.getSigners();
    const AgentBidArenaFactory = await ethers.getContractFactory("AgentBidArena");
    agentBidArena = await AgentBidArenaFactory.deploy();
  });

  describe("createAuction", function () {
    it("should successfully create an auction and emit AuctionCreated", async function () {
      const itemName = "Robot Vacuum";
      const duration = 5;
      const startingPrice = ethers.parseEther("0.1");

      const tx = await agentBidArena.connect(creator).createAuction(itemName, duration, startingPrice);
      const receipt = await tx.wait();

      // Parse logs to find AuctionCreated event
      const event = receipt.logs
        .map((log) => {
          try {
            return agentBidArena.interface.parseLog(log);
          } catch (e) {
            return null;
          }
        })
        .find((parsedLog) => parsedLog && parsedLog.name === "AuctionCreated");

      expect(event).to.not.be.undefined;
      expect(event.args.auctionId).to.equal(0n);
      expect(event.args.creator).to.equal(creator.address);
      expect(event.args.itemName).to.equal(itemName);
      expect(event.args.startingPrice).to.equal(startingPrice);

      const auction = await agentBidArena.getAuction(0n);
      expect(auction.id).to.equal(0n);
      expect(auction.creator).to.equal(creator.address);
      expect(auction.itemName).to.equal(itemName);
      expect(auction.startingPrice).to.equal(startingPrice);
      expect(auction.settled).to.be.false;
      expect(auction.hasBids).to.be.false;
    });

    it("should increment nextAuctionId", async function () {
      await agentBidArena.createAuction("Item 1", 5, 0);
      await agentBidArena.createAuction("Item 2", 10, 0);
      expect(await agentBidArena.nextAuctionId()).to.equal(2n);
    });

    it("should revert if duration is 0", async function () {
      await expect(
        agentBidArena.createAuction("Item 1", 0, 100)
      ).to.be.revertedWith("Duration must be > 0");
    });
  });

  describe("placeBid", function () {
    let auctionId;
    const duration = 10;
    const startingPrice = ethers.parseEther("0.1");

    beforeEach(async function () {
      const tx = await agentBidArena.connect(creator).createAuction("Item", duration, startingPrice);
      await tx.wait();
      auctionId = 0n;
    });

    it("should accept a valid first bid", async function () {
      const bidAmount = ethers.parseEther("0.2");
      await expect(agentBidArena.connect(bidder1).placeBid(auctionId, { value: bidAmount }))
        .to.emit(agentBidArena, "BidPlaced")
        .withArgs(auctionId, bidder1.address, bidAmount);

      const auction = await agentBidArena.getAuction(auctionId);
      expect(auction.highestBidder).to.equal(bidder1.address);
      expect(auction.highestBid).to.equal(bidAmount);
      expect(auction.hasBids).to.be.true;
    });

    it("should revert if bid is less than or equal to startingPrice", async function () {
      const lowBid = ethers.parseEther("0.1");
      await expect(
        agentBidArena.connect(bidder1).placeBid(auctionId, { value: lowBid })
      ).to.be.revertedWith("Bid must be greater than starting price");
    });

    it("should refund the previous bidder and accept a higher bid", async function () {
      const bid1 = ethers.parseEther("0.2");
      const bid2 = ethers.parseEther("0.3");

      await agentBidArena.connect(bidder1).placeBid(auctionId, { value: bid1 });

      const bidder1BalanceBefore = await ethers.provider.getBalance(bidder1.address);

      // Bidder 2 bids higher
      const tx = await agentBidArena.connect(bidder2).placeBid(auctionId, { value: bid2 });
      await expect(tx)
        .to.emit(agentBidArena, "BidPlaced")
        .withArgs(auctionId, bidder2.address, bid2)
        .and.to.emit(agentBidArena, "BidRefunded")
        .withArgs(auctionId, bidder1.address, bid1);

      const bidder1BalanceAfter = await ethers.provider.getBalance(bidder1.address);
      // bidder1 should receive the refund
      expect(bidder1BalanceAfter - bidder1BalanceBefore).to.equal(bid1);

      const auction = await agentBidArena.getAuction(auctionId);
      expect(auction.highestBidder).to.equal(bidder2.address);
      expect(auction.highestBid).to.equal(bid2);
    });

    it("should revert if bid is less than or equal to current highest bid", async function () {
      const bid1 = ethers.parseEther("0.2");
      await agentBidArena.connect(bidder1).placeBid(auctionId, { value: bid1 });

      await expect(
        agentBidArena.connect(bidder2).placeBid(auctionId, { value: bid1 })
      ).to.be.revertedWith("Bid must be greater than current highest bid");
    });

    it("should revert if block number >= endBlock", async function () {
      // Fast-forward blocks (10 blocks)
      await mine(duration);

      const bid = ethers.parseEther("0.2");
      await expect(
        agentBidArena.connect(bidder1).placeBid(auctionId, { value: bid })
      ).to.be.revertedWith("Auction has ended");
    });

    it("should revert if auction does not exist", async function () {
      await expect(
        agentBidArena.connect(bidder1).placeBid(999n, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("Auction does not exist");
    });
  });

  describe("settleAuction", function () {
    let auctionId;
    const duration = 5;
    const startingPrice = ethers.parseEther("0.1");

    beforeEach(async function () {
      await agentBidArena.connect(creator).createAuction("Item", duration, startingPrice);
      auctionId = 0n;
    });

    it("should revert if settled before endBlock", async function () {
      await expect(
        agentBidArena.connect(bidder1).settleAuction(auctionId)
      ).to.be.revertedWith("Auction has not ended yet");
    });

    it("should settle and transfer bid to creator when there are bids", async function () {
      const bidAmount = ethers.parseEther("0.2");
      await agentBidArena.connect(bidder1).placeBid(auctionId, { value: bidAmount });

      // Fast forward blocks to end the auction
      await mine(duration);

      const creatorBalanceBefore = await ethers.provider.getBalance(creator.address);

      const tx = await agentBidArena.connect(bidder2).settleAuction(auctionId);
      await expect(tx)
        .to.emit(agentBidArena, "AuctionSettled")
        .withArgs(auctionId, bidder1.address, bidAmount, true);

      const creatorBalanceAfter = await ethers.provider.getBalance(creator.address);
      expect(creatorBalanceAfter - creatorBalanceBefore).to.equal(bidAmount);

      const auction = await agentBidArena.getAuction(auctionId);
      expect(auction.settled).to.be.true;
    });

    it("should settle without transfer when there are no bids", async function () {
      await mine(duration);

      const tx = await agentBidArena.connect(bidder2).settleAuction(auctionId);
      await expect(tx)
        .to.emit(agentBidArena, "AuctionSettled")
        .withArgs(auctionId, ethers.ZeroAddress, 0n, false);

      const auction = await agentBidArena.getAuction(auctionId);
      expect(auction.settled).to.be.true;
    });

    it("should revert if already settled", async function () {
      await mine(duration);
      await agentBidArena.settleAuction(auctionId);

      await expect(
        agentBidArena.settleAuction(auctionId)
      ).to.be.revertedWith("Auction already settled");
    });
  });

  describe("getAuction", function () {
    it("should revert if fetching non-existent auction", async function () {
      await expect(
        agentBidArena.getAuction(999n)
      ).to.be.revertedWith("Auction does not exist");
    });
  });
});
