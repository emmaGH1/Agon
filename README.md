Here's a clean, well-structured, and professional **README.md** for your project:

---

# Agon

**Agon** is an on-chain simulation that demonstrates high-frequency, agent-to-agent economic activity on BOT Chain. Multiple autonomous agents with distinct strategies compete in real-time micro-auctions, showcasing how BOT Chain’s speed and low fees make continuous agent interactions practical.

The project features a fully autonomous bot runner, a deployed smart contract, real-time telemetry, and a premium dashboard — all running live on BOT Chain’s testnet.

## Overview

In Agon, four specialized agents autonomously create, bid on, and settle auctions directly on-chain:

- **AggressiveBot**: Bids quickly with high increments.
- **ConservativeBot**: Waits until the final moments to snipe.
- **RandomBot**: Bids unpredictably with varying increments.
- **CreatorBot**: Creates new auctions and autonomously settles expired ones.

All actions — bidding, refunds, and settlements — happen on-chain with no human intervention required after launch.

## Key Features

- **Fully On-Chain Auctions**: Creation, bidding, refunds, and settlement all occur directly on BOT Chain.
- **Autonomous Agent System**: Agents run continuously with differentiated strategies and self-funding wallets.
- **Reliable Architecture**: Uses block polling with cursor tracking instead of fragile event filters, ensuring stability even on fast block times (~0.75s).
- **Real-time Telemetry**: Express API serves live auction data, bids, leaderboards, and metrics.
- **Premium Dashboard**: Next.js frontend with a dark Roman-inspired design, live block countdowns, and dynamic agent status.

## Tech Stack

| Layer              | Technology                          |
|--------------------|-------------------------------------|
| Smart Contract     | Solidity 0.8                       |
| Bot Orchestrator   | Node.js + Ethers.js                |
| Backend API        | Express.js                         |
| Frontend           | Next.js 15 + Tailwind CSS v4       |
| Data Storage       | JSON file (`arena-state.json`)     |
| Network            | Bohr Testnet (BOT Chain)           |

## Architecture

```
Smart Contract (AgentBidArena.sol)
        ↑
Bot Runner (agent-runner.js)
    - 4 specialized agents
    - Autonomous settlement
    - Self-funding system
        ↓
State File (arena-state.json)
        ↓
Express API Server
        ↓
Next.js Dashboard
```

## Live Deployment

- **Network**: Bohr Testnet (BOT Chain)
- **Chain ID**: 968
- **RPC**: `https://rpc.bohr.life`
- **Contract Address**: `0xD9563Dc2888A5872abEa5AfE40971538D26387Ae`
- **Block Explorer**: [View on Bohr Explorer](https://scan.bohr.life/address/0xD9563Dc2888A5872abEa5AfE40971538D26387Ae)

The system is currently running live with active agents creating and bidding on auctions.

## How to Run Locally

### 1. Prerequisites
- Node.js v18+
- A wallet mnemonic with testnet funds

### 2. Environment Variables
Create a `.env` file in the root:

```env
MNEMONIC="your mnemonic phrase here"
CONTRACT_ADDRESS="0xD9563Dc2888A5872abEa5AfE40971538D26387Ae"
RPC_URL="https://rpc.bohr.life"
PORT=3001
```

### 3. Run the Services

```bash
# 1. Start the bot runner (agents)
node bots/agent-runner.js

# 2. Start the telemetry API
node server/index.js

# 3. Start the frontend (in /frontend folder)
cd frontend
npm run dev
```

The dashboard will be available at `http://localhost:3000`.

## Project Highlights

- Fully autonomous on-chain settlement (no manual intervention needed)
- Resilient against fast block times and RPC instability
- Clear separation between on-chain logic and off-chain orchestration
- Production-style patterns (reentrancy protection, CEI pattern, proper error handling)
- Rich telemetry and observability

## Submission Context

This project was built for the **BOT Chain Builder Challenge #1**. It demonstrates practical agent-to-agent interaction on BOT Chain through continuous, low-cost, on-chain micro-auctions.

---

Would you like me to adjust anything? For example:
- Make it more concise?
- Add a “Getting Started” section with more detail?
- Include badges or a demo link section?
- Change the tone (more technical or more marketing-focused)?

Just let me know your preference.