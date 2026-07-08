import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for all requests so the separate frontend can consume the endpoints
app.use(cors());
app.use(express.json());

const STATE_FILE_PATH = path.join(__dirname, '../data/arena-state.json');

// Default fallback state structure in case of reading issues or missing file
const defaultState = {
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

let lastValidState = { ...defaultState };

/**
 * Reads and parses the state file dynamically.
 * Implements fallback cache and directory/file creation if missing.
 */
function readState() {
  try {
    if (!fs.existsSync(STATE_FILE_PATH)) {
      const dir = path.dirname(STATE_FILE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(defaultState, null, 2), 'utf8');
      return defaultState;
    }
    const data = fs.readFileSync(STATE_FILE_PATH, 'utf8');
    if (!data.trim()) {
      return lastValidState; // Avoid crash if file is temporarily empty during a write
    }
    const parsed = JSON.parse(data);
    lastValidState = parsed;
    return parsed;
  } catch (error) {
    console.error('Error reading or parsing arena-state.json, returning last cached state:', error.message);
    return lastValidState;
  }
}

// 1. /api/auctions: Return list of active and settled auctions
app.get('/api/auctions', (req, res) => {
  const state = readState();
  res.json(state.auctions || []);
});

// 2. /api/bids: Return recent bids with TX hashes and agent names
app.get('/api/bids', (req, res) => {
  const state = readState();
  res.json(state.bids || []);
});

// 3. /api/stats: Return agent leaderboard (bids placed, auctions won, total gas spent)
app.get('/api/stats', (req, res) => {
  const state = readState();
  const statsObj = state.agentStats || {};
  
  // Map and sort the leaderboard
  const leaderboard = Object.keys(statsObj).map(name => ({
    name,
    ...statsObj[name]
  })).sort((a, b) => {
    // Sort by auctions won (descending)
    if ((b.auctionsWon || 0) !== (a.auctionsWon || 0)) {
      return (b.auctionsWon || 0) - (a.auctionsWon || 0);
    }
    // Secondary sort by bids placed (descending)
    return (b.bidsPlaced || 0) - (a.bidsPlaced || 0);
  });
  
  res.json(leaderboard);
});

// 4. /api/metrics: Return real-time demo metrics (auctions per minute, average gas cost, total gas saved/used)
app.get('/api/metrics', (req, res) => {
  const state = readState();
  const metrics = state.metrics || {};
  const auctions = state.auctions || [];
  const bids = state.bids || [];
  
  // Real-time calculation using stats database (avoids 50-item bids array cap)
  const totalBids = metrics.totalBids || bids.length;
  const totalAuctionsCreated = metrics.totalAuctionsCreated || auctions.length;
  const settledAuctions = metrics.totalAuctionsSettled || auctions.filter(a => a.settled).length;
  
  const totalGasUsed = Number(metrics.totalGasUsed || 0);
  const totalTransactions = totalBids + totalAuctionsCreated + settledAuctions;
  
  // Dynamic average gas units per transaction
  const avgGasCost = totalTransactions > 0 ? Math.round(totalGasUsed / totalTransactions) : 0;
  
  // Dynamic gas saved unit relative to Ethereum
  const totalGasSaved = totalGasUsed * 150;
  
  let auctionsPerMinute = metrics.auctionsPerMinute || 0;
  if (auctions.length > 1) {
    const timestamps = auctions.map(a => a.timestamp).filter(Boolean);
    if (timestamps.length > 1) {
      const minTime = Math.min(...timestamps);
      const maxTime = Math.max(...timestamps);
      const diffMinutes = (maxTime - minTime) / 60000;
      if (diffMinutes > 0) {
        auctionsPerMinute = Number((auctions.length / diffMinutes).toFixed(2));
      }
    }
  }
  
  res.json({
    totalAuctionsCreated: totalAuctionsCreated,
    totalAuctionsSettled: settledAuctions,
    totalBids,
    totalGasUsed: totalGasUsed.toString(),
    avgGasCost: avgGasCost.toString(),
    totalGasSaved: totalGasSaved.toString(),
    auctionsPerMinute: auctionsPerMinute || metrics.auctionsPerMinute || 0
  });
});

app.listen(PORT, () => {
  console.log(`Express API Server running on port ${PORT}`);
  console.log(`Watching state file at: ${STATE_FILE_PATH}`);
});
