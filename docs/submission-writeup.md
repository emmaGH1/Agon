# Agent Bid Arena — BOT Chain Builder Challenge #1 Submission

## Project Overview
**Agent Bid Arena** is a real-time, on-chain simulation showcasing high-frequency agent-to-agent economic interaction on **BOT Chain**. 

The project demonstrates that micro-transactions and high-frequency agent economic behaviors are highly practical and cost-effective on BOT Chain. The demo features three autonomous agent instances with distinct bidding personalities competing in rapid, block-timed micro-auctions. Bids are refunded immediately to the outbid party, and auctions are settled on-chain directly by the agent runner itself.

---

## Live Deployment & Telemetry Info
- **Network**: Bohr Testnet (BOT Chain Testnet)
- **RPC URL**: `https://rpc.bohr.life`
- **Chain ID**: `968`
- **Contract Address**: `0xD9563Dc2888A5872abEa5AfE40971538D26387Ae`
- **Block Explorer**: [https://scan.bohr.life/address/0xD9563Dc2888A5872abEa5AfE40971538D26387Ae](https://scan.bohr.life/address/0xD9563Dc2888A5872abEa5AfE40971538D26387Ae)

---

## Technical Architecture

### 1. Smart Contract (`contracts/AgentBidArena.sol`)
- **State Structure**: An auction contains details of the item, creator, highest bidder, highest bid, end block, and settlement status.
- **`createAuction`**: Initiates a new timed micro-auction.
- **`placeBid`**: Payable function containing a custom, gas-efficient reentrancy guard. It implements the Checks-Effects-Interactions (CEI) pattern to update bidding state before executing low-level `.call` transfers to refund the previous highest bidder.
- **`settleAuction`**: Anyone can settle an ended auction (block number >= end block). The winning bid is immediately transferred to the auction creator.

### 2. Autonomous Agent Runner (`bots/agent-runner.js`)
- **Deterministic HD Wallets**: Derives 4 distinct bot accounts from a single mnemonic seed phrase (`m/44'/60'/0'/0/i`).
- **Autonomous Settlement**: The runner listens to mined blocks. The moment `block.number >= endBlock`, a bot account invokes `settleAuction` on-chain.
- **Self-Funding Mechanism**: Upon startup, the orchestrator checks child wallet balances and automatically transfers `1.0 BOT` from the main faucet wallet to any child wallet low on funds, allowing zero-friction execution.
- **Differentiated Bidding Personalities**:
  1. **AggressiveBot**: Reacts fast (0.5s–1s delay) and places high bids (+15% increment).
  2. **ConservativeBot**: Waits until the last 1–2 blocks of the auction and places low-increment bids (+2% increment).
  3. **RandomBot**: Bids unpredictably (+5% to +15% increment, 1s–3s delay).
- **Demo Orchestrator**: The CreatorBot periodically spawns new auctions when active counts drop below 2 to keep the live simulation active.
- **Telemetry Logger**: Records all activity, transaction hashes, and gas costs to `data/arena-state.json`.

### 3. Data Telemetry API (`server/index.js`)
- An Express server serving real-time metrics and state to the frontend:
  - `/api/auctions`: All active and settled auctions.
  - `/api/bids`: Bidding history with TX hashes and bidder identities.
  - `/api/stats`: Leaderboard tracking bids placed, auctions won, and gas spent.
  - `/api/metrics`: Aggregated stats like auctions/minute, average gas cost, and total bids.

---

## Hackathon Evaluation & Key Highlights

1. **BOT Chain Integration**: Compete entirely on-chain. Demonstrates extremely low transaction costs (fractions of a cent) and rapid block confirmation cycles (~0.75s).
2. **Product Completeness**: The contract is deployed and verified, the multi-bot orchestrator actively simulates competing agents, and the local telemetry server exposes clean JSON endpoints for frontend visualization.
3. **Innovation**: Uses a stateless, block-polling architecture instead of vulnerable persistent filters, making it highly reliable even on nodes with RPC connection limits. Fully self-funding child wallets from a single master mnemonic.
