# Project: Agent Bid Arena — BOT Chain Builder Challenge #1

## Context
Solo build for BOT Chain Builder Challenge #1.
Deadline: July 8, 2026, 23:59 UTC+8.
Submitting to Open Track (strong fit for AI Agent track as well).

Judging priorities this spec targets:
- BOT Chain integration (35%)
- Product completeness (25%)
- Innovation (20%)
- Presentation & demo quality (20%)

## Core Narrative
Autonomous agents with distinct behaviors competing against each other in
rapid on-chain micro-auctions. This demonstrates that agent-to-agent economic
activity is practical on BOT Chain because transactions are fast and
extremely cheap. The goal is to visually prove high-frequency, differentiated
agent interaction at scale — not just a script firing identical bids.

## Chain Configuration
- Network: BOT Chain Mainnet
- RPC: https://rpc.botchain.ai
- Chain ID: 677
- Explorer: https://scan.botchain.ai/
- Faucet: https://faucet.botchain.ai/basic

## Model Routing (Critical)
- Default to Gemini 3.5 Flash for all code generation, scaffolding, and iteration.
- Only use Claude Sonnet for difficult debugging when explicitly instructed.

## Contract (`contracts/AgentBidArena.sol`)
Single, clean contract:
- `createAuction(string memory itemName, uint256 durationInBlocks, uint256 startingPrice)`
- `placeBid(uint256 auctionId)`
- `settleAuction(uint256 auctionId)`
- `getAuction(uint256 auctionId)` (view)

Rules:
- Configurable auction duration in blocks (default ~5 blocks, ~3.75s)
- Only the previous highest bidder gets refunded when a new bid comes in
- No complex escrow, no oracles, no external dependencies
- Emit: `AuctionCreated`, `BidPlaced`, `AuctionSettled`, `BidRefunded`

## Bots (`bots/agent-runner.js`)
One runner script managing multiple autonomous agents:
- Runs 3–5 independent agent instances
- Each agent watches for new auctions and places bids
- Distinct behaviors per agent: aggressive (bids fast, high increments),
  conservative (waits, small increments), random (unpredictable timing/amount)
- All activity logged to console and to a structured data file
- Frame as "autonomous agents" in code/docs — do NOT claim real LLM inference

## Data Layer (for Frontend)
Simple local Express server (or regularly-updated JSON) exposing:
- Active auctions
- Recent bids (with tx hashes)
- Agent statistics (bids placed, auctions won, total gas spent)
- Demo metrics (auctions per minute, average gas cost)

Consumed by the frontend built separately in Google AI Studio.

## Definition of Done
1. Contract deployed and verified on the explorer, address confirmed.
2. Multiple differentiated agents actively creating, bidding on, and
   settling auctions on-chain.
3. Clean, structured data feed available for the frontend.
4. Demo clearly shows high-frequency agent activity with visible low gas costs.
5. `deploy.js` (or equivalent) documented and repeatable.

## Priority Order (build in this sequence; cut from the bottom if time runs out)
1. Contract deployed + confirmed on explorer (non-negotiable — no submission without this)
2. Agents placing real bids on-chain, at least 1 behavior type working
3. Data feed live and readable
4. All 3 agent behaviors distinct and visible
5. Agent leaderboard (most bids, most wins, lowest gas)
6. On-screen running metrics (total gas used, avg tx cost)
7. Easily adjustable agent count

## Out of Scope
- Complex escrow or multi-bidder refund logic beyond single-highest-bidder refund
- Real LLM calls inside agents (scripted/randomized behavior only)
- Heavy gas optimization
- Building the frontend (handled separately in Google AI Studio)
- Oracles or external dependencies

## Submission Assets (prepare after core build works)
- `docs/submission-writeup.md`
- `docs/demo-script.md` (step-by-step what to show in the video)