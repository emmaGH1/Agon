import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for all requests so the separate frontend can consume the endpoints
app.use(cors());
app.use(express.json());

const STATE_FILE_PATH = path.join(process.cwd(), 'data/arena-state.json');

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

const fsPromises = fs.promises;

let cachedState = { ...defaultState };
let isReading = false;
let pendingRead = false;
let lastServerWriteTime = 0;

// Prunes the in-memory state so serialization is extremely fast
function pruneState(state) {
  if (!state) return { ...defaultState };
  const pruned = {
    ...state,
    auctions: Array.isArray(state.auctions) ? [...state.auctions] : [],
    bids: Array.isArray(state.bids) ? [...state.bids] : [],
    agentStats: state.agentStats ? { ...state.agentStats } : {},
    metrics: state.metrics ? { ...state.metrics } : { ...defaultState.metrics }
  };

  const active = [];
  const settled = [];
  for (const a of pruned.auctions) {
    if (a && a.settled) {
      settled.push(a);
    } else if (a) {
      active.push(a);
    }
  }
  // Keep the most recent 100 settled auctions
  const recentSettled = settled.slice(-100);
  pruned.auctions = [...active, ...recentSettled].sort((a, b) => (a.id || 0) - (b.id || 0));

  // Keep only the most recent 100 bids
  if (pruned.bids.length > 100) {
    pruned.bids = pruned.bids.slice(0, 100);
  }

  return pruned;
}

async function loadStateAsync() {
  if (isReading) {
    pendingRead = true;
    return;
  }
  isReading = true;
  try {
    if (!fs.existsSync(STATE_FILE_PATH)) {
      const dir = path.dirname(STATE_FILE_PATH);
      if (!fs.existsSync(dir)) {
        await fsPromises.mkdir(dir, { recursive: true });
      }
      await fsPromises.writeFile(STATE_FILE_PATH, JSON.stringify(defaultState, null, 2), 'utf8');
      cachedState = { ...defaultState };
      return;
    }
    const data = await fsPromises.readFile(STATE_FILE_PATH, 'utf8');
    if (!data.trim()) {
      return;
    }
    const parsed = JSON.parse(data);
    cachedState = pruneState(parsed);
  } catch (error) {
    console.error('[Server] Error reading or parsing arena-state.json asynchronously:', error.message);
  } finally {
    isReading = false;
    if (pendingRead) {
      pendingRead = false;
      loadStateAsync();
    }
  }
}

// Initial load on startup
await loadStateAsync();

// Setup file watch to update memory cache when the file is modified externally
try {
  fs.watch(STATE_FILE_PATH, (eventType) => {
    if (eventType === 'change') {
      if (Date.now() - lastServerWriteTime < 1000) {
        return;
      }
      loadStateAsync();
    }
  });
} catch (err) {
  console.warn('[Server] Could not watch state file directly, watching directory instead:', err.message);
  try {
    fs.watch(path.dirname(STATE_FILE_PATH), (eventType, filename) => {
      if (filename === path.basename(STATE_FILE_PATH)) {
        if (Date.now() - lastServerWriteTime < 1000) {
          return;
        }
        loadStateAsync();
      }
    });
  } catch (dirWatchErr) {
    console.error('[Server] Failed to watch directory:', dirWatchErr.message);
  }
}

function readState() {
  return cachedState;
}

// 1. /api/auctions: Return list of active and settled auctions (capped)
app.get('/api/auctions', (req, res) => {
  const state = readState();
  const auctions = state.auctions || [];
  
  const active = [];
  const settled = [];
  for (const a of auctions) {
    if (a && a.settled) {
      settled.push(a);
    } else if (a) {
      active.push(a);
    }
  }
  const recentSettled = settled.slice(-100);
  const result = [...active, ...recentSettled].sort((a, b) => (a.id || 0) - (b.id || 0));
  res.json(result);
});

// 2. /api/bids: Return recent bids (capped to most recent 100)
app.get('/api/bids', (req, res) => {
  const state = readState();
  const bids = state.bids || [];
  res.json(bids.slice(0, 100));
});

// 3. /api/stats: Return agent leaderboard
app.get('/api/stats', (req, res) => {
  const state = readState();
  const statsObj = state.agentStats || {};

  const leaderboard = Object.keys(statsObj).map(name => ({
    name,
    ...statsObj[name]
  })).sort((a, b) => {
    if ((b.auctionsWon || 0) !== (a.auctionsWon || 0)) {
      return (b.auctionsWon || 0) - (a.auctionsWon || 0);
    }
    return (b.bidsPlaced || 0) - (a.bidsPlaced || 0);
  });

  res.json(leaderboard);
});

// 4. /api/metrics: Return real-time demo metrics (optimized to avoid array spreading)
app.get('/api/metrics', (req, res) => {
  const state = readState();
  const metrics = state.metrics || {};
  const auctions = state.auctions || [];
  const bids = state.bids || [];

  const totalBids = metrics.totalBids || bids.length;
  const totalAuctionsCreated = metrics.totalAuctionsCreated || auctions.length;
  const settledAuctions = metrics.totalAuctionsSettled || auctions.filter(a => a.settled).length;

  const totalGasUsed = Number(metrics.totalGasUsed || 0);
  const totalTransactions = totalBids + totalAuctionsCreated + settledAuctions;

  const avgGasCost = totalTransactions > 0 ? Math.round(totalGasUsed / totalTransactions) : 0;
  const totalGasSaved = totalGasUsed * 150;

  let auctionsPerMinute = metrics.auctionsPerMinute || 0;
  if (auctions.length > 1) {
    let firstTimestamp = null;
    let lastTimestamp = null;
    for (let i = 0; i < auctions.length; i++) {
      if (auctions[i] && auctions[i].timestamp) {
        firstTimestamp = auctions[i].timestamp;
        break;
      }
    }
    for (let i = auctions.length - 1; i >= 0; i--) {
      if (auctions[i] && auctions[i].timestamp) {
        lastTimestamp = auctions[i].timestamp;
        break;
      }
    }
    if (firstTimestamp && lastTimestamp && lastTimestamp > firstTimestamp) {
      const diffMinutes = (lastTimestamp - firstTimestamp) / 60000;
      if (diffMinutes > 0) {
        auctionsPerMinute = Number((auctions.length / diffMinutes).toFixed(2));
      }
    }
  }

  res.json({
    totalAuctionsCreated,
    totalAuctionsSettled: settledAuctions,
    totalBids,
    totalGasUsed: totalGasUsed.toString(),
    avgGasCost: avgGasCost.toString(),
    totalGasSaved: totalGasSaved.toString(),
    auctionsPerMinute: auctionsPerMinute || metrics.auctionsPerMinute || 0
  });
});

// 5. POST /api/state: Receive state updates from remote bot runner instances
app.post('/api/state', (req, res) => {
  if (req.body) {
    cachedState = pruneState(req.body);
    lastServerWriteTime = Date.now();
    // Persist locally too so it survives server restarts if storage persists
    fsPromises.writeFile(STATE_FILE_PATH, JSON.stringify(req.body, null, 2), 'utf8')
      .catch(err => {
        console.error('[Server] Error saving posted state locally:', err.message);
      });
    return res.json({ success: true });
  }
  res.status(400).json({ error: 'Invalid state body' });
});

app.listen(PORT, () => {
  console.log(`Express API Server running on port ${PORT}`);
  console.log(`Watching state file at: ${STATE_FILE_PATH}`);

  // Automatically start the bot runner as a child process (helps when hosting on a single instance like Railway)
  if (process.env.START_BOTS !== 'false') {
    const botsPath = path.join(process.cwd(), 'bots/agent-runner.js');
    if (fs.existsSync(botsPath)) {
      console.log(`[Server] Starting agent runner child process: ${botsPath}`);
      const botsProcess = spawn('node', [botsPath], {
        stdio: 'inherit',
        env: {
          ...process.env,
          API_URL: `http://localhost:${PORT}`
        }
      });
      botsProcess.on('error', (err) => {
        console.error('[Server] Failed to start agent runner:', err.message);
      });
    } else {
      console.log(`[Server] Agent runner file not found at ${botsPath}. Skipping auto-spawn. (Assuming bots are running in a separate service/process)`);
    }
  }
});
