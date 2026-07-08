// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title AgentBidArena
 * @dev An on-chain auction arena for autonomous agents to compete in rapid micro-auctions.
 */
contract AgentBidArena {
    struct Auction {
        uint256 id;
        address creator;
        string itemName;
        uint256 startingPrice;
        uint256 endBlock;
        address highestBidder;
        uint256 highestBid;
        bool settled;
        bool hasBids;
    }

    uint256 public nextAuctionId;
    mapping(uint256 => Auction) public auctions;

    // Simple custom Reentrancy Guard
    uint8 private _unlocked = 1;
    modifier nonReentrant() {
        require(_unlocked == 1, "REENTRANCY_GUARD_REENTRANT_CALL");
        _unlocked = 0;
        _;
        _unlocked = 1;
    }

    // Events
    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed creator,
        string itemName,
        uint256 startingPrice,
        uint256 endBlock
    );
    event BidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 bidAmount
    );
    event BidRefunded(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 refundAmount
    );
    event AuctionSettled(
        uint256 indexed auctionId,
        address indexed winner,
        uint256 winningBid,
        bool hasBids
    );

    /**
     * @notice Creates a new micro-auction.
     * @param itemName Name/identifier of the item being auctioned.
     * @param durationInBlocks Duration of the auction in block units.
     * @param startingPrice Minimum starting price for the auction.
     */
    function createAuction(
        string memory itemName,
        uint256 durationInBlocks,
        uint256 startingPrice
    ) external returns (uint256) {
        require(durationInBlocks > 0, "Duration must be > 0");
        uint256 auctionId = nextAuctionId++;
        uint256 endBlock = block.number + durationInBlocks;

        auctions[auctionId] = Auction({
            id: auctionId,
            creator: msg.sender,
            itemName: itemName,
            startingPrice: startingPrice,
            endBlock: endBlock,
            highestBidder: address(0),
            highestBid: 0,
            settled: false,
            hasBids: false
        });

        emit AuctionCreated(auctionId, msg.sender, itemName, startingPrice, endBlock);
        return auctionId;
    }

    /**
     * @notice Places a bid on an active auction.
     * @param auctionId The unique ID of the auction.
     */
    function placeBid(uint256 auctionId) external payable nonReentrant {
        Auction storage auction = auctions[auctionId];
        require(auction.creator != address(0), "Auction does not exist");
        require(block.number < auction.endBlock, "Auction has ended");
        require(!auction.settled, "Auction already settled");

        if (!auction.hasBids) {
            require(msg.value > auction.startingPrice, "Bid must be greater than starting price");
        } else {
            require(msg.value > auction.highestBid, "Bid must be greater than current highest bid");
        }

        address previousBidder = auction.highestBidder;
        uint256 previousHighestBid = auction.highestBid;

        // Update the state before making the external call (CEI Pattern)
        auction.highestBidder = msg.sender;
        auction.highestBid = msg.value;
        auction.hasBids = true;

        emit BidPlaced(auctionId, msg.sender, msg.value);

        // Refund the previous highest bidder if one exists
        if (previousBidder != address(0) && previousHighestBid > 0) {
            (bool success, ) = payable(previousBidder).call{value: previousHighestBid}("");
            require(success, "Refund failed");
            emit BidRefunded(auctionId, previousBidder, previousHighestBid);
        }
    }

    /**
     * @notice Settles an ended auction. Transfers the highest bid to the creator.
     * @param auctionId The unique ID of the auction.
     */
    function settleAuction(uint256 auctionId) external nonReentrant {
        Auction storage auction = auctions[auctionId];
        require(auction.creator != address(0), "Auction does not exist");
        require(block.number >= auction.endBlock, "Auction has not ended yet");
        require(!auction.settled, "Auction already settled");

        auction.settled = true;

        if (auction.hasBids) {
            uint256 winningBid = auction.highestBid;
            address creator = auction.creator;
            address winner = auction.highestBidder;

            emit AuctionSettled(auctionId, winner, winningBid, true);

            (bool success, ) = payable(creator).call{value: winningBid}("");
            require(success, "Transfer to creator failed");
        } else {
            emit AuctionSettled(auctionId, address(0), 0, false);
        }
    }

    /**
     * @notice Returns info of a given auction.
     * @param auctionId The unique ID of the auction.
     */
    function getAuction(uint256 auctionId)
        external
        view
        returns (
            uint256 id,
            address creator,
            string memory itemName,
            uint256 startingPrice,
            uint256 endBlock,
            address highestBidder,
            uint256 highestBid,
            bool settled,
            bool hasBids
        )
    {
        Auction memory auction = auctions[auctionId];
        require(auction.creator != address(0), "Auction does not exist");
        return (
            auction.id,
            auction.creator,
            auction.itemName,
            auction.startingPrice,
            auction.endBlock,
            auction.highestBidder,
            auction.highestBid,
            auction.settled,
            auction.hasBids
        );
    }
}
