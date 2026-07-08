# Agent Bid Arena — Demo Presentation Script

This script outlines the step-by-step walkthrough for the project presentation and demo video.

---

## Part 1: Introduction & Narrative (Time: 0:00 - 0:45)
1. **Explain the Concept**: Introduce **Agent Bid Arena**. Explain that the project demonstrates rapid, agent-to-agent micro-transactions on BOT Chain (Bohr Testnet).
2. **Visual Proof**: Emphasize that these are real autonomous agents competing on-chain, utilizing distinct bidding behaviors (Aggressive, Conservative, Random), rather than static scripts.
3. **Low Cost / High Speed**: Highlight that BOT Chain's cheap gas costs and fast block times make high-frequency agent activity feasible.

---

## Part 2: Codebase Walkthrough (Time: 0:45 - 1:45)
1. **Smart Contract (`AgentBidArena.sol`)**:
   - Show the simple struct definition of `Auction`.
   - Point out `placeBid()`: highlight the custom reentrancy guard and the Checks-Effects-Interactions (CEI) pattern to route refunds safely.
   - Point out `settleAuction()`: show how winning bids are dispatched straight to the auction creator.
2. **Bot Orchestration (`agent-runner.js`)**:
   - Highlight the **Self-Funding** mechanism: how it derives 4 wallets and automatically seeds them with `1.0 BOT` from CreatorBot.
   - Show the block-listener: how it queries logs manually on every block using `provider.getLogs` to ensure robustness.
   - Point out the autonomous settlement hook: when `currentBlock >= endBlock`, CreatorBot settles the auction.
3. **Data Telemetry (`server/index.js`)**:
   - Show the Express API server endpoints and the dynamic calculation of gas savings (BOT Chain vs Ethereum).

---

## Part 3: Live Run Demonstration (Time: 1:45 - 3:00)
1. **Start the Backend**:
   - Run `npm run server` and show that the Express API is watching `data/arena-state.json`.
2. **Start the Bot Runner**:
   - Run `npm run bots`.
   - Show the console output:
     - Derivation of the four bot addresses.
     - Connection to Bohr Testnet and contract verification.
     - Self-funding transfers (if any wallets have low balances).
     - Live block updates (`Block #15540028 mined...`).
3. **Observe a Bidding Lifecycle**:
   - Show CreatorBot spawning a new auction (e.g., `"Quantum Core #482"`).
   - Watch the logs as bots react:
     - **AggressiveBot** jumps in immediately with a +15% increment.
     - **RandomBot** follows up with a random bid.
     - **ConservativeBot** waits until the final block to place a low increment bid.
   - Watch the block counts count down, and see the automated on-chain settlement trigger (`[Settler Success] Auction settled on-chain`).
4. **Query the Telemetry Endpoints**:
   - Open a browser or run a curl command to hit:
     - `http://localhost:3001/api/stats`: Show the real-time leaderboard (wins, bids placed, total gas spent).
     - `http://localhost:3001/api/metrics`: Highlight the total gas used and the estimated gas savings.
