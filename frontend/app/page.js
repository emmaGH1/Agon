"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy,
  Clock,
  Activity,
  Flame,
  ExternalLink,
  Cpu,
  ShieldAlert,
  Coins,
  Database,
  RefreshCw,
  Compass,
  ArrowRight,
  Sparkles,
  ChevronRight,
  Play
} from "lucide-react";

// API endpoints pointing to the hosted Express backend (supports local override via environment variable)
const getApiBase = () => {
  if (typeof window !== "undefined") {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return "http://localhost:3001/api";
    }
  }
  return process.env.NEXT_PUBLIC_API_URL || "https://agon-server.up.railway.app/api";
};
const BOHR_RPC = "https://rpc.bohr.life";
const BOHR_EXPLORER = "https://scan.bohr.life";

const AGENT_INFO = [
  {
    name: "CreatorBot",
    avatar: "/avatar-creator.png",
    role: "Arena Builder & Orchestrator",
    behavior: "Maintains simulation health. Deploys new timed micro-auctions on BOT Chain and triggers automatic settlement on expiration.",
    style: "System Builder",
    agg: 10,
    speed: 30,
    budget: 100,
  },
  {
    name: "AggressiveBot",
    avatar: "/avatar-aggressive.png",
    role: "Relentless Competitor",
    behavior: "Bids immediately at +15% increments with lightning fast reactions (200-500ms). Chases every active auction aggressively.",
    style: "Vanguard",
    agg: 95,
    speed: 95,
    budget: 70,
  },
  {
    name: "ConservativeBot",
    avatar: "/avatar-conservative.png",
    role: "Stealth Sniper",
    behavior: "Monitors remaining blocks silently. Snipes only in the final 20 blocks with a calculated +5% minimum outbid.",
    style: "Ghost Sniper",
    agg: 20,
    speed: 80,
    budget: 80,
  },
  {
    name: "RandomBot",
    avatar: "/avatar-random.png",
    role: "Chaotic Wildcard",
    behavior: "Reacts unpredictably (500-1500ms) with randomized bid increments (+5% to +15%). Kept active to disrupt logical bidding patterns.",
    style: "Glitch Jester",
    agg: 60,
    speed: 60,
    budget: 75,
  }
];

export default function Dashboard() {
  const [auctions, setAuctions] = useState([]);
  const [bids, setBids] = useState([]);
  const [stats, setStats] = useState([]);
  const [metrics, setMetrics] = useState({
    totalAuctionsCreated: 0,
    totalAuctionsSettled: 0,
    totalBids: 0,
    totalGasUsed: "0",
    avgGasCost: "0",
    totalGasSaved: "0",
    auctionsPerMinute: 0
  });

  const [currentBlock, setCurrentBlock] = useState(0);
  const [flashItems, setFlashItems] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Keep references of previous state to detect updates for the victory glow animation
  const prevBidsCountRef = useRef(0);
  const prevAuctionsBidCountRef = useRef({});

  // Detect scroll to transition header to glassmorphic sticky navbar
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 40);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Fetch data from Bohr RPC and Express API
  const fetchData = async () => {
    const API_BASE = getApiBase();
    try {
      // Fetch current block directly from Bohr Testnet RPC
      const rpcRes = await fetch(BOHR_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 })
      });
      const rpcJson = await rpcRes.json();
      if (rpcJson.result) {
        setCurrentBlock(parseInt(rpcJson.result, 16));
      }

      // Fetch auctions
      const auctionsRes = await fetch(`${API_BASE}/auctions`);
      const auctionsData = await auctionsRes.json();
      setAuctions(auctionsData);

      // Fetch bids
      const bidsRes = await fetch(`${API_BASE}/bids`);
      const bidsData = await bidsRes.json();
      setBids(bidsData);

      // Fetch agent stats
      const statsRes = await fetch(`${API_BASE}/stats`);
      const statsData = await statsRes.json();
      setStats(statsData);

      // Fetch metrics
      const metricsRes = await fetch(`${API_BASE}/metrics`);
      const metricsData = await metricsRes.json();
      setMetrics(metricsData);

      setError(null);
      setLoading(false);

      // Trigger glows for new events
      handleFlashAnimations(auctionsData, bidsData);

    } catch (err) {
      console.error("Dashboard polling error:", err);
      setError(`Failed to fetch telemetry data. Please ensure the backend server is running and accessible at: ${API_BASE}`);
      setLoading(false);
    }
  };

  // Victory gold glow triggers
  const handleFlashAnimations = (newAuctions, newBids) => {
    const newFlashes = {};
    let hasUpdates = false;

    // Flash if total bids count increases
    if (newBids.length > prevBidsCountRef.current && prevBidsCountRef.current > 0) {
      const newestBid = newBids[0];
      if (newestBid) {
        const key = `bid-${newestBid.auctionId}-${newestBid.timestamp}`;
        newFlashes[key] = true;
        hasUpdates = true;
      }
    }
    prevBidsCountRef.current = newBids.length;

    // Flash individual active auctions if their highest bid changes
    newAuctions.forEach(auction => {
      if (!auction.settled) {
        const prevBid = prevAuctionsBidCountRef.current[auction.id];
        if (prevBid !== undefined && auction.highestBid !== prevBid) {
          newFlashes[`auction-${auction.id}`] = true;
          hasUpdates = true;
        }
        prevAuctionsBidCountRef.current[auction.id] = auction.highestBid;
      }
    });

    if (hasUpdates) {
      setFlashItems(prev => ({ ...prev, ...newFlashes }));
      setTimeout(() => {
        setFlashItems(prev => {
          const cleared = { ...prev };
          Object.keys(newFlashes).forEach(k => delete cleared[k]);
          return cleared;
        });
      }, 1200);
    }
  };

  // Setup polling loop
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2500);
    return () => clearInterval(interval);
  }, []);

  const formatEthValue = (weiStr) => {
    if (!weiStr) return "0.00";
    const val = Number(weiStr) / 10 ** 18;
    return val.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  };

  const getAgentAddress = (name) => {
    if (name === "CreatorBot") return "0x8783545Fa67f35C5EB52F14468ae54411c272613";
    if (name === "AggressiveBot") return "0x22FE4C6f9289f5fa798e31301F1F926C4Ad89F6B";
    if (name === "ConservativeBot") return "0x0DC9b91e610ad4d17c3191B0137e3Cf5DaD44033";
    if (name === "RandomBot") return "0xB7c75Ee8032d547A790a8fc8AfD3F0736a964c89";
    return "";
  };

  // Smooth scroll links
  const handleNavClick = (e, targetId) => {
    e.preventDefault();
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth" });
  };

  // Filter active auctions based on blocksLeft > 0 and settled status
  const activeAuctions = auctions.filter(a => !a.settled && (currentBlock === 0 || a.endBlock > currentBlock));
  const settledAuctions = auctions.filter(a => a.settled).sort((a, b) => b.id - a.id);

  // Spotlight active auction is the one expiring soonest
  const spotlightAuction = activeAuctions.length > 0
    ? [...activeAuctions].sort((a, b) => (a.endBlock - currentBlock) - (b.endBlock - currentBlock))[0]
    : null;

  // Sidebar auctions are the remaining active auctions
  const sidebarAuctions = activeAuctions.filter(a => spotlightAuction && a.id !== spotlightAuction.id);

  const getAgentStatus = (agentName) => {
    if (agentName === "CreatorBot") {
      return { text: "ORCHESTRATING", color: "text-[#c5a059] border-[#c5a059]/20 bg-[#c5a059]/5 animate-pulse" };
    }

    // Check if leading any active auction
    const isLeading = activeAuctions.some(a => a.highestBidder.toLowerCase() === getAgentAddress(agentName).toLowerCase() && a.hasBids);
    if (isLeading) {
      return { text: "LEADING ARENA", color: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5 animate-pulse" };
    }

    if (agentName === "ConservativeBot") {
      const snipingWindow = activeAuctions.some(a => (a.endBlock - currentBlock) <= 20 && (a.endBlock - currentBlock) > 0);
      if (snipingWindow) {
        return { text: "SNIPING WINDOW", color: "text-amber-400 border-amber-500/20 bg-amber-500/5 animate-pulse" };
      }
    } else {
      const lastBid = bids[0];
      if (lastBid && lastBid.bidder === agentName) {
        return { text: "LAST BIDDER", color: "text-[#c5a059] border-[#c5a059]/20 bg-[#c5a059]/5 animate-pulse" };
      }
    }

    return { text: "WAITING", color: "text-[#a19e98] border-zinc-800 bg-zinc-900/5" };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center text-[#ececed] font-sans antialiased selection:bg-[#c5a059] selection:text-black">
        <div className="relative flex flex-col items-center gap-8">
          {/* Premium spinning ring loader */}
          <div className="relative w-24 h-24">
            <div className="absolute inset-0 rounded-full border-4 border-zinc-900" />
            <div className="absolute inset-0 rounded-full border-4 border-t-[#c5a059] border-r-[#c5a059]/40 border-b-transparent border-l-transparent animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <img
                src="/logo-arch.png"
                alt="AGON Logo"
                className="h-12 w-auto object-contain animate-pulse"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            </div>
          </div>
          
          <div className="text-center space-y-3">
            <h1 className="font-serif font-black text-3xl tracking-[0.3em] text-white uppercase animate-pulse">
              AGON
            </h1>
            <div className="flex items-center justify-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#c5a059] animate-ping" />
              <p className="text-[11px] font-mono tracking-[0.25em] text-[#8c8985] uppercase">
                Initializing Arena Telemetry...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-[#ececed] font-sans antialiased selection:bg-[#c5a059] selection:text-black">

      {/* 1. STICKY GLASSMORPHIC NAVBAR (Transitions on scroll) */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled
        ? "bg-[#09090b]/85 backdrop-blur-md border-b border-zinc-800/80 py-3 shadow-lg"
        : "bg-transparent border-b border-transparent py-5"
        }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center relative">

          {/* Logo & Brand (Using transparent logo-arch.png next to AGON) */}
          <a href="#" className="flex items-center gap-3 group">
            <div className="h-9 w-9 overflow-hidden flex items-center justify-center">
              <img
                src="/logo-arch.png"
                alt="AGON Logo"
                className="h-full w-auto object-contain transform group-hover:scale-105 transition-transform duration-300"
              />
            </div>
            <span className="font-serif font-black text-xl tracking-[0.3em] text-white uppercase">
              AGON
            </span>
          </a>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-10 text-[11px] font-sans font-light tracking-[0.22em] uppercase text-[#8c8985]">
            <a
              href="#arena"
              onClick={(e) => handleNavClick(e, "arena")}
              className="hover:text-white transition-colors relative group/nav"
            >
              Arena
              <span className="absolute bottom-[-4px] left-0 w-0 h-[1px] bg-[#c5a059] group-hover/nav:w-full transition-all duration-300" />
            </a>
            <a
              href="#agents"
              onClick={(e) => handleNavClick(e, "agents")}
              className="hover:text-white transition-colors relative group/nav"
            >
              Combatants
              <span className="absolute bottom-[-4px] left-0 w-0 h-[1px] bg-[#c5a059] group-hover/nav:w-full transition-all duration-300" />
            </a>
            <a
              href="#telemetry"
              onClick={(e) => handleNavClick(e, "telemetry")}
              className="hover:text-white transition-colors relative group/nav"
            >
              Telemetry
              <span className="absolute bottom-[-4px] left-0 w-0 h-[1px] bg-[#c5a059] group-hover/nav:w-full transition-all duration-300" />
            </a>
            <a
              href="#narrative"
              onClick={(e) => handleNavClick(e, "narrative")}
              className="hover:text-white transition-colors relative group/nav"
            >
              System
              <span className="absolute bottom-[-4px] left-0 w-0 h-[1px] bg-[#c5a059] group-hover/nav:w-full transition-all duration-300" />
            </a>
          </nav>

          {/* Right side spacer (block counter removed) */}
          <div className="hidden md:block" />

          {/* 2-Dash Hamburger Menu for Mobile */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden flex flex-col justify-center items-center gap-1.5 w-6 h-6 border-0 bg-transparent cursor-pointer z-50 relative"
            aria-label="Toggle Navigation Menu"
          >
            <span className={`h-[1.5px] w-6 bg-[#ececed] rounded transition-transform duration-300 ${isMobileMenuOpen ? "rotate-45 translate-y-[3.75px]" : ""
              }`} />
            <span className={`h-[1.5px] w-6 bg-[#ececed] rounded transition-transform duration-300 ${isMobileMenuOpen ? "-rotate-45 -translate-y-[3.75px]" : ""
              }`} />
          </button>
        </div>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-[#09090b]/95 backdrop-blur-md border-b border-zinc-800 flex flex-col p-6 space-y-4 text-center font-mono text-[10px] uppercase tracking-[0.2em] animate-fadeIn">
            <a
              href="#arena"
              onClick={(e) => { setIsMobileMenuOpen(false); handleNavClick(e, "arena"); }}
              className="text-[#a19e98] hover:text-white py-2"
            >
              Arena
            </a>
            <a
              href="#agents"
              onClick={(e) => { setIsMobileMenuOpen(false); handleNavClick(e, "agents"); }}
              className="text-[#a19e98] hover:text-white py-2"
            >
              Combatants
            </a>
            <a
              href="#telemetry"
              onClick={(e) => { setIsMobileMenuOpen(false); handleNavClick(e, "telemetry"); }}
              className="text-[#a19e98] hover:text-white py-2"
            >
              Telemetry
            </a>
            <a
              href="#narrative"
              onClick={(e) => { setIsMobileMenuOpen(false); handleNavClick(e, "narrative"); }}
              className="text-[#a19e98] hover:text-white py-2"
            >
              System
            </a>
          </div>
        )}
      </header>

      {/* 2. HERO SECTION (Full viewport screen - Reverted to previous background colosseum.jpg) */}
      <section className="relative h-screen flex flex-col justify-between overflow-hidden bg-[#09090b]">
        {/* Reverted Backdrop Image & Original Deep Overlay Opacity */}
        <div className="absolute inset-0 z-0">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-[0.24] mix-blend-luminosity transform scale-100 transition-opacity duration-700 animate-fadeIn"
            style={{ backgroundImage: `url('/colosseum.jpg')` }}
          />
          {/* Darker overlay for dramatic cinematic effect */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#09090b]/60 via-[#09090b]/90 to-[#09090b]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-transparent via-[#09090b]/60 to-[#09090b]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[750px] h-[550px] rounded-full bg-[#c5a059]/3 blur-[130px]" />

          {/* Keyline Arches Backdrop */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.03] flex justify-center items-center" aria-hidden="true">
            <svg
              className="h-[75%] animate-[archPulse_8s_ease-in-out_infinite] text-[#c5a059]"
              viewBox="0 0 800 600" fill="none" xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M100 600V300C100 134.315 234.315 0 400 0C565.685 0 700 134.315 700 300V600" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* Header spacer (Completely removed duplicate inner header container) */}
        <div className="h-28 shrink-0 relative z-10" />

        {/* Center Content with Framer Motion Staggered Animations */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex-1 flex flex-col justify-center items-center text-center">
          <div className="max-w-4xl space-y-6">

            {/* Title (Scaled down to fit screen properly without overflow) */}
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              className="font-serif text-3xl sm:text-5xl lg:text-[4.75rem] font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-[#fcfbf9] to-[#c5a059] leading-[1.1] tracking-[0.05em] uppercase select-none"
            >
              THE ON-CHAIN COLLISION <br />OF AUTONOMOUS AGENTS
            </motion.h1>

            {/* Description (Framer Motion delayed slide-up) */}
            <motion.p
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
              className="max-w-2xl mx-auto text-xs sm:text-sm text-[#a19e98] font-sans font-light tracking-wide leading-relaxed"
            >
              Watch aggressive, conservative, and randomized agents clash in rapid, block-timed micro-auctions on BOT Chain. Real transactions, instant refunds, and high-frequency economics at near-zero costs.
            </motion.p>

            {/* CTA Button (Framer Motion delayed slide-up) */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
              className="pt-3"
            >
              <a
                href="#arena"
                onClick={(e) => handleNavClick(e, "arena")}
                className="group px-7 py-3.5 bg-gradient-to-r from-[#d4af37] via-[#c5a059] to-[#d4af37] hover:from-[#c5a059] hover:to-[#b38f4d] text-[#0c0c0e] font-bold tracking-widest uppercase rounded-full border border-[#f0e7d5]/35 shadow-[0_0_20px_rgba(197,160,89,0.2)] hover:shadow-[0_0_30px_rgba(197,160,89,0.45)] transform hover:-translate-y-0.5 transition-all duration-300 inline-flex items-center gap-2 cursor-pointer font-mono text-[11px]"
              >
                ENTER THE ARENA <Play className="h-3 w-3 fill-current transition-transform group-hover:translate-x-0.5" />
              </a>
            </motion.div>
          </div>
        </div>

        {/* Metrics Strip Pinned at Bottom */}
        <div className="relative z-10 w-full border-t border-zinc-800 bg-[#09090b]/85 backdrop-blur-sm shrink-0">
          <div className="max-w-7xl mx-auto px-4 py-5 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="flex items-center gap-4 bg-zinc-950/60 p-4 rounded-xl border border-zinc-800 shadow-sm">
              <div className="h-9 w-9 rounded-lg bg-[#c5a059]/10 flex items-center justify-center text-[#c5a059] border border-[#c5a059]/20">
                <Activity className="h-4.5 w-4.5 animate-pulse" />
              </div>
              <div>
                <p className="text-[9px] uppercase font-sans tracking-widest text-[#a19e98]">Auction Flow</p>
                <p className="text-lg font-bold font-mono text-white mt-0.5">
                  {metrics.auctionsPerMinute || "0.00"} <span className="text-[10px] text-[#a19e98] font-normal font-sans">/ min</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 bg-zinc-950/60 p-4 rounded-xl border border-zinc-800 shadow-sm">
              <div className="h-9 w-9 rounded-lg bg-[#c5a059]/10 flex items-center justify-center text-[#c5a059] border border-[#c5a059]/20">
                <Flame className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-[9px] uppercase font-sans tracking-widest text-[#a19e98]">Average Gas Cost</p>
                <p className="text-lg font-bold font-mono text-white mt-0.5">
                  {Number(metrics.avgGasCost || 0).toLocaleString()} <span className="text-[10px] text-[#a19e98] font-normal font-sans">gas</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 bg-zinc-950/60 p-4 rounded-xl border border-zinc-800 shadow-sm">
              <div className="h-9 w-9 rounded-lg bg-[#c5a059]/10 flex items-center justify-center text-[#c5a059] border border-[#c5a059]/20">
                <Database className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-[9px] uppercase font-sans tracking-widest text-[#a19e98]">Total Bids Placed</p>
                <p className="text-lg font-bold font-mono text-white mt-0.5">
                  {metrics.totalBids || 0} <span className="text-[10px] text-[#a19e98] font-normal font-sans">bids</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ERROR ALERT POPUP */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 mt-6 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 p-4 rounded-xl border border-red-900/30 bg-red-950/20 text-red-300 animate-pulse">
            <ShieldAlert className="h-5 w-5 shrink-0 text-red-500" />
            <p className="text-sm font-sans">{error}</p>
          </div>
        </div>
      )}

      {/* 2. THE ARENA (Live spotlight section) */}
      <main id="arena" className="max-w-7xl mx-auto px-4 py-20 sm:px-6 lg:px-8 space-y-16 relative">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="h-1 w-8 bg-[#c5a059] rounded" />
            <span className="text-xs font-mono uppercase tracking-[0.2em] text-[#c5a059]">LIVE CONFLICTS</span>
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl font-black text-white tracking-wide">
            THE ACTIVE ARENA
          </h2>
        </div>

        {activeAuctions.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-20 text-center rounded-xl border border-dashed border-zinc-800 bg-zinc-950/20 animate-fadeIn">
            <span className="h-16 w-16 rounded-full bg-zinc-900 flex items-center justify-center text-[#c5a059]/40 mb-4 border border-[#c5a059]/10">
              <Clock className="h-8 w-8" />
            </span>
            <p className="text-lg text-[#ececed] font-serif font-bold">The Arena Is Quiet</p>
            <p className="text-sm text-[#a19e98] font-sans mt-2 max-w-md mx-auto">No micro-auctions are currently active on-chain. CreatorBot will deploy a new combatant contract shortly...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

            {/* Spotlight Card (Spans 2 columns) - with Framer Motion hover effects */}
            {spotlightAuction && (
              <div className="lg:col-span-2 space-y-6">
                <div className="text-xs font-sans uppercase text-[#a19e98] tracking-[0.15em] flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#c5a059] animate-ping" />
                  <span>SPOTLIGHT: EXPIRING SOONEST</span>
                </div>

                {(() => {
                  const blocksRemaining = Math.max(0, spotlightAuction.endBlock - currentBlock);
                  const maxDuration = Math.max(80, blocksRemaining);
                  const progressPercent = Math.min(100, (blocksRemaining / maxDuration) * 100);
                  const isFlashed = flashItems[`auction-${spotlightAuction.id}`];

                  return (
                    <motion.div
                      layout
                      whileHover={{ y: -4, transition: { duration: 0.3 } }}
                      className={`relative flex flex-col justify-between overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 text-[#fafafa] shadow-md transition-all duration-300 p-6 sm:p-8 space-y-8 ${isFlashed ? "animate-gold-glow border-[#c5a059] shadow-[0_0_30px_rgba(197,160,89,0.15)]" : ""
                        }`}
                    >
                      {/* Decorative Gold Arch Backdrop */}
                      <div className="absolute top-0 right-0 w-64 h-64 pointer-events-none opacity-5 translate-x-12 -translate-y-12">
                        <svg viewBox="0 0 100 100" fill="none" className="w-full h-full text-[#c5a059]">
                          <path d="M0 100V50C0 22.38 22.38 0 50 0C77.62 0 100 22.38 100 50V100" stroke="currentColor" strokeWidth="4" />
                        </svg>
                      </div>

                      {/* Header */}
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-zinc-800">
                        <div>
                          <span className="text-[9px] font-sans text-[#c5a059] bg-zinc-900 border border-zinc-800 px-3 py-1 rounded tracking-[0.1em]">
                            AUCTION #{spotlightAuction.id}
                          </span>
                          <h3 className="font-serif text-2xl sm:text-3xl font-black text-white mt-3 leading-snug tracking-wider">
                            {spotlightAuction.itemName}
                          </h3>
                        </div>
                        <div className="text-left sm:text-right shrink-0">
                          <p className="text-[9px] font-sans text-[#a19e98] uppercase tracking-wider">Blocks Remaining</p>
                          <p className="font-mono text-lg font-bold text-white mt-1 flex items-center gap-1.5 justify-end">
                            <Clock className="h-4.5 w-4.5 text-[#c5a059]" /> {blocksRemaining} blocks
                          </p>
                        </div>
                      </div>

                      {/* Spotlight Stats Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 py-4">
                        <div className="space-y-1.5">
                          <p className="text-[9px] text-[#a19e98] uppercase font-sans tracking-wider">Current Highest Bid</p>
                          <p className="font-mono text-3xl font-black text-[#c5a059] tracking-tight">
                            {spotlightAuction.hasBids ? formatEthValue(spotlightAuction.highestBid) : formatEthValue(spotlightAuction.startingPrice)}
                            <span className="text-sm font-normal text-[#a19e98] ml-2">BOT</span>
                          </p>
                          <p className="text-[10px] font-sans text-[#6e6b66] mt-1">
                            {spotlightAuction.hasBids ? "Contested on-chain" : `Starting Price: ${formatEthValue(spotlightAuction.startingPrice)} BOT`}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <p className="text-[9px] text-[#a19e98] uppercase font-sans tracking-wider">Current Leader Address</p>
                          {spotlightAuction.hasBids ? (
                            <div className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-2 rounded-xl text-xs font-mono text-white mt-1">
                              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                              <span>{spotlightAuction.highestBidder}</span>
                            </div>
                          ) : (
                            <p className="text-xs font-sans text-[#6e6b66] italic mt-2">No agent has entered a bid yet</p>
                          )}
                        </div>
                      </div>

                      {/* Spotlight Progress Timer */}
                      <div className="space-y-2 pt-4 border-t border-zinc-800">
                        <div className="flex justify-between items-center text-[9px] font-sans text-[#a19e98] tracking-wide">
                          <span>Arena Settlement Deadline: block {spotlightAuction.endBlock}</span>
                          <span>{Math.round(progressPercent)}% left</span>
                        </div>
                        <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#b38f4d] via-[#c5a059] to-[#d4c09a] transition-all duration-1000"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      </div>
                    </motion.div>
                  );
                })()}
              </div>
            )}

            {/* Sidebar Active Auctions (1 Column) */}
            <div className="space-y-6">
              <div className="text-xs font-sans uppercase text-[#a19e98] tracking-[0.15em] flex items-center justify-between">
                <span>OTHER ACTIVE ({sidebarAuctions.length})</span>
                <span className="text-[#c5a059] font-mono">{activeAuctions.length} Total</span>
              </div>

              {sidebarAuctions.length === 0 ? (
                <div className="p-8 text-center rounded-xl border border-zinc-800 bg-zinc-950/30">
                  <p className="text-xs text-[#6e6b66] italic font-sans">No other auctions are currently active.</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
                  <AnimatePresence>
                    {sidebarAuctions.map(auction => {
                      const blocksRemaining = Math.max(0, auction.endBlock - currentBlock);
                      const maxDuration = Math.max(80, blocksRemaining);
                      const progressPercent = Math.min(100, (blocksRemaining / maxDuration) * 100);
                      const isFlashed = flashItems[`auction-${auction.id}`];

                      return (
                        <motion.div
                          key={auction.id}
                          layout
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -12 }}
                          whileHover={{ x: 2, borderLeftColor: "#c5a059" }}
                          className={`p-5 rounded-xl border border-zinc-800 bg-zinc-950 text-[#fafafa] shadow-sm transition-all duration-200 flex flex-col justify-between space-y-4 border-l-2 border-l-transparent ${isFlashed ? "animate-gold-glow border-zinc-800 border-l-[#c5a059]" : ""
                            }`}
                        >
                          <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
                            <span className="text-[9px] font-sans text-[#c5a059] bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 tracking-wide">
                              #{auction.id}
                            </span>
                            <span className="text-[10px] font-mono text-[#a19e98] flex items-center gap-1">
                              <Clock className="h-3 w-3 text-[#c5a059]" /> {blocksRemaining} blks
                            </span>
                          </div>

                          <div>
                            <h4 className="font-serif text-sm font-bold text-white leading-snug tracking-wider truncate">
                              {auction.itemName}
                            </h4>
                            <div className="flex justify-between items-end mt-2">
                              <div>
                                <p className="text-[9px] text-[#a19e98] uppercase font-sans">Highest Bid</p>
                                <p className="font-mono text-sm font-bold text-[#c5a059]">
                                  {auction.hasBids ? formatEthValue(auction.highestBid) : formatEthValue(auction.startingPrice)} <span className="text-[10px] font-normal text-[#a19e98]">BOT</span>
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-[9px] text-[#a19e98] uppercase font-sans">Leader</p>
                                <p className="text-[10px] font-mono text-white truncate max-w-[100px] mt-0.5">
                                  {auction.hasBids ? `${auction.highestBidder.slice(0, 6)}...` : "None"}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="h-1 w-full bg-zinc-900 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-[#b38f4d] to-[#c5a059]"
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>

          </div>
        )}

        {/* Settled Arena Grid */}
        <div className="space-y-6 pt-8 border-t border-zinc-800">
          <div className="flex items-center gap-2">
            <Compass className="h-4.5 w-4.5 text-[#a19e98]" />
            <h3 className="font-serif text-base tracking-wider text-[#a19e98] uppercase">
              RECENTLY SETTLED ARENA
            </h3>
          </div>

          {settledAuctions.length === 0 ? (
            <p className="text-xs text-[#6e6b66] italic font-sans">No completed auctions available yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {settledAuctions.slice(0, 6).map(auction => (
                <motion.div
                  key={auction.id}
                  whileHover={{ y: -2 }}
                  className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 text-[#fafafa] shadow-sm hover:bg-zinc-900/40 transition-colors flex justify-between items-center"
                >
                  <div className="min-w-0">
                    <p className="font-serif text-sm font-semibold text-white truncate">{auction.itemName}</p>
                    <p className="text-[9px] font-mono text-[#6e6b66] mt-0.5">Auction #{auction.id} · Ended block {auction.endBlock}</p>
                  </div>

                  <div className="text-right shrink-0 ml-4">
                    {auction.hasBids ? (
                      <>
                        <p className="font-mono text-sm font-bold text-[#c5a059]">
                          {formatEthValue(auction.highestBid)} BOT
                        </p>
                        <p className="text-[9px] font-mono text-[#a19e98] mt-0.5">
                          Won: {auction.highestBidder.slice(0, 6)}...
                        </p>
                      </>
                    ) : (
                      <p className="text-xs font-mono text-[#6e6b66] italic">Voided</p>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* 3. THE AGENTS SHOWCASE (Full section) */}
      <section id="agents" className="relative py-20 bg-[#0c0c0e] border-y border-zinc-800">
        <div className="absolute inset-0 opacity-[0.02] bg-cover bg-center" style={{ backgroundImage: `url('/colosseum.jpg')` }} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12 relative z-10">

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="h-1 w-8 bg-[#c5a059] rounded" />
              <span className="text-xs font-sans uppercase tracking-[0.2em] text-[#c5a059]">COMBATANTS & PERSONALITIES</span>
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl font-black text-white tracking-wide">
              THE AUTONOMOUS AGENTS
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {AGENT_INFO.map(agent => {
              const status = getAgentStatus(agent.name);

              // Extract wins / stats from active state
              const statObj = stats.find(s => s.name === agent.name);
              const wins = statObj ? statObj.auctionsWon : 0;
              const bidsPlaced = statObj ? statObj.bidsPlaced : 0;

              return (
                <motion.div
                  key={agent.name}
                  whileHover={{ y: -4 }}
                  className="bg-zinc-950 text-[#fafafa] border border-zinc-800 rounded-xl p-6 flex flex-col justify-between hover:border-[#c5a059]/30 hover:bg-zinc-900/30 transition-all duration-300 group shadow-sm"
                >
                  <div className="space-y-4">
                    {/* Header: Avatar + Status */}
                    <div className="flex justify-between items-start">
                      <div className="h-14 w-14 rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800 group-hover:border-[#c5a059]/30 transition-colors">
                        <img
                          src={agent.avatar}
                          alt={agent.name}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            e.target.style.display = "none";
                          }}
                        />
                      </div>
                      <span className={`text-[8px] font-sans font-bold tracking-widest px-2.5 py-1 rounded border ${status.color}`}>
                        {status.text}
                      </span>
                    </div>

                    {/* Info */}
                    <div>
                      <h3 className="text-lg font-serif font-black text-white group-hover:text-[#c5a059] transition-colors">{agent.name}</h3>
                      <p className="text-[9px] font-sans text-[#c5a059]/60 mt-0.5">{agent.role}</p>
                      <p className="text-xs text-[#8a8780] font-sans mt-3 leading-relaxed">{agent.behavior}</p>
                    </div>

                    {/* Compare Attributes */}
                    <div className="space-y-2 pt-2">
                      <div className="flex justify-between text-[9px] font-mono text-[#a19e98]">
                        <span>Aggressiveness</span>
                        <span>{agent.agg}%</span>
                      </div>
                      <div className="h-1 w-full bg-zinc-900 rounded-full overflow-hidden">
                        <div className="h-full bg-red-600/60" style={{ width: `${agent.agg}%` }} />
                      </div>

                      <div className="flex justify-between text-[9px] font-mono text-[#a19e98]">
                        <span>Response Speed</span>
                        <span>{agent.speed}%</span>
                      </div>
                      <div className="h-1 w-full bg-zinc-900 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500/60" style={{ width: `${agent.speed}%` }} />
                      </div>

                      <div className="flex justify-between text-[9px] font-mono text-[#a19e98]">
                        <span>Bidding Budget</span>
                        <span>{agent.budget}%</span>
                      </div>
                      <div className="h-1 w-full bg-zinc-900 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500/60" style={{ width: `${agent.budget}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* Telemetry Footer */}
                  <div className="mt-6 pt-4 border-t border-zinc-900 flex justify-between items-center text-[10px] font-mono text-[#6e6b66]">
                    <div>
                      <p className="text-[9px] uppercase font-sans tracking-wide text-[#a19e98]">Bids</p>
                      <p className="text-xs font-bold text-white mt-0.5">{bidsPlaced}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] uppercase font-sans tracking-wide text-[#a19e98]">Wins</p>
                      <p className="text-xs font-bold text-[#c5a059] mt-0.5">{wins}</p>
                    </div>
                  </div>

                </motion.div>
              );
            })}
          </div>

        </div>
      </section>

      {/* 4. LIVE LEADERBOARD + ACTIVITY FEED (Side-by-Side columns) */}
      <section id="telemetry" className="max-w-7xl mx-auto px-4 py-20 sm:px-6 lg:px-8 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">

          {/* Column Left: Leaderboard stats list */}
          <div className="space-y-6 bg-zinc-950 text-[#fafafa] border border-zinc-800 rounded-xl p-6 sm:p-8 shadow-sm">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-[#c5a059] animate-victory-pulse" />
                <span className="text-xs font-sans uppercase tracking-[0.2em] text-[#c5a059]">ARENA LEADERBOARD</span>
              </div>
              <h3 className="font-serif text-2xl font-black text-white tracking-wide border-b border-zinc-900 pb-3">
                Agent Statistics
              </h3>
            </div>

            <div className="space-y-4">
              {stats.length === 0 ? (
                <p className="text-xs text-[#6e6b66] italic">Loading telemetry leaderboard...</p>
              ) : stats.map((agent, index) => {
                const isWinner = index === 0;
                return (
                  <motion.div
                    key={agent.name}
                    whileHover={{ x: 2 }}
                    className={`p-4 rounded-lg border flex flex-col sm:flex-row justify-between sm:items-center bg-zinc-900/50 transition-all gap-4 ${isWinner ? "border-[#c5a059]/40 bg-gradient-to-r from-[#1f1a12]/20 to-transparent" : "border-zinc-850"
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-mono font-bold ${isWinner ? "bg-[#c5a059] text-black" : "bg-zinc-800 text-[#a19e98]"
                        }`}>
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                          {agent.name}
                          {isWinner && <Sparkles className="h-3 w-3 text-[#c5a059]" />}
                        </p>
                        <p className="text-[9px] font-sans text-[#a19e98] mt-0.5">
                          {agent.bidsPlaced} Bids Placed · {agent.auctionsWon} Settlements Won
                        </p>
                      </div>
                    </div>

                    <div className="text-left sm:text-right shrink-0 border-t sm:border-t-0 border-zinc-900 pt-2 sm:pt-0">
                      <p className="text-[8px] uppercase font-sans text-[#a19e98]">Bidding Gas Spent</p>
                      <p className="font-mono text-sm font-bold text-white mt-0.5">
                        {Number(agent.biddingGasSpent || 0).toLocaleString(undefined, { maximumFractionDigits: 6 })} <span className="text-[10px] font-normal text-[#a19e98]">BOT</span>
                      </p>
                    </div>
                  </motion.div>
                );
              })
              }
            </div>
          </div>

          {/* Column Right: Live Activity Log (Terminal ledger style) */}
          <div className="space-y-6 bg-zinc-950 text-[#fafafa] border border-zinc-800 rounded-xl p-6 sm:p-8 shadow-sm flex flex-col h-[520px]">
            <div className="space-y-2 shrink-0">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-[#a19e98]" />
                <span className="text-xs font-sans uppercase tracking-[0.2em] text-[#a19e98]">REAL-TIME LEDGER</span>
              </div>
              <h3 className="font-serif text-2xl font-black text-white tracking-wide border-b border-zinc-900 pb-3">
                Recent Actions
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin">
              {bids.length === 0 ? (
                <p className="text-xs text-[#6e6b66] italic">No active bidding logs recorded yet.</p>
              ) : (
                <AnimatePresence>
                  {bids.map((bid) => {
                    const key = `bid-${bid.auctionId}-${bid.timestamp}`;
                    const isFlashed = flashItems[key];

                    return (
                      <motion.div
                        key={key}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`p-3 rounded-lg border border-zinc-850 bg-zinc-900/40 flex justify-between items-start gap-3 transition-all duration-300 ${isFlashed ? "animate-gold-glow border-[#c5a059]" : ""
                          }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-white flex items-center gap-1.5 flex-wrap">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#c5a059]"></span>
                            <span className="font-sans font-bold">{bid.bidder}</span>
                            <span className="text-[#a19e98] font-normal">bid on</span>
                            <span className="font-serif text-[#c5a059] truncate font-bold">#{bid.auctionId}</span>
                          </div>

                          <p className="mt-1.5 font-mono text-xs font-black text-white">
                            {formatEthValue(bid.bidAmount)} <span className="text-[9px] font-normal text-[#a19e98]">BOT</span>
                          </p>
                        </div>

                        {bid.txHash && (
                          <a
                            href={`${BOHR_EXPLORER}/tx/${bid.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded bg-zinc-900 hover:bg-[#c5a059]/10 border border-zinc-800 text-[#a19e98] hover:text-[#c5a059] transition-all cursor-pointer shrink-0"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          </div>

        </div>
      </section>

      {/* 5. NARRATIVE & HOW IT WORKS + TECH STACK (Compact section) */}
      <section id="narrative" className="max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8 border-t border-zinc-800">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">

          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Cpu className="h-5 w-5 text-[#c5a059]" />
              <span className="text-xs font-sans uppercase tracking-[0.2em] text-[#c5a059]">HOW IT WORKS</span>
            </div>
            <h3 className="font-serif text-2xl font-black text-white">
              Agent-to-Agent Micro Economies
            </h3>
            <p className="text-sm text-[#8a8780] leading-relaxed font-sans font-light">
              Autonomous AI agents require rapid on-chain environments to trade compute, storage, and models directly. Standard chains fail because high transaction costs and long block times make micro-transactions economically unviable.
            </p>
            <p className="text-sm text-[#8a8780] leading-relaxed font-sans font-light">
              **AGON** operates directly on the BOT Chain. The smart contract enforces immediate payouts to outbid parties while the runner continuously handles autonomous on-chain block settlement.
            </p>
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-[#a19e98]" />
              <span className="text-xs font-sans uppercase tracking-[0.2em] text-[#a19e98]">TECHNICAL STACK</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                <p className="text-[9px] font-sans text-[#c5a059] uppercase tracking-wider">Network & Chain</p>
                <p className="text-xs font-bold text-white mt-1">BOT Chain Network</p>
                <p className="text-[9px] font-mono text-[#6e6b66] mt-0.5">Chain ID 968 · 1s blocks</p>
              </div>

              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                <p className="text-[9px] font-sans text-[#c5a059] uppercase tracking-wider">Smart Contract</p>
                <p className="text-xs font-bold text-white mt-1">Solidity 0.8</p>
                <p className="text-[9px] font-mono text-[#6e6b66] mt-0.5">Checks-Effects-Interactions</p>
              </div>

              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                <p className="text-[9px] font-sans text-[#c5a059] uppercase tracking-wider">Bot Toolchain</p>
                <p className="text-xs font-bold text-white mt-1">Ethers.js v6</p>
                <p className="text-[9px] font-mono text-[#6e6b66] mt-0.5">HD Mnemonic Derivation</p>
              </div>

              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                <p className="text-[9px] font-sans text-[#c5a059] uppercase tracking-wider">Telemetry API</p>
                <p className="text-xs font-bold text-white mt-1">Express API</p>
                <p className="text-[9px] font-mono text-[#6e6b66] mt-0.5">Static JSON State Database</p>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* RICH MULTI-COLUMN FOOTER */}
      <footer className="border-t border-zinc-800 bg-[#060608] text-[#8a8780] font-sans">
        <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <img src="/logo-arch.png" alt="AGON Logo" className="h-8 w-auto" />
              <span className="font-serif font-black text-base text-white tracking-[0.25em] uppercase">AGON</span>
            </div>
            <p className="text-xs leading-relaxed text-[#6e6b66] font-light">
              A dynamic, real-time autonomous agent economy simulator demonstrating high-frequency micro-auctions and instant settlement logic powered by BOT Chain.
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="font-serif font-semibold text-xs text-[#ececed] tracking-wider uppercase">RESOURCES</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a
                  href={`${BOHR_EXPLORER}/address/${getAgentAddress("CreatorBot")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#c5a059] transition-colors flex items-center gap-1.5"
                >
                  <Cpu className="h-3 w-3" /> CreatorBot Contract ↗
                </a>
              </li>
              <li>
                <a
                  href={`${BOHR_EXPLORER}/address/0xD9563Dc2888A5872abEa5AfE40971538D26387Ae`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#c5a059] transition-colors flex items-center gap-1.5"
                >
                  <ExternalLink className="h-3 w-3" /> Smart Contract ↗
                </a>
              </li>
              <li>
                <a
                  href="https://faucet.botchain.ai/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#c5a059] transition-colors flex items-center gap-1.5"
                >
                  <Coins className="h-3 w-3" /> Faucet System ↗
                </a>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="font-serif font-semibold text-xs text-[#ececed] tracking-wider uppercase">TELEMETRY API</h4>
            <ul className="space-y-2 text-xs font-mono text-[#6e6b66]">
              <li>
                <span className="text-[#c5a059]">GET</span> /api/auctions
              </li>
              <li>
                <span className="text-[#c5a059]">GET</span> /api/bids
              </li>
              <li>
                <span className="text-[#c5a059]">GET</span> /api/stats
              </li>
              <li>
                <span className="text-[#c5a059]">GET</span> /api/metrics
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="font-serif font-semibold text-xs text-[#ececed] tracking-wider uppercase">STATUS & CONFIG</h4>
            <ul className="space-y-2 text-[10px] font-mono text-[#6e6b66]">
              <li className="flex justify-between border-b border-zinc-900 pb-1">
                <span>RPC URL:</span>
                <span className="text-[#a19e98] truncate max-w-[120px]" title={BOHR_RPC}>rpc.bohr.life</span>
              </li>
              <li className="flex justify-between border-b border-zinc-900 pb-1">
                <span>Chain ID:</span>
                <span className="text-[#a19e98]">968</span>
              </li>
              <li className="flex justify-between border-b border-zinc-900 pb-1">
                <span>API Port:</span>
                <span className="text-[#a19e98]">3001 (Live)</span>
              </li>
              <li className="flex justify-between">
                <span>Client Engine:</span>
                <span className="text-[#a19e98]">Next.js 16</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-zinc-900 py-6 text-center text-[#6e6b66] font-mono text-[9px] tracking-widest uppercase">
          <p>AGON © 2026 • Powering Autonomous Economics On BOT Chain</p>
        </div>
      </footer>

    </div>
  );
}
