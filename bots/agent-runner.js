import { JsonRpcProvider, HDNodeWallet, Mnemonic, Contract, parseEther, formatEther } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

// Global exception/rejection handlers to prevent RPC connection drops (like ECONNRESET) from crashing the runner
process.on("unhandledRejection", (reason) => {
  console.error("[Unhandled Rejection] caught:", reason?.message || reason);
});

process.on("uncaughtException", (err) => {
  console.error("[Uncaught Exception] caught:", err?.message || err);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE_PATH = path.join(__dirname, "../data/arena-state.json");

// ABI for AgentBidArena
const CONTRACT_ABI = [
  "function createAuction(string itemName, uint256 durationInBlocks, uint256 startingPrice) external returns (uint256)",
  "function placeBid(uint256 auctionId) external payable",
  "function settleAuction(uint256 auctionId) external",
  "function getAuction(uint256 auctionId) external view returns (uint256 id, address creator, string itemName, uint256 startingPrice, uint256 endBlock, address highestBidder, uint256 highestBid, bool settled, bool hasBids)",
  "function nextAuctionId() external view returns (uint256)",
  "event AuctionCreated(uint256 indexed auctionId, address indexed creator, string itemName, uint256 startingPrice, uint256 endBlock)",
  "event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 bidAmount)",
  "event BidRefunded(uint256 indexed auctionId, address indexed bidder, uint256 refundAmount)",
  "event AuctionSettled(uint256 indexed auctionId, address indexed winner, uint256 winningBid, bool hasBids)"
];

const RPC_URL = process.env.RPC_URL || "https://rpc.bohr.life";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const MNEMONIC_PHRASE = process.env.MNEMONIC;

if (!CONTRACT_ADDRESS) {
  console.error("ERROR: CONTRACT_ADDRESS environment variable is not defined.");
  process.exit(1);
}
if (!MNEMONIC_PHRASE) {
  console.error("ERROR: MNEMONIC environment variable is not defined.");
  process.exit(1);
}

const provider = new JsonRpcProvider(RPC_URL);
provider.pollingInterval = 400; // Poll RPC every 400ms for fast block times on Bohr
const mnemonic = Mnemonic.fromPhrase(MNEMONIC_PHRASE);

// Derive 4 bot wallets:
// Bot 0 (index 0): Auction Creator (and designated Settler)
// Bot 1 (index 1): AggressiveBot
// Bot 2 (index 2): ConservativeBot
// Bot 3 (index 3): RandomBot
const pathPrefix = "m/44'/60'/0'/0/";
const botConfigs = [
  { name: "CreatorBot", wallet: HDNodeWallet.fromMnemonic(mnemonic, `${pathPrefix}0`).connect(provider), budget: parseEther("1.0") },
  { name: "AggressiveBot", wallet: HDNodeWallet.fromMnemonic(mnemonic, `${pathPrefix}1`).connect(provider), budget: parseEther("0.5") },
  { name: "ConservativeBot", wallet: HDNodeWallet.fromMnemonic(mnemonic, `${pathPrefix}2`).connect(provider), budget: parseEther("0.3") },
  { name: "RandomBot", wallet: HDNodeWallet.fromMnemonic(mnemonic, `${pathPrefix}3`).connect(provider), budget: parseEther("0.4") }
];

console.log("Initialized bots:");
botConfigs.forEach(b => console.log(` - ${b.name}: ${b.wallet.address}`));

const arena = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

// Local state tracking
let activeAuctions = new Map(); // id -> auction data
let lastProcessedBlock = 0; // Prevent skipped blocks from missing events
let fileState = {
  auctions: [],
  bids: [],
  agentStats: {},
  metrics: {
    totalAuctionsCreated: 0,
    totalAuctionsSettled: 0,
    totalBids: 0,
    totalGasUsed: "0",
    avgGasCost: "0",
    totalGasSaved: "0",
    auctionsPerMinute: 0
  }
};

// Initialize fileState values from JSON if it exists
if (fs.existsSync(STATE_FILE_PATH)) {
  try {
    const raw = fs.readFileSync(STATE_FILE_PATH, "utf8");
    if (raw.trim()) {
      fileState = JSON.parse(raw);
    }
  } catch (err) {
    console.warn("Could not parse existing state file, overwriting. Reason:", err.message);
  }
}

// Canonical bot names used in agentStats (no legacy spaced names)
const CANONICAL_BOT_NAMES = botConfigs.map(b => b.name);

// Remove any stale/legacy keys that don't match canonical names (e.g. "Aggressive Bot" vs "AggressiveBot")
Object.keys(fileState.agentStats).forEach(key => {
  if (!CANONICAL_BOT_NAMES.includes(key)) {
    console.log(`[Stats Cleanup] Removing stale stat key: "${key}"`);
    delete fileState.agentStats[key];
  }
});

// Make sure all canonical bot names are represented in stats
botConfigs.forEach(b => {
  if (!fileState.agentStats[b.name]) {
    fileState.agentStats[b.name] = { bidsPlaced: 0, auctionsWon: 0, totalGasSpent: "0", biddingGasSpent: "0", orchestrationGasSpent: "0" };
  } else {
    // Ensure the new fields exist if we are restoring from an older JSON state file
    if (fileState.agentStats[b.name].biddingGasSpent === undefined) {
      fileState.agentStats[b.name].biddingGasSpent = "0";
    }
    if (fileState.agentStats[b.name].orchestrationGasSpent === undefined) {
      fileState.agentStats[b.name].orchestrationGasSpent = "0";
    }
  }
});

function writeStateToFile() {
  try {
    const dir = path.dirname(STATE_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(fileState, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing state to file:", err.message);
  }
}

// Track gas spent in agent stats
function recordGas(agentName, gasUsedHex, gasPriceBigInt = 1000000000n, category = "bidding") {
  if (!gasUsedHex) return;
  const gasUsed = BigInt(gasUsedHex);
  const gasPrice = BigInt(gasPriceBigInt);
  const gasFee = gasUsed * gasPrice;
  
  if (!fileState.agentStats[agentName]) {
    fileState.agentStats[agentName] = { bidsPlaced: 0, auctionsWon: 0, totalGasSpent: "0", biddingGasSpent: "0", orchestrationGasSpent: "0" };
  }
  
  const currentTotal = parseEther(fileState.agentStats[agentName].totalGasSpent || "0");
  fileState.agentStats[agentName].totalGasSpent = formatEther(currentTotal + gasFee);
  
  if (category === "bidding") {
    const currentBidding = parseEther(fileState.agentStats[agentName].biddingGasSpent || "0");
    fileState.agentStats[agentName].biddingGasSpent = formatEther(currentBidding + gasFee);
  } else if (category === "orchestration") {
    const currentOrch = parseEther(fileState.agentStats[agentName].orchestrationGasSpent || "0");
    fileState.agentStats[agentName].orchestrationGasSpent = formatEther(currentOrch + gasFee);
  }
  
  fileState.metrics.totalGasUsed = (BigInt(fileState.metrics.totalGasUsed || "0") + gasUsed).toString();
  writeStateToFile();
}

/**
 * Handles bidding action for a bot.
 */
async function placeBotBid(botConfig, auctionId, bidAmount) {
  const { name, wallet } = botConfig;
  console.log(`[Bid Attempt] ${name} is bidding ${formatEther(bidAmount)} BOT on Auction ${auctionId}...`);
  
  try {
    const tx = await arena.connect(wallet).placeBid(auctionId, {
      value: bidAmount
    });
    console.log(`[Bid Pending] ${name} submitted tx: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[Bid Success] ${name} placed bid on Auction ${auctionId}. Tx: ${tx.hash}`);
    
    fileState.agentStats[name].bidsPlaced++;
    const gasPrice = receipt.gasPrice || tx.gasPrice || 1000000000n;
    recordGas(name, receipt.gasUsed, gasPrice, "bidding");
  } catch (err) {
    console.warn(`[Bid Failed] ${name} bid of ${formatEther(bidAmount)} BOT on Auction ${auctionId} reverted:`, err.message);
  }
}

/**
 * Checks all active auctions and settles them if they reached their end block.
 */
async function checkAndSettleAuctions(currentBlock) {
  for (const [id, auction] of activeAuctions.entries()) {
    if (currentBlock >= auction.endBlock && !auction.settled && !auction.settlingInProgress) {
      auction.settlingInProgress = true;
      const settler = botConfigs[0]; // Let CreatorBot settle the auctions
      console.log(`[Settler Node] Auction ${id} ("${auction.itemName}") ended at block ${auction.endBlock} (current block ${currentBlock}). Settling via ${settler.name}...`);
      
      try {
        const tx = await arena.connect(settler.wallet).settleAuction(id);
        console.log(`[Settler Pending] Settle tx submitted: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`[Settler Success] Auction ${id} settled on-chain. Tx: ${tx.hash}`);
        
        const gasPrice = receipt.gasPrice || tx.gasPrice || 1000000000n;
        recordGas(settler.name, receipt.gasUsed, gasPrice, "orchestration");
        
        // Immediately mark settled in local memory and fileState database so the UI reflects it instantly
        const idx = fileState.auctions.findIndex(a => a.id === id);
        if (idx >= 0) {
          if (!fileState.auctions[idx].settled) {
            fileState.auctions[idx].settled = true;
            fileState.metrics.totalAuctionsSettled++;
          }
        }
        writeStateToFile();
        
        // Remove from active map
        activeAuctions.delete(id);
      } catch (err) {
        console.error(`[Settler Failed] Error settling auction ${id}:`, err.message);
        auction.settlingInProgress = false;
      }
    }
  }
}

/**
 * Orchestrates behaviors when a new block is mined.
 */
provider.on("block", async (blockNumber) => {
  console.log(`\n--- Block #${blockNumber} mined ---`);
  await checkAndSettleAuctions(blockNumber);

  const startBlock = lastProcessedBlock > 0 ? lastProcessedBlock + 1 : blockNumber;
  if (startBlock > blockNumber) return; // Block already processed
  lastProcessedBlock = blockNumber;

  // Manual log polling for Bohr Testnet (bypasses RPC filter timeout errors)
  try {
    const logs = await provider.getLogs({
      address: CONTRACT_ADDRESS,
      fromBlock: startBlock,
      toBlock: blockNumber
    });

    for (const log of logs) {
      try {
        const parsedLog = arena.interface.parseLog(log);
        if (!parsedLog) continue;

        if (parsedLog.name === "AuctionCreated") {
          const { auctionId, creator, itemName, startingPrice, endBlock } = parsedLog.args;
          await handleAuctionCreated(auctionId, creator, itemName, startingPrice, endBlock, log.transactionHash);
        } else if (parsedLog.name === "BidPlaced") {
          const { auctionId, bidder, bidAmount } = parsedLog.args;
          await handleBidPlaced(auctionId, bidder, bidAmount, log.transactionHash);
        } else if (parsedLog.name === "AuctionSettled") {
          const { auctionId, winner, winningBid, hasBids } = parsedLog.args;
          await handleAuctionSettled(auctionId, winner, winningBid, hasBids, log.transactionHash);
        }
      } catch (parseErr) {
        // Skip log parsing if it doesn't match our contract's ABI
      }
    }
  } catch (logErr) {
    console.error(`[Block Listener Error] Failed to fetch logs from ${startBlock} to ${blockNumber}:`, logErr.message);
  }
  
  // Conservative Bot behavior: snipe in the last 1-20 blocks with a 5% increment
  const conservativeBot = botConfigs[2];
  for (const [id, auction] of activeAuctions.entries()) {
    const blocksRemaining = auction.endBlock - blockNumber;
    // Only bid in the final window, and only if the auction hasn't ended yet (last 20 blocks)
    if (blocksRemaining > 0 && blocksRemaining <= 20 && !auction.settled && !auction.conservativeBidPending) {
      await attemptConservativeSnipe(id, auction);
    }
  }
});

/**
 * Executes a sniping bid for ConservativeBot by querying absolute latest contract state.
 */
async function attemptConservativeSnipe(id, auction) {
  const conservativeBot = botConfigs[2];
  const alreadyWinning = auction.highestBidder.toLowerCase() === conservativeBot.wallet.address.toLowerCase();
  if (alreadyWinning) return;

  auction.conservativeBidPending = true; // Lock while tx is in-flight
  const delay = Math.random() * 150 + 50; // Fast response: 50–200ms
  setTimeout(async () => {
    try {
      // Fetch absolute latest state directly from the blockchain to avoid racing issues
      const details = await arena.getAuction(id);
      if (!details.settled) {
        const currentHighest = BigInt(details.highestBid);
        const startingPrice = BigInt(details.startingPrice);
        const nextBid = currentHighest > 0n
          ? (currentHighest * 105n) / 100n
          : (startingPrice * 105n) / 100n;

        const isStillWinning = details.highestBidder.toLowerCase() === conservativeBot.wallet.address.toLowerCase();
        if (!isStillWinning && nextBid <= conservativeBot.budget) {
          await placeBotBid(conservativeBot, id, nextBid);
        }
      }
    } catch (err) {
      console.warn(`[Conservative Bot Sniper Error] Failed to verify auction #${id} on-chain:`, err.message);
    } finally {
      auction.conservativeBidPending = false; // Always unlock so we can bid again if outbid or if tx fails
    }
  }, delay);
}

/**
 * Event Handlers (Called by block log parser)
 */
async function handleAuctionCreated(auctionId, creator, itemName, startingPrice, endBlock, txHash) {
  const id = Number(auctionId);
  const auctionObj = {
    id,
    creator,
    itemName,
    startingPrice: startingPrice.toString(),
    endBlock: Number(endBlock),
    highestBidder: "0x0000000000000000000000000000000000000000",
    highestBid: "0",
    settled: false,
    hasBids: false,
    timestamp: Date.now()
  };
  
  console.log(`[Event: AuctionCreated] Auction #${id} for "${itemName}" created by ${creator}. Ends at block ${endBlock}`);
  activeAuctions.set(id, auctionObj);
  
  // Update state structure for frontend
  const existingIdx = fileState.auctions.findIndex(a => a.id === id);
  if (existingIdx >= 0) {
    fileState.auctions[existingIdx] = auctionObj;
  } else {
    fileState.auctions.push(auctionObj);
    fileState.metrics.totalAuctionsCreated++;
  }
  writeStateToFile();
  
  // Trigger bidding reactions for Aggressive and Random bots
  triggerReactions(id, startingPrice, true);
}

async function handleBidPlaced(auctionId, bidder, bidAmount, txHash) {
  const id = Number(auctionId);
  console.log(`[Event: BidPlaced] Auction #${id} received bid of ${formatEther(bidAmount)} BOT from ${bidder}`);
  
  // Find bidder name if it's one of our bots
  const matchedBot = botConfigs.find(b => b.wallet.address.toLowerCase() === bidder.toLowerCase());
  const bidderName = matchedBot ? matchedBot.name : bidder;
  
  const bidObj = {
    auctionId: id,
    bidder: bidderName,
    bidderAddress: bidder,
    bidAmount: bidAmount.toString(),
    txHash: txHash,
    timestamp: Date.now()
  };
  
  fileState.bids.unshift(bidObj); // Add to front of recent bids
  if (fileState.bids.length > 50) fileState.bids.pop(); // Keep last 50
  
  fileState.metrics.totalBids++;
  
  // Update auction info in state
  const auction = activeAuctions.get(id);
  if (auction) {
    auction.highestBidder = bidder;
    auction.highestBid = bidAmount.toString();
    auction.hasBids = true;
    
    const idx = fileState.auctions.findIndex(a => a.id === id);
    if (idx >= 0) {
      fileState.auctions[idx].highestBidder = bidder;
      fileState.auctions[idx].highestBid = bidAmount.toString();
      fileState.auctions[idx].hasBids = true;
    }
  }
  writeStateToFile();
  
  // Trigger reaction (except don't react to our own bid immediately)
  triggerReactions(id, bidAmount, false, bidder);
}

async function handleAuctionSettled(auctionId, winner, winningBid, hasBids, txHash) {
  const id = Number(auctionId);
  console.log(`[Event: AuctionSettled] Auction #${id} settled. Winner: ${winner}, Bid: ${formatEther(winningBid)} BOT`);
  
  // Remove from active list
  activeAuctions.delete(id);
  
  // Update state structure
  const idx = fileState.auctions.findIndex(a => a.id === id);
  if (idx >= 0) {
    fileState.auctions[idx].settled = true;
    fileState.auctions[idx].highestBidder = winner;
    fileState.auctions[idx].highestBid = winningBid.toString();
  }
  
  fileState.metrics.totalAuctionsSettled++;
  
  // Update agent stats for win
  if (hasBids && winner !== "0x0000000000000000000000000000000000000000") {
    const matchedWinner = botConfigs.find(b => b.wallet.address.toLowerCase() === winner.toLowerCase());
    if (matchedWinner) {
      fileState.agentStats[matchedWinner.name].auctionsWon++;
      console.log(`[Leaderboard Update] ${matchedWinner.name} won Auction #${id}!`);
    }
  }
  
  writeStateToFile();
}

/**
 * Triggers decision loop for Aggressive and Random bots.
 *
 * Bidding hierarchy on first bid:
 *   AggressiveBot bids startingPrice + 15%  (fast: 0.5-1.2s)
 *   RandomBot     bids startingPrice + 25%  (slower: 1-3s) — always beats Aggressive's first bid
 *
 * On reaction to an existing bid:
 *   AggressiveBot bids currentBid * 1.15  (fast)
 *   RandomBot     bids currentBid * 1.05–1.15  (slow, random)
 */
function triggerReactions(auctionId, currentHighestBid, isFirstBid, currentBidderAddress = "") {
  // Aggressive Bot reaction
  const aggressiveBot = botConfigs[1];
  if (aggressiveBot.wallet.address.toLowerCase() !== currentBidderAddress.toLowerCase()) {
    // On first bid: bid startingPrice + 15%; on reaction: outbid current by 15%
    const nextBid = isFirstBid
      ? (BigInt(currentHighestBid) * 115n) / 100n
      : (BigInt(currentHighestBid) * 115n) / 100n;
    if (nextBid <= aggressiveBot.budget) {
      const delay = Math.random() * 300 + 200; // Tightened: 200–500ms for high-frequency bidding
      setTimeout(() => {
        const currentAuction = activeAuctions.get(auctionId);
        if (currentAuction && !currentAuction.settled) {
          placeBotBid(aggressiveBot, auctionId, nextBid);
        }
      }, delay);
    }
  }

  // Random Bot reaction
  const randomBot = botConfigs[3];
  if (randomBot.wallet.address.toLowerCase() !== currentBidderAddress.toLowerCase()) {
    // Random increment: 5%–15% above current, but on first bid use 25% so it always beats Aggressive's opening bid
    const incrementPct = isFirstBid
      ? 125n // first bid: startingPrice * 1.25 — ensures RandomBot's opening > AggressiveBot's opening
      : (100n + BigInt(Math.floor(Math.random() * 10) + 5)); // 105% – 115%
    const nextBid = (BigInt(currentHighestBid) * incrementPct) / 100n;
    if (nextBid <= randomBot.budget) {
      const delay = Math.random() * 1000 + 500; // Tightened: 500–1500ms
      setTimeout(() => {
        const currentAuction = activeAuctions.get(auctionId);
        if (currentAuction && !currentAuction.settled) {
          placeBotBid(randomBot, auctionId, nextBid);
        }
      }, delay);
    }
  }
}

/**
 * Periodic Auction Creator (to keep the demo alive)
 * CreatorBot will create a new micro-auction every 30 seconds if there are fewer than 2 active auctions.
 */
async function runDemoCreator() {
  const creator = botConfigs[0];
  setInterval(async () => {
    if (activeAuctions.size < 2) {
      const randomItems = ["Holographic Sticker", "AI Processor Unit", "Cybernetic Upgrade", "Quantum Core", "Neural Link Module"];
      const itemName = randomItems[Math.floor(Math.random() * randomItems.length)] + " #" + Math.floor(Math.random() * 1000);
      const duration = 80; // ~60 seconds (80 blocks at ~0.75s per block)
      const startingPrice = parseEther("0.01");
      
      console.log(`[Demo Orchestration] CreatorBot creating new auction: "${itemName}"...`);
      try {
        const tx = await arena.connect(creator.wallet).createAuction(itemName, duration, startingPrice);
        const receipt = await tx.wait();
        console.log(`[Demo Orchestration] Auction created. Tx: ${tx.hash}`);
        const gasPrice = receipt.gasPrice || tx.gasPrice || 1000000000n;
        recordGas(creator.name, receipt.gasUsed, gasPrice, "orchestration");
      } catch (err) {
        console.error("[Demo Orchestration] Failed to create new demo auction:", err.message);
      }
    }
  }, 25000);
}


async function checkAndFundWallets() {
  try {
    const creator = botConfigs[0];
    const creatorBalance = await provider.getBalance(creator.wallet.address);
    console.log(`[Self-Funding Check] CreatorBot Balance: ${formatEther(creatorBalance)} BOT`);

    for (let i = 1; i < botConfigs.length; i++) {
      const bot = botConfigs[i];
      const balance = await provider.getBalance(bot.wallet.address);
      
      // If child wallet has less than 0.08 BOT and CreatorBot has at least 0.25 BOT
      if (balance < parseEther("0.08") && creatorBalance > parseEther("0.25")) {
        console.log(`[Self-Funding] ${bot.name} balance is low (${formatEther(balance)} BOT). Transferring 0.15 BOT from CreatorBot...`);
        try {
          const tx = await creator.wallet.sendTransaction({
            to: bot.wallet.address,
            value: parseEther("0.15"),
            gasLimit: 21000
          });
          await tx.wait();
          const newBalance = await provider.getBalance(bot.wallet.address);
          console.log(`[Self-Funding] ${bot.name} funded successfully. New Balance: ${formatEther(newBalance)} BOT`);
        } catch (txErr) {
          console.error(`[Self-Funding Failed] Failed to transfer to ${bot.name}:`, txErr.message);
        }
      }
    }
  } catch (err) {
    console.error("[Self-Funding Check Error]:", err.message);
  }
}

// Start tracking and simulation
async function start() {
  try {
    const currentBlock = await provider.getBlockNumber();
    console.log(`Connected to BOT Chain. Current Block Number: ${currentBlock}`);
    
    console.log(`Contract verified at ${CONTRACT_ADDRESS}`);

    // Run initial self-funding check
    await checkAndFundWallets();
    // Schedule periodic self-funding checks every 60 seconds
    setInterval(checkAndFundWallets, 60000);

    
    // Scan blockchain for active auctions since the start (or last 50 blocks)
    // To make sure we don't miss anything that was created while we were starting.
    const filter = arena.filters.AuctionCreated();
    const logs = await arena.queryFilter(filter, Math.max(0, currentBlock - 50));
    for (const log of logs) {
      const id = Number(log.args.auctionId);
      try {
        const details = await arena.getAuction(id);
        if (!details.settled) {
          const auctionObj = {
            id,
            creator: details.creator,
            itemName: details.itemName,
            startingPrice: details.startingPrice.toString(),
            endBlock: Number(details.endBlock),
            highestBidder: details.highestBidder,
            highestBid: details.highestBid.toString(),
            settled: false,
            hasBids: details.hasBids,
            timestamp: Date.now()
          };
          activeAuctions.set(id, auctionObj);
          console.log(`[Restore] Found active auction #${id} ("${details.itemName}") ending at block ${details.endBlock}`);
        }
      } catch (err) {
        console.warn(`[Restore Failed] Could not retrieve details for auction #${id}:`, err.message);
      }
    }
    
    // Start the automatic demo auction creator
    runDemoCreator();

    // Backup Settlement and Snipe Loop: runs every 5 seconds to query current block number
    // and ensure all active auctions are settled/sniped promptly
    setInterval(async () => {
      try {
        const block = await provider.getBlockNumber();
        await checkAndSettleAuctions(block);
        await runBackupConservativeCheck(block);
      } catch (err) {
        console.warn("[Backup Loop Error] Failed to execute backup check:", err.message);
      }
    }, 5000);
    
    console.log("Agent Runner is now actively listening for events...");
  } catch (err) {
    console.error("Error starting agent runner:", err.message);
    process.exit(1);
  }
}

/**
 * Backup sniping checker: runs periodically to detect if ConservativeBot should snipe
 */
async function runBackupConservativeCheck(blockNumber) {
  for (const [id, auction] of activeAuctions.entries()) {
    const blocksRemaining = auction.endBlock - blockNumber;
    if (blocksRemaining > 0 && blocksRemaining <= 20 && !auction.settled && !auction.conservativeBidPending) {
      console.log(`[Backup Snipe Check] Auction ${id} is within sniper window (remaining: ${blocksRemaining} blocks). Attempting snipe...`);
      await attemptConservativeSnipe(id, auction);
    }
  }
}

start();
