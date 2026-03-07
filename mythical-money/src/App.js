import { useState, useEffect, useCallback } from "react";
import { db } from "./firebase";
import { ref, onValue, set } from "firebase/database";

const STARTING_STACK = 100000;
const DB_KEY = "season";

const fmt = (n) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 0 });
const fmtShort = (n) => Math.abs(n) >= 1000 ? "$" + (n / 1000).toFixed(0) + "K" : fmt(n);
const nowTimestamp = () => new Date().toISOString();
const fmtTime = (iso) => { if (!iso) return ""; const d = new Date(iso); return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" }) + " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }); };

const SPORTS = ["NBA", "WWE", "MMA/Boxing", "NFL", "MLB", "WNBA", "Other"];

const BET_TYPES = [
  { label: "Straight Win/Loss", multiplier: "1x", sports: "ALL" },
  { label: "Spread Bet", multiplier: "1.5x", sports: "NBA / NFL / MLB" },
  { label: "Over/Under", multiplier: "1x", sports: "ALL" },
  { label: "Player Prop", multiplier: "1x", sports: "NBA / MLB / WNBA" },
  { label: "2-Leg Parlay", multiplier: "3x", sports: "ALL" },
  { label: "3-Leg Parlay", multiplier: "6x", sports: "ALL" },
  { label: "Method of Victory", multiplier: "2.5x", sports: "WWE / MMA" },
  { label: "Championship Futures", multiplier: "5x", sports: "ALL" },
  { label: "Title Change", multiplier: "1.5x", sports: "WWE" },
  { label: "Nemesis Bet", multiplier: "20% of stack", sports: "ALL" },
  { label: "Sniper Bet", multiplier: "10x", sports: "ALL" },
  { label: "Blind Bet", multiplier: "2x", sports: "ALL" },
  { label: "Wild Card", multiplier: "1x", sports: "ANY" },
];

function getPleTiers(matchCount) {
  const n = Math.max(4, Math.min(8, matchCount || 5));
  return { 4:[20000,16000,12000,8000], 5:[25000,20000,15000,10000,5000], 6:[30000,25000,20000,15000,10000,5000], 7:[35000,30000,25000,20000,15000,10000,5000], 8:[40000,35000,30000,25000,20000,15000,10000,5000] }[n];
}

const SPECIAL_MODES = [
  { icon:"👑", name:"KING'S CLAIM", key:"kings_claim", color:"#D4A017", border:"#3A2A0A", body:"If one player is down by more than $30,000 MM at any point, the trailing player can invoke King's Claim. Once activated, all of that player's H2H bets pay out at 1.5x until the gap closes to under $15,000. One use per season.", trigger:"Down by more than $30,000 MM", payout:"1.5x on all H2H bets until gap < $15K", limit:"One use per player per season", trackPer:"player" },
  { icon:"🔥", name:"DOUBLE DOWN WEEK", key:"double_down", color:"#E06C75", border:"#3A1A1A", body:"Once per season, either player can declare a Double Down Week. All H2H bet payouts are doubled (2x) for 7 consecutive days. Must be declared before the week begins — no retroactive activation.", trigger:"Declared by either player before the week starts", payout:"2x on all H2H bets for 7 days", limit:"One declaration per season total", trackPer:"season" },
  { icon:"⛓️", name:"CHAIN GAME", key:"chain_game", color:"#6FA8DC", border:"#1A2A3A", body:"Pick 5 consecutive bets across any sport and declare them a Chain before the first one starts. Win all 5 and collect a 15x bonus on your original stake. Lose any single one and you only get normal payouts.", trigger:"Declared before the first of 5 consecutive bets", payout:"15x bonus on stake if all 5 hit", limit:"One Chain Game active per player at a time", trackPer:"player" },
  { icon:"💀", name:"NEMESIS BET", key:"nemesis", color:"#E06C75", border:"#3A1A1A", body:"The nuclear option. Winner takes 20% of the loser's TOTAL current stack — not just the wager. Both players must verbally agree before it activates. H2H only.", trigger:"Mutual agreement by both players before the event", payout:"Winner takes 20% of loser's entire stack", limit:"One per season", trackPer:"season" },
  { icon:"🎯", name:"SNIPER BET", key:"sniper", color:"#6EC98A", border:"#1A2A1A", body:"Call something wildly specific — a buzzer-beater, exact round KO, mid-match title change. If it happens exactly as called: 10x payout. Can be solo or H2H. One Sniper Bet per player per season.", trigger:"Specific outcome called before the event", payout:"10x the wager if it hits exactly", limit:"One per player per season", trackPer:"player" },
  { icon:"🃏", name:"BLIND BET", key:"blind_bet", color:"#C792EA", border:"#2A1A3A", body:"Both players write down their pick secretly before revealing simultaneously. Winner collects 2x on the wager. Works for any sport, any event.", trigger:"Both picks locked in secretly before the event", payout:"2x the wager", limit:"No limit — use anytime", trackPer:"none" },
];

const PLAYER_COLORS = [
  { label:"Gold", highlight:"#D4A017", font:"#080808" },
  { label:"Blue", highlight:"#1d4ed8", font:"#ffffff" },
  { label:"Red", highlight:"#9b1c1c", font:"#ffffff" },
  { label:"Green", highlight:"#166534", font:"#ffffff" },
  { label:"Purple", highlight:"#6d28d9", font:"#ffffff" },
  { label:"Orange", highlight:"#c2410c", font:"#ffffff" },
  { label:"Teal", highlight:"#0d9488", font:"#ffffff" },
  { label:"Pink", highlight:"#be185d", font:"#ffffff" },
  { label:"Silver", highlight:"#6b7280", font:"#ffffff" },
  { label:"White", highlight:"#e5e7eb", font:"#080808" },
];

// ── THEMES ────────────────────────────────────────────────────────────────────
const THEMES = {
  obsidian: {
    name: "Obsidian", icon: "⬛",
    bg: "#080808", surface: "#0E0E0E", surface2: "#111111",
    border: "#1A1A1A", border2: "#2A2A2A",
    text: "#E8E4DC", textMuted: "#444444", textDim: "#2A2A2A",
    gold: "#D4A017", goldBright: "#F5C842",
    titleFrom: "#F5C842", titleTo: "#D4A017",
    inputBg: "#111111", inputBorder: "#2A2A2A",
    scrollTrack: "#111", scrollThumb: "#333",
    modalBg: "#0D0D0D", modalOverlay: "rgba(0,0,0,0.9)",
    rowHover: "#0F0F0F",
  },
  slate: {
    name: "Slate", icon: "🌑",
    bg: "#111827", surface: "#1F2937", surface2: "#1A2332",
    border: "#2D3748", border2: "#374151",
    text: "#E2E8F0", textMuted: "#64748B", textDim: "#374151",
    gold: "#F0B429", goldBright: "#FBBF24",
    titleFrom: "#FBBF24", titleTo: "#F0B429",
    inputBg: "#1A2332", inputBorder: "#2D3748",
    scrollTrack: "#1F2937", scrollThumb: "#374151",
    modalBg: "#1A2332", modalOverlay: "rgba(0,0,0,0.85)",
    rowHover: "#243040",
  },
  light: {
    name: "Light", icon: "☀️",
    bg: "#F8F5EE", surface: "#FFFFFF", surface2: "#F3EFE6",
    border: "#E5DDD0", border2: "#D4C9B8",
    text: "#1A1208", textMuted: "#786A52", textDim: "#C9BAA4",
    gold: "#B8860B", goldBright: "#D4A017",
    titleFrom: "#8B6914", titleTo: "#3A2600",
    inputBg: "#FFFFFF", inputBorder: "#D4C9B8",
    scrollTrack: "#F3EFE6", scrollThumb: "#D4C9B8",
    modalBg: "#FFFFFF", modalOverlay: "rgba(0,0,0,0.5)",
    rowHover: "#FAF7F2",
  },
  lakers: {
    name: "Lakers", icon: "🟣",
    bg: "#1A0A2E", surface: "#24124A", surface2: "#1F0F40",
    border: "#3D1F6E", border2: "#552583",
    text: "#FDB927", textMuted: "#9B72CF", textDim: "#3D1F6E",
    gold: "#FDB927", goldBright: "#FFD04D",
    titleFrom: "#FFD04D", titleTo: "#FDB927",
    inputBg: "#1F0F40", inputBorder: "#552583",
    scrollTrack: "#1A0A2E", scrollThumb: "#552583",
    modalBg: "#1F0F40", modalOverlay: "rgba(10,0,20,0.92)",
    rowHover: "#2A1550",
  },
  celtics: {
    name: "Celtics", icon: "🍀",
    bg: "#001A0A", surface: "#002E14", surface2: "#00240F",
    border: "#004D22", border2: "#007A33",
    text: "#FFFFFF", textMuted: "#5DAF7A", textDim: "#004D22",
    gold: "#BA9653", goldBright: "#D4AF6A",
    titleFrom: "#FFFFFF", titleTo: "#D4AF6A",
    inputBg: "#00240F", inputBorder: "#007A33",
    scrollTrack: "#001A0A", scrollThumb: "#007A33",
    modalBg: "#001E0C", modalOverlay: "rgba(0,10,4,0.92)",
    rowHover: "#003818",
  },
  dodgers: {
    name: "Dodgers", icon: "⚾",
    bg: "#001433", surface: "#00204F", surface2: "#001A42",
    border: "#003580", border2: "#005A9C",
    text: "#FFFFFF", textMuted: "#6FA8DC", textDim: "#003580",
    gold: "#EF3E42", goldBright: "#FF6B6E",
    titleFrom: "#FFFFFF", titleTo: "#6FA8DC",
    inputBg: "#001A42", inputBorder: "#005A9C",
    scrollTrack: "#001433", scrollThumb: "#005A9C",
    modalBg: "#001A42", modalOverlay: "rgba(0,10,30,0.92)",
    rowHover: "#002860",
  },
  redsox: {
    name: "Red Sox", icon: "🔴",
    bg: "#0C1020", surface: "#1A1830", surface2: "#141228",
    border: "#2A2448", border2: "#3D366A",
    text: "#FFFFFF", textMuted: "#BD3039", textDim: "#2A2448",
    gold: "#BD3039", goldBright: "#E04550",
    titleFrom: "#FFFFFF", titleTo: "#E04550",
    inputBg: "#141228", inputBorder: "#3D366A",
    scrollTrack: "#0C1020", scrollThumb: "#3D366A",
    modalBg: "#141228", modalOverlay: "rgba(5,5,15,0.92)",
    rowHover: "#201E38",
  },
  bloodline: {
    name: "Bloodline", icon: "🩸",
    bg: "#0A0000", surface: "#180808", surface2: "#120606",
    border: "#3A0A0A", border2: "#5A1010",
    text: "#F0E0DC", textMuted: "#8A4040", textDim: "#3A1010",
    gold: "#C0392B", goldBright: "#E74C3C",
    titleFrom: "#E74C3C", titleTo: "#8B0000",
    inputBg: "#120606", inputBorder: "#5A1010",
    scrollTrack: "#0A0000", scrollThumb: "#5A1010",
    modalBg: "#120606", modalOverlay: "rgba(10,0,0,0.93)",
    rowHover: "#1C0808",
  },
  trick: {
    name: "Trick", icon: "🤍",
    bg: "#F0F0F0", surface: "#FFFFFF", surface2: "#E8E8E8",
    border: "#D0D0D0", border2: "#B8B8B8",
    text: "#111111", textMuted: "#555555", textDim: "#C0C0C0",
    gold: "#111111", goldBright: "#333333",
    titleFrom: "#111111", titleTo: "#555555",
    inputBg: "#FFFFFF", inputBorder: "#C0C0C0",
    scrollTrack: "#E8E8E8", scrollThumb: "#C0C0C0",
    modalBg: "#FFFFFF", modalOverlay: "rgba(0,0,0,0.45)",
    rowHover: "#F0F0F0",
  },
  seth: {
    name: "Seth", icon: "👁️",
    bg: "#050510", surface: "#0D0D22", surface2: "#080818",
    border: "#1A1A40", border2: "#2A2A60",
    text: "#E0E0FF", textMuted: "#6060A0", textDim: "#1A1A40",
    gold: "#FF4500", goldBright: "#FF6B35",
    titleFrom: "#FF6B35", titleTo: "#CC2200",
    inputBg: "#080818", inputBorder: "#2A2A60",
    scrollTrack: "#050510", scrollThumb: "#2A2A60",
    modalBg: "#080818", modalOverlay: "rgba(2,2,15,0.93)",
    rowHover: "#10102A",
  },
  dominik: {
    name: "Dominik", icon: "😈",
    bg: "#080812", surface: "#10101E", surface2: "#0C0C18",
    border: "#1E1E3A", border2: "#2A2A50",
    text: "#D0D0F0", textMuted: "#505080", textDim: "#1E1E3A",
    gold: "#8A2BE2", goldBright: "#A855F7",
    titleFrom: "#A855F7", titleTo: "#6D28D9",
    inputBg: "#0C0C18", inputBorder: "#2A2A50",
    scrollTrack: "#080812", scrollThumb: "#2A2A50",
    modalBg: "#0C0C18", modalOverlay: "rgba(4,4,12,0.93)",
    rowHover: "#141428",
  },
  becky: {
    name: "Becky", icon: "🔥",
    bg: "#0F0500", surface: "#1E0C00", surface2: "#180800",
    border: "#3A1800", border2: "#5C2800",
    text: "#FFE4C4", textMuted: "#9A5020", textDim: "#3A1800",
    gold: "#FF6B00", goldBright: "#FF8C00",
    titleFrom: "#FF8C00", titleTo: "#CC4400",
    inputBg: "#180800", inputBorder: "#5C2800",
    scrollTrack: "#0F0500", scrollThumb: "#5C2800",
    modalBg: "#180800", modalOverlay: "rgba(10,4,0,0.93)",
    rowHover: "#221000",
  },
};

const RANK_BONUSES = [20000, 15000, 10000, 5000, 3000];
const blankRankings = () => Array(5).fill(null).map(()=>({name:"", notes:""}));

const initialState = {
  p1Name: "Player 1", p2Name: "Player 2",
  p1Balance: STARTING_STACK, p2Balance: STARTING_STACK,
  p1Color: { highlight:"#1d4ed8", font:"#ffffff" },
  p2Color: { highlight:"#E06C75", font:"#080808" },
  bets: [], season: new Date().getFullYear(),
  modeLog: [],
  p1Rankings: blankRankings(),
  p2Rankings: blankRankings(),
  rankingLog: [], // [{id, player, rank, wrestler, bonus, date, timestamp, titleWon}]
};

function recalcBalances(bets) {
  let p1 = STARTING_STACK, p2 = STARTING_STACK;
  [...bets].reverse().forEach((b) => {
    if (b.result === "Pending") return;
    if (b.isAdjustment) { if (b.adjustTarget==="p1") p1+=b.adjustAmount; else p2+=b.adjustAmount; return; }
    if (b.mode==="solo") {
      if (b.result==="Win") { if(b.soloPlayer==="p1") p1+=b.amount*(b.payout||1); else p2+=b.amount*(b.payout||1); }
      else if(b.result==="Loss") { if(b.soloPlayer==="p1") p1-=b.amount; else p2-=b.amount; }
    } else {
      if(b.betType==="PLE Card") { if(b.winner==="p1"){p1+=(b.p2Stake||0);p2-=(b.p2Stake||0);} else if(b.winner==="p2"){p2+=(b.p1Stake||0);p1-=(b.p1Stake||0);} }
      else { if(b.winner==="p1"){p1+=b.amount;p2-=b.amount;} else if(b.winner==="p2"){p2+=b.amount;p1-=b.amount;} }
    }
  });
  return { p1, p2 };
}

// CSV export
function exportCSV(bets, p1Name, p2Name) {
  const headers = ["Date","Time","Sport","Type","Mode","Description","P1 Pick","P2 Pick","Wager","Payout","Result","P1 Balance After","P2 Balance After","Notes"];
  const rows = bets.map(b => [
    b.date || "", fmtTime(b.timestamp) || "",
    b.sport || "", b.betType || "", b.mode || "",
    `"${(b.description||"").replace(/"/g,'""')}"`,
    `"${(b.p1Pick||"").replace(/"/g,'""')}"`,
    `"${(b.p2Pick||"").replace(/"/g,'""')}"`,
    b.amount || 0, b.payout || 1, b.result || "",
    b.p1BalAfter || "", b.p2BalAfter || "",
    `"${(b.notes||"").replace(/"/g,'""')}"`
  ].join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download="mythical-money-bets.csv"; a.click();
  URL.revokeObjectURL(url);
}

// CSV import
function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  return lines.slice(1).map((line, i) => {
    const vals = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g) || [];
    const clean = vals.map(v => v.replace(/^"|"$/g, "").replace(/""/g, '"'));
    const mode = clean[4] || "h2h";
    const notes = clean[13] || "";
    const rawP1Pick = clean[6] || "";
    const rawP2Pick = clean[7] || "";
    let soloPlayer = null;
    if (mode === "solo") {
      if (notes.includes("Solo: CG") || notes.includes("Solo: p1")) soloPlayer = "p1";
      else if (notes.includes("Solo: GB") || notes.includes("Solo: p2")) soloPlayer = "p2";
      else if (rawP1Pick && !rawP2Pick) soloPlayer = "p1";
      else if (rawP2Pick && !rawP1Pick) soloPlayer = "p2";
      else soloPlayer = "p1";
    }
    const p1Pick = mode === "solo" ? (soloPlayer === "p1" ? rawP1Pick : rawP2Pick) : rawP1Pick;
    const p2Pick = mode === "solo" ? "" : rawP2Pick;
    return {
      id: Date.now() + i,
      date: clean[0] || new Date().toISOString().slice(0,10),
      timestamp: null,
      sport: clean[2] || "Other",
      betType: clean[3] || "Straight Win/Loss",
      mode, soloPlayer,
      description: clean[5] || "",
      p1Pick, p2Pick,
      amount: parseInt(clean[8]) || 0,
      payout: parseFloat(clean[9]) || 1,
      result: clean[10] || "Pending",
      winner: "none",
      p1BalAfter: parseInt(clean[11]) || STARTING_STACK,
      p2BalAfter: parseInt(clean[12]) || STARTING_STACK,
      notes,
    };
  }).filter(b => b.description);
}

// ── PROFILE SELECTOR SCREEN ───────────────────────────────────────────────────
function ProfileSelector({ p1Name, p2Name, onSelect }) {
  const t = THEMES.obsidian;
  return (
    <div style={{background:t.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Georgia,serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');`}</style>
      <div style={{textAlign:"center",padding:40}}>
        <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:42,background:"linear-gradient(135deg,#F5C842,#D4A017)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:4,marginBottom:6}}>MYTHICAL MONEY</div>
        <div style={{fontSize:11,color:"#444",letterSpacing:4,marginBottom:48}}>WHO ARE YOU?</div>
        <div style={{display:"flex",gap:20,justifyContent:"center"}}>
          {[["p1",p1Name,"#1d4ed8"],["p2",p2Name,"#E06C75"]].map(([key,name,color])=>(
            <button key={key} onClick={()=>onSelect(key)}
              style={{background:"#0E0E0E",border:`2px solid ${color}`,borderRadius:6,padding:"32px 48px",cursor:"pointer",transition:"all .2s",minWidth:160}}
              onMouseEnter={e=>{e.currentTarget.style.background="#1A1A1A";e.currentTarget.style.transform="translateY(-3px)";}}
              onMouseLeave={e=>{e.currentTarget.style.background="#0E0E0E";e.currentTarget.style.transform="translateY(0)";}}>
              <div style={{width:48,height:48,borderRadius:"50%",background:color,margin:"0 auto 14px",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <span style={{fontFamily:"'Bebas Neue',cursive",fontSize:22,color:"#fff"}}>{name.slice(0,1)}</span>
              </div>
              <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:22,color:color,letterSpacing:2}}>{name}</div>
            </button>
          ))}
        </div>
        <div style={{fontSize:10,color:"#2A2A2A",marginTop:32,letterSpacing:2}}>YOUR THEME PREFERENCE SAVES TO THIS DEVICE</div>
      </div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState(initialState);
  const [tab, setTab] = useState("ledger");
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState("");
  const [showAddBet, setShowAddBet] = useState(false);
  const [editingBet, setEditingBet] = useState(null);
  const [showPLE, setShowPLE] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showLogMode, setShowLogMode] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [filterSport, setFilterSport] = useState("All");

  const [filterResult, setFilterResult] = useState("All");
  const [filterMode, setFilterMode] = useState("All");
  const [sortCol, setSortCol] = useState("timestamp");
  const [sortDir, setSortDir] = useState("desc");

  // Profile + theme (localStorage, per device)
  const [activePlayer, setActivePlayer] = useState(null); // null = show selector
  const [themeKey, setThemeKey] = useState("obsidian");

  // On mount: restore profile + theme from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("mm_player");
    const savedTheme = localStorage.getItem("mm_theme_" + saved);
    if (saved) setActivePlayer(saved);
    if (savedTheme && THEMES[savedTheme]) setThemeKey(savedTheme);
  }, []);

  const selectPlayer = (player) => {
    setActivePlayer(player);
    localStorage.setItem("mm_player", player);
    const savedTheme = localStorage.getItem("mm_theme_" + player);
    if (savedTheme && THEMES[savedTheme]) setThemeKey(savedTheme);
    else setThemeKey("obsidian");
  };

  const selectTheme = (key) => {
    setThemeKey(key);
    if (activePlayer) localStorage.setItem("mm_theme_" + activePlayer, key);
  };

  const T = THEMES[themeKey] || THEMES.obsidian;

  const blankForm = { date: new Date().toISOString().slice(0,10), sport:"NBA", betType:"Straight Win/Loss", mode:"h2h", soloPlayer:"p1", description:"", p1Pick:"", p2Pick:"", amount:"", payout:1, result:"Pending", winner:"none", soloResult:"Pending", notes:"" };
  const [form, setForm] = useState(blankForm);
  const [nameForm, setNameForm] = useState({ p1:"", p2:"" });

  const blankPLE = { eventName:"", date:new Date().toISOString().slice(0,10), matchCount:5, matches:Array(5).fill(null).map(()=>({match:"",p1Pick:"",p1Stake:null,p2Pick:"",p2Stake:null,p1Locked:false,p2Locked:false})) };
  const [pleForm, setPleForm] = useState(blankPLE);
  const [pleEntryPlayer, setPleEntryPlayer] = useState("p1");

  const blankAdjust = { target:"p1", amount:"", direction:"add", reason:"" };
  const [adjustForm, setAdjustForm] = useState(blankAdjust);

  const blankModeLog = { modeKey:"kings_claim", player:"p1", note:"" };
  const [modeLogForm, setModeLogForm] = useState(blankModeLog);

  // ── Rankings ──────────────────────────────────────────────────────────────
  const [editingRankings, setEditingRankings] = useState(false);
  const [rankForm, setRankForm] = useState({ p1: blankRankings(), p2: blankRankings() });
  const [showClaimBonus, setShowClaimBonus] = useState(false);
  const blankClaim = { player:"p1", rank:0, titleWon:"" };
  const [claimForm, setClaimForm] = useState(blankClaim);

  // ── Firebase ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const dbRef = ref(db, DB_KEY);
    const unsub = onValue(dbRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setState({ ...initialState, ...data });
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const saveToFirebase = useCallback(async (ns) => {
    setSaveStatus("saving");
    try { await set(ref(db, DB_KEY), ns); setSaveStatus("saved"); }
    catch (_) { setSaveStatus("error"); }
    setTimeout(() => setSaveStatus(""), 2500);
  }, []);

  const updateState = (updater) => {
    setState((prev) => { const next = typeof updater==="function" ? updater(prev) : updater; saveToFirebase(next); return next; });
  };

  // ── Sorting ───────────────────────────────────────────────────────────────
  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d==="asc"?"desc":"asc");
    else { setSortCol(col); setSortDir("desc"); }
  };
  const sortIndicator = (col) => sortCol===col ? (sortDir==="asc"?" ↑":" ↓") : " ↕";

  // ── Add / Edit bet ────────────────────────────────────────────────────────
  const openEditBet = (bet) => {
    setForm({
      date: bet.date, sport: bet.sport, betType: bet.betType,
      mode: bet.mode, soloPlayer: bet.soloPlayer || "p1",
      description: bet.description, p1Pick: bet.p1Pick||"", p2Pick: bet.p2Pick||"",
      amount: String(bet.amount), payout: bet.payout||1,
      result: bet.result==="Pending"?"Pending":"Settled",
      winner: bet.winner||"none", soloResult: bet.result||"Pending",
      notes: bet.notes||"",
    });
    setEditingBet(bet);
    setShowAddBet(true);
  };

  const saveBet = () => {
    if (!form.description || !form.amount) return;
    const amt = parseInt(String(form.amount).replace(/,/g,""));
    if (isNaN(amt)||amt<0) return;
    const isSolo = form.mode==="solo";
    const pOut = parseFloat(form.payout)||1;

    if (editingBet) {
      updateState((prev) => {
        const bets = (prev.bets||[]).map(b => b.id===editingBet.id ? {
          ...b, date:form.date, sport:form.sport, betType:form.betType,
          mode:form.mode, soloPlayer:isSolo?form.soloPlayer:null,
          description:form.description, p1Pick:form.p1Pick, p2Pick:form.p2Pick,
          amount:amt, payout:pOut, notes:form.notes,
        } : b);
        const {p1,p2} = recalcBalances(bets);
        return {...prev, bets, p1Balance:p1, p2Balance:p2};
      });
      setEditingBet(null);
    } else {
      let p1=state.p1Balance, p2=state.p2Balance;
      if (isSolo) {
        if(form.soloResult==="Win"){if(form.soloPlayer==="p1")p1+=amt*pOut;else p2+=amt*pOut;}
        else if(form.soloResult==="Loss"){if(form.soloPlayer==="p1")p1-=amt;else p2-=amt;}
      } else {
        if(form.result==="Settled"){if(form.winner==="p1"){p1+=amt;p2-=amt;}else if(form.winner==="p2"){p2+=amt;p1-=amt;}}
      }
      const bet = {
        id:Date.now(), timestamp:nowTimestamp(), date:form.date, sport:form.sport, betType:form.betType,
        mode:form.mode, soloPlayer:isSolo?form.soloPlayer:null,
        description:form.description, p1Pick:form.p1Pick, p2Pick:form.p2Pick,
        amount:amt, payout:pOut,
        result:isSolo?form.soloResult:form.result,
        winner:isSolo?null:form.winner,
        notes:form.notes, p1BalAfter:p1, p2BalAfter:p2,
      };
      updateState((prev) => ({...prev, bets:[bet,...(prev.bets||[])], p1Balance:p1, p2Balance:p2}));
    }
    setForm(blankForm); setShowAddBet(false);
  };

  // ── Adjustment ────────────────────────────────────────────────────────────
  const applyAdjustment = () => {
    const amt = parseInt(String(adjustForm.amount).replace(/,/g,""));
    if(isNaN(amt)||amt<=0) return;
    const signed = adjustForm.direction==="add"?amt:-amt;
    let p1=state.p1Balance, p2=state.p2Balance;
    if(adjustForm.target==="p1") p1+=signed; else p2+=signed;
    const record = {
      id:Date.now(), timestamp:nowTimestamp(), date:new Date().toISOString().slice(0,10),
      isAdjustment:true, adjustTarget:adjustForm.target, adjustAmount:signed,
      description:`Adjustment: ${adjustForm.direction==="add"?"+":"-"}${fmt(amt)} to ${adjustForm.target==="p1"?state.p1Name:state.p2Name}${adjustForm.reason?` — ${adjustForm.reason}`:""}`,
      sport:"—", betType:"Adjustment", mode:"adjust", result:"Applied", winner:"none",
      amount:0, p1BalAfter:p1, p2BalAfter:p2,
    };
    updateState((prev) => ({...prev, bets:[record,...(prev.bets||[])], p1Balance:p1, p2Balance:p2}));
    setAdjustForm(blankAdjust); setShowAdjust(false);
  };

  // ── Special Mode log ──────────────────────────────────────────────────────
  const logModeInvocation = () => {
    const entry = {
      id: Date.now(), key:modeLogForm.modeKey, player:modeLogForm.player,
      date:new Date().toISOString().slice(0,10), timestamp:nowTimestamp(),
      note:modeLogForm.note,
    };
    updateState((prev) => ({...prev, modeLog:[entry,...(prev.modeLog||[])]}));
    setModeLogForm(blankModeLog); setShowLogMode(false);
  };

  const deleteModeLog = (id) => {
    updateState((prev) => ({...prev, modeLog:(prev.modeLog||[]).filter(m=>m.id!==id)}));
  };

  // ── PLE ───────────────────────────────────────────────────────────────────
  const updatePleMatchCount = (n) => {
    const count=parseInt(n); const current=pleForm.matches; let updated;
    if(count>current.length) updated=[...current,...Array(count-current.length).fill(null).map(()=>({match:"",p1Pick:"",p1Stake:null,p2Pick:"",p2Stake:null,p1Locked:false,p2Locked:false}))];
    else updated=current.slice(0,count);
    setPleForm({...pleForm,matchCount:count,matches:updated});
  };

  const lockPlayerPicks = (player) => {
    const updated=pleForm.matches.map(m=>({...m,[`${player}Locked`]:true}));
    setPleForm({...pleForm,matches:updated});
    setPleEntryPlayer(player==="p1"?"p2":"p1");
  };

  const addPLECard = () => {
    if(!pleForm.eventName) return;
    const valid=pleForm.matches.filter(m=>m.match.trim());
    if(!valid.length) return;
    let p1=state.p1Balance, p2=state.p2Balance;
    const newBets=valid.map((m,i)=>({
      id:Date.now()+i, timestamp:nowTimestamp(), date:pleForm.date, sport:"WWE", betType:"PLE Card",
      mode:"h2h", soloPlayer:null,
      description:`[${pleForm.eventName}] ${m.match}`,
      p1Pick:m.p1Pick||"", p2Pick:m.p2Pick||"",
      p1Stake:m.p1Stake||0, p2Stake:m.p2Stake||0,
      amount:0, payout:1, result:"Pending", winner:"none",
      notes:"", p1BalAfter:p1, p2BalAfter:p2, pleEvent:pleForm.eventName,
    }));
    updateState((prev)=>({...prev,bets:[...newBets,...(prev.bets||[])],p1Balance:p1,p2Balance:p2}));
    setPleForm(blankPLE); setPleEntryPlayer("p1"); setShowPLE(false);
  };

  // ── Settle / Delete ───────────────────────────────────────────────────────
  const settleBet = (id, outcome) => {
    updateState((prev) => {
      const bet=(prev.bets||[]).find(b=>b.id===id);
      if(!bet||bet.result!=="Pending") return prev;
      let p1=prev.p1Balance, p2=prev.p2Balance, resultLabel="", winner="none";
      if(bet.betType==="PLE Card") {
        if(outcome==="p1"){p1+=(bet.p2Stake||0);p2-=(bet.p2Stake||0);resultLabel=prev.p1Name+" Wins";winner="p1";}
        else if(outcome==="p2"){p2+=(bet.p1Stake||0);p1-=(bet.p1Stake||0);resultLabel=prev.p2Name+" Wins";winner="p2";}
        else resultLabel="Push";
      } else if(bet.mode==="solo") {
        const pOut=bet.payout||1;
        if(outcome==="win"){if(bet.soloPlayer==="p1")p1+=bet.amount*pOut;else p2+=bet.amount*pOut;resultLabel="Win";}
        else if(outcome==="loss"){if(bet.soloPlayer==="p1")p1-=bet.amount;else p2-=bet.amount;resultLabel="Loss";}
        else resultLabel="Push";
      } else {
        if(outcome==="p1"){p1+=bet.amount;p2-=bet.amount;resultLabel=prev.p1Name+" Wins";winner="p1";}
        else if(outcome==="p2"){p2+=bet.amount;p1-=bet.amount;resultLabel=prev.p2Name+" Wins";winner="p2";}
        else resultLabel="Push";
      }
      const bets=(prev.bets||[]).map(b=>b.id===id?{...b,result:resultLabel,winner,p1BalAfter:p1,p2BalAfter:p2}:b);
      return{...prev,bets,p1Balance:p1,p2Balance:p2};
    });
  };

  const deleteBet = (id) => {
    updateState((prev) => { const remaining=(prev.bets||[]).filter(b=>b.id!==id); const{p1,p2}=recalcBalances(remaining); return{...prev,bets:remaining,p1Balance:p1,p2Balance:p2}; });
  };

  const resetSeason = () => { updateState({...initialState,p1Name:state.p1Name,p2Name:state.p2Name,p1Color:state.p1Color,p2Color:state.p2Color,season:new Date().getFullYear()}); setShowResetConfirm(false); };
  const saveNames = () => { updateState((prev)=>({...prev,p1Name:nameForm.p1||prev.p1Name,p2Name:nameForm.p2||prev.p2Name})); };
  const saveColor = (player, color) => { updateState((prev)=>({...prev,[`${player}Color`]:color})); setShowColorPicker(null); };

  // ── Rankings logic ────────────────────────────────────────────────────────
  const saveRankings = () => {
    updateState((prev) => ({
      ...prev,
      p1Rankings: rankForm.p1,
      p2Rankings: rankForm.p2,
    }));
    setEditingRankings(false);
  };

  const claimRankingBonus = () => {
    const { player, rank, titleWon } = claimForm;
    if (!titleWon.trim()) return;
    const rankings = player === "p1" ? (state.p1Rankings || blankRankings()) : (state.p2Rankings || blankRankings());
    const wrestler = rankings[rank]?.name;
    if (!wrestler) return;
    const bonus = RANK_BONUSES[rank];
    let p1 = state.p1Balance, p2 = state.p2Balance;
    if (player === "p1") p1 += bonus; else p2 += bonus;
    const entry = {
      id: Date.now(), timestamp: nowTimestamp(),
      date: new Date().toISOString().slice(0, 10),
      player, rank, wrestler, bonus, titleWon,
    };
    const adjRecord = {
      id: Date.now() + 1, timestamp: nowTimestamp(),
      date: new Date().toISOString().slice(0, 10),
      isAdjustment: true, adjustTarget: player,
      adjustAmount: bonus,
      description: `🏆 Power Rankings Bonus — ${wrestler} (Rank #${rank + 1}) won: ${titleWon}`,
      sport: "WWE", betType: "Adjustment", mode: "adjust", result: "Applied", winner: "none",
      amount: 0, p1BalAfter: p1, p2BalAfter: p2,
    };
    updateState((prev) => ({
      ...prev,
      bets: [adjRecord, ...(prev.bets || [])],
      rankingLog: [entry, ...(prev.rankingLog || [])],
      p1Balance: p1, p2Balance: p2,
    }));
    setClaimForm(blankClaim);
    setShowClaimBonus(false);
  };

  const deleteRankingLog = (id) => {
    updateState((prev) => ({ ...prev, rankingLog: (prev.rankingLog || []).filter(r => r.id !== id) }));
  };

  // ── CSV Import ────────────────────────────────────────────────────────────
  const handleImport = (e) => {
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=(ev)=>{
      const imported=parseCSV(ev.target.result);
      if(!imported.length){alert("No valid bets found in CSV.");return;}
      updateState((prev)=>{
        const all=[...(prev.bets||[]),...imported];
        const{p1,p2}=recalcBalances(all);
        return{...prev,bets:all,p1Balance:p1,p2Balance:p2};
      });
      alert(`Imported ${imported.length} bets.`);
    };
    reader.readAsText(file);
    e.target.value="";
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const bets = state.bets || [];
  const modeLog = state.modeLog || [];
  const p1Color = state.p1Color || { highlight:"#1d4ed8", font:"#ffffff" };
  const p2Color = state.p2Color || { highlight:"#E06C75", font:"#080808" };

  const filteredBets = bets.filter((b) => {
    if(b.isAdjustment) return filterMode==="All"||filterMode==="Adjustments";
    if(filterSport!=="All"&&b.sport!==filterSport) return false;
    if(filterResult==="Pending"&&b.result!=="Pending") return false;
    if(filterResult==="Settled"&&b.result==="Pending") return false;
    if(filterMode==="H2H"&&b.mode!=="h2h") return false;
    if(filterMode==="Solo"&&b.mode!=="solo") return false;
    if(filterMode==="Adjustments"&&!b.isAdjustment) return false;
    return true;
  });

  const sortedBets = [...filteredBets].sort((a,b) => {
    let av, bv;
    if(sortCol==="timestamp"||sortCol==="date") { av=a.timestamp||a.date||""; bv=b.timestamp||b.date||""; }
    else if(sortCol==="amount") { av=a.amount||0; bv=b.amount||0; }
    else if(sortCol==="result") { av=a.result||""; bv=b.result||""; }
    else if(sortCol==="sport") { av=a.sport||""; bv=b.sport||""; }
    else { av=a[sortCol]||""; bv=b[sortCol]||""; }
    if(av<bv) return sortDir==="asc"?-1:1;
    if(av>bv) return sortDir==="asc"?1:-1;
    return 0;
  });

  const h2hSettled=bets.filter(b=>b.mode==="h2h"&&b.result!=="Pending"&&b.result!=="Push");
  const stats={
    total:bets.filter(b=>!b.isAdjustment).length,
    pending:bets.filter(b=>b.result==="Pending").length,
    settled:bets.filter(b=>b.result!=="Pending"&&!b.isAdjustment).length,
    p1H2hW:bets.filter(b=>b.winner==="p1").length,
    p2H2hW:bets.filter(b=>b.winner==="p2").length,
    p1SW:bets.filter(b=>b.mode==="solo"&&b.soloPlayer==="p1"&&b.result==="Win").length,
    p2SW:bets.filter(b=>b.mode==="solo"&&b.soloPlayer==="p2"&&b.result==="Win").length,
    p1SL:bets.filter(b=>b.mode==="solo"&&b.soloPlayer==="p1"&&b.result==="Loss").length,
    p2SL:bets.filter(b=>b.mode==="solo"&&b.soloPlayer==="p2"&&b.result==="Loss").length,
    totalWagered:bets.filter(b=>!b.isAdjustment).reduce((s,b)=>s+(b.amount||0),0),
  };

  const modeUsageCount = (key, player) => modeLog.filter(m=>m.key===key&&(player?m.player===player:true)).length;

  const p1Lead=state.p1Balance>state.p2Balance;
  const tied=state.p1Balance===state.p2Balance;
  const sportColors={NBA:"#1d4ed8",WWE:"#9b1c1c","MMA/Boxing":"#6d28d9",NFL:"#166534",MLB:"#0e4d8a",WNBA:"#c2410c",Other:"#92400e"};

  const rc=(r)=>{
    const isDark = themeKey !== "light";
    if(r==="Pending") return{bg:isDark?"#3A2A0A":"#FEF3C7",color:"#D4A017"};
    if(r==="Push") return{bg:isDark?"#1A1A1A":"#F3F4F6",color:"#6B7280"};
    if(r==="Win") return{bg:isDark?"#0A2A1A":"#D1FAE5",color:"#059669"};
    if(r==="Loss") return{bg:isDark?"#2A0A0A":"#FEE2E2",color:"#E06C75"};
    if(r==="Applied") return{bg:isDark?"#1A1A2A":"#EDE9FE",color:"#6FA8DC"};
    return{bg:isDark?"#0A2A1A":"#D1FAE5",color:"#059669"};
  };

  const pleTiers=getPleTiers(pleForm.matchCount);
  const p1AllLocked=pleForm.matches.every(m=>m.p1Locked);
  const p2AllLocked=pleForm.matches.every(m=>m.p2Locked);
  const bothLocked=p1AllLocked&&p2AllLocked;

  const thStyle=(col)=>({ padding:"7px 9px", textAlign:"left", fontFamily:"'Bebas Neue',cursive", fontSize:10, letterSpacing:2, color:sortCol===col?T.gold:T.textMuted, whiteSpace:"nowrap", cursor:"pointer", userSelect:"none", background:sortCol===col?T.surface2:"transparent" });

  // Show profile selector if no player chosen
  if (!activePlayer) {
    return <ProfileSelector p1Name={state.p1Name} p2Name={state.p2Name} onSelect={selectPlayer} />;
  }

  if(loading) return (
    <div style={{background:T.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{fontFamily:"monospace",color:T.gold,fontSize:18,letterSpacing:4}}>LOADING...</div>
    </div>
  );

  return (
    <div style={{background:T.bg,minHeight:"100vh",fontFamily:"Georgia,serif",color:T.text}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
        *{box-sizing:border-box} input,select,textarea{font-family:'DM Sans',sans-serif}
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:${T.scrollTrack}} ::-webkit-scrollbar-thumb{background:${T.scrollThumb};border-radius:2px}
        .bg{background:linear-gradient(135deg,${T.goldBright},${T.gold});color:${themeKey==="light"?"#1A1208":"#080808"};border:none;font-family:'Bebas Neue',cursive;letter-spacing:2px;cursor:pointer;transition:opacity .2s,transform .1s}
        .bg:hover{opacity:.9;transform:translateY(-1px)}
        .gh{background:transparent;border:1px solid ${T.border2};color:${T.textMuted};font-family:'DM Sans',sans-serif;cursor:pointer;transition:border-color .2s,color .2s}
        .gh:hover{border-color:${T.gold};color:${T.gold}}
        .tb{background:transparent;border:none;cursor:pointer;font-family:'Bebas Neue',cursive;letter-spacing:2px;padding:10px 10px;font-size:12px;transition:all .2s}
        .fi{background:${T.inputBg};border:1px solid ${T.inputBorder};color:${T.text};padding:8px 12px;border-radius:2px;width:100%;font-size:14px;outline:none;transition:border-color .2s}
        .fi:focus{border-color:${T.gold}}
        .br:hover td{background:${T.rowHover}}
        .sb{background:transparent;border:1px solid;font-size:11px;padding:3px 7px;border-radius:2px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .15s;white-space:nowrap}
        .pill{display:inline-flex;align-items:center;font-size:10px;padding:2px 8px;border-radius:10px;font-family:'Bebas Neue',cursive;letter-spacing:1px}
        select.fi option{background:${T.inputBg};color:${T.text}}
        .mm-title{font-family:'Bebas Neue',cursive;font-size:32px;background:linear-gradient(135deg,${T.titleFrom},${T.titleTo});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;letter-spacing:3px;line-height:1}
      `}</style>

      {/* HEADER */}
      <div style={{borderBottom:`1px solid ${T.border}`,padding:"0 20px"}}>
        <div style={{maxWidth:1100,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 0 0",flexWrap:"wrap",gap:8}}>
            <div>
              <div className="mm-title">MYTHICAL MONEY</div>
              <div style={{fontSize:10,color:T.textMuted,letterSpacing:3,marginTop:2}}>SEASON {state.season} · RESETS AFTER NBA FINALS</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
              {saveStatus&&<span style={{fontSize:10,color:saveStatus==="saved"?"#5AAF7A":saveStatus==="error"?"#E06C75":T.gold,letterSpacing:1}}>{saveStatus==="saving"?"SAVING...":saveStatus==="saved"?"✓ SYNCED":"⚠ ERROR"}</span>}
              <button className="gh" style={{padding:"5px 10px",fontSize:11,borderRadius:2,borderColor:"#4A1A1A",color:"#C0392B"}} onClick={()=>setShowResetConfirm(true)}>↺ Reset</button>
              {/* Who am I indicator */}
              <div style={{padding:"5px 10px",fontSize:11,borderRadius:2,border:`1px solid ${T.border2}`,color:T.textMuted,display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:activePlayer==="p1"?p1Color.highlight:p2Color.highlight}}/>
                {activePlayer==="p1"?state.p1Name:state.p2Name}
                <button onClick={()=>setActivePlayer(null)} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:9,marginLeft:2,padding:0}}>▼</button>
              </div>
            </div>
          </div>

          {/* BALANCE BAR */}
          <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:10,padding:"12px 0"}}>
            <div style={{background:T.surface,border:`2px solid ${p1Lead?p1Color.highlight:T.border}`,borderRadius:3,padding:"12px 14px",position:"relative"}}>
              <button onClick={()=>setShowColorPicker("p1")} style={{position:"absolute",top:8,right:8,background:p1Color.highlight,border:"none",width:16,height:16,borderRadius:"50%",cursor:"pointer",opacity:0.8}} title="Change color"/>
              <div style={{fontSize:10,color:T.textMuted,letterSpacing:2,marginBottom:2}}>{state.p1Name.toUpperCase()}</div>
              <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:p1Lead?p1Color.highlight:tied?"#888":"#E06C75",letterSpacing:1}}>{fmt(state.p1Balance)}</div>
              <div style={{fontSize:10,color:T.textDim,marginTop:2}}>H2H {stats.p1H2hW}W-{stats.p2H2hW}L · Solo {stats.p1SW}W-{stats.p1SL}L</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 6px"}}>
              <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:12,color:T.textDim,letterSpacing:2}}>VS</div>
              {!tied&&<div style={{fontFamily:"'Bebas Neue',cursive",fontSize:10,color:T.gold,marginTop:3}}>▲{fmtShort(Math.abs(state.p1Balance-state.p2Balance))}</div>}
              {tied&&<div style={{fontSize:10,color:T.textMuted,marginTop:3}}>EVEN</div>}
            </div>
            <div style={{background:T.surface,border:`2px solid ${!p1Lead&&!tied?p2Color.highlight:T.border}`,borderRadius:3,padding:"12px 14px",textAlign:"right",position:"relative"}}>
              <button onClick={()=>setShowColorPicker("p2")} style={{position:"absolute",top:8,left:8,background:p2Color.highlight,border:"none",width:16,height:16,borderRadius:"50%",cursor:"pointer",opacity:0.8}} title="Change color"/>
              <div style={{fontSize:10,color:T.textMuted,letterSpacing:2,marginBottom:2}}>{state.p2Name.toUpperCase()}</div>
              <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:!p1Lead&&!tied?p2Color.highlight:tied?"#888":"#E06C75",letterSpacing:1}}>{fmt(state.p2Balance)}</div>
              <div style={{fontSize:10,color:T.textDim,marginTop:2}}>H2H {stats.p2H2hW}W-{stats.p1H2hW}L · Solo {stats.p2SW}W-{stats.p2SL}L</div>
            </div>
          </div>

          {/* TABS */}
          <div style={{display:"flex",borderTop:`1px solid ${T.border}`,overflowX:"auto"}}>
            {[["ledger","📒 LEDGER"],["stats","📊 STATS"],["modes","⚡ SPECIAL MODES"],["rankings","🏆 RANKINGS"],["rules","📋 RULES"],["settings","⚙️ SETTINGS"]].map(([t,l])=>(
              <button key={t} className="tb" onClick={()=>setTab(t)} style={{color:tab===t?T.gold:T.textMuted,borderBottom:tab===t?`2px solid ${T.gold}`:"2px solid transparent",whiteSpace:"nowrap"}}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{maxWidth:1100,margin:"0 auto",padding:"22px 20px"}}>

        {/* ═══ LEDGER ═══ */}
        {tab==="ledger"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <select className="fi" style={{width:"auto",fontSize:12}} value={filterSport} onChange={e=>setFilterSport(e.target.value)}>
                  <option value="All">All Sports</option>
                  {SPORTS.map(s=><option key={s}>{s}</option>)}
                </select>
                <select className="fi" style={{width:"auto",fontSize:12}} value={filterMode} onChange={e=>setFilterMode(e.target.value)}>
                  <option value="All">All Types</option>
                  <option value="H2H">Head-to-Head</option>
                  <option value="Solo">Solo</option>
                  <option value="Adjustments">Adjustments</option>
                </select>
                <select className="fi" style={{width:"auto",fontSize:12}} value={filterResult} onChange={e=>setFilterResult(e.target.value)}>
                  <option value="All">All Results</option>
                  <option value="Pending">Pending</option>
                  <option value="Settled">Settled</option>
                </select>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                <button className="gh" style={{padding:"7px 12px",fontSize:12,borderRadius:2,borderColor:"#3A1A1A",color:"#F08080",fontFamily:"'Bebas Neue',cursive",letterSpacing:2}} onClick={()=>{setPleForm(blankPLE);setPleEntryPlayer("p1");setShowPLE(true);}}>🤼 WWE PLE</button>
                <button className="bg" style={{padding:"7px 16px",fontSize:14,borderRadius:2}} onClick={()=>{setEditingBet(null);setForm(blankForm);setShowAddBet(true);}}>+ LOG BET</button>
              </div>
            </div>

            <div style={{display:"flex",gap:1,marginBottom:18}}>
              {[{l:"Total Bets",v:stats.total},{l:"Pending",v:stats.pending},{l:"Settled",v:stats.settled},{l:"Total Wagered",v:fmt(stats.totalWagered)}].map(s=>(
                <div key={s.l} style={{flex:1,background:T.surface,padding:"7px 8px",textAlign:"center"}}>
                  <div style={{fontSize:9,color:T.textMuted,letterSpacing:1}}>{s.l}</div>
                  <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:17,color:T.gold}}>{s.v}</div>
                </div>
              ))}
            </div>

            {sortedBets.length===0?(
              <div style={{textAlign:"center",padding:"60px 20px",color:T.textDim}}>
                <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:26,letterSpacing:3}}>NO BETS LOGGED</div>
                <div style={{fontSize:12,marginTop:6}}>Hit + LOG BET or WWE PLE to get started</div>
              </div>
            ):(
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead>
                    <tr style={{borderBottom:`1px solid ${T.border}`}}>
                      <th style={thStyle("timestamp")} onClick={()=>toggleSort("timestamp")}>TIME{sortIndicator("timestamp")}</th>
                      <th style={thStyle("sport")} onClick={()=>toggleSort("sport")}>SPORT{sortIndicator("sport")}</th>
                      <th style={{...thStyle("mode"),cursor:"default"}}>TYPE</th>
                      <th style={thStyle("description")} onClick={()=>toggleSort("description")}>DESCRIPTION{sortIndicator("description")}</th>
                      <th style={{...thStyle(""),cursor:"default"}}>PICKS</th>
                      <th style={thStyle("amount")} onClick={()=>toggleSort("amount")}>WAGER{sortIndicator("amount")}</th>
                      <th style={thStyle("result")} onClick={()=>toggleSort("result")}>RESULT{sortIndicator("result")}</th>
                      <th style={{...thStyle(""),cursor:"default"}}>{state.p1Name.slice(0,7).toUpperCase()} BAL</th>
                      <th style={{...thStyle(""),cursor:"default"}}>{state.p2Name.slice(0,7).toUpperCase()} BAL</th>
                      <th style={{...thStyle(""),cursor:"default"}}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedBets.map((bet)=>{
                      const isPLE=bet.betType==="PLE Card";
                      const isSolo=bet.mode==="solo";
                      const isAdj=bet.isAdjustment;
                      const rC=rc(bet.result);
                      const canEdit=bet.result==="Pending"&&!isAdj&&!isPLE;
                      return (
                        <tr key={bet.id} className="br" style={{borderBottom:`1px solid ${T.border}`}}>
                          <td style={{padding:"8px 9px",color:T.textMuted,whiteSpace:"nowrap",fontSize:10}}>
                            <div>{bet.date}</div>
                            {bet.timestamp&&<div style={{color:T.textDim,fontSize:9}}>{fmtTime(bet.timestamp).split(" ").pop()}</div>}
                          </td>
                          <td style={{padding:"8px 9px"}}>
                            {isAdj?<span style={{color:T.textMuted,fontSize:11}}>—</span>:
                              <span style={{background:sportColors[bet.sport]||"#333",color:"#fff",fontSize:9,padding:"2px 6px",borderRadius:2,letterSpacing:1,fontFamily:"'Bebas Neue',cursive"}}>{bet.sport}</span>}
                          </td>
                          <td style={{padding:"8px 9px"}}>
                            {isAdj?<span className="pill" style={{background:"#1A1A2A",color:"#6FA8DC"}}>ADJ</span>
                              :isPLE?<span className="pill" style={{background:"#3A1A1A",color:"#F08080"}}>PLE</span>
                              :isSolo?<span className="pill" style={{background:"#1A2A1A",color:"#6EC98A"}}>SOLO</span>
                              :<span className="pill" style={{background:"#1A2A3A",color:"#6FA8DC"}}>H2H</span>}
                          </td>
                          <td style={{padding:"8px 9px",maxWidth:180}}>
                            <div style={{color:T.text,fontWeight:500,lineHeight:1.4}}>{bet.description}</div>
                            {!isAdj&&<div style={{color:T.textMuted,fontSize:10,marginTop:1}}>{bet.betType}{isSolo&&bet.payout!==1?` · ${bet.payout}x`:""}</div>}
                            {bet.notes&&<div style={{color:T.textDim,fontSize:10,fontStyle:"italic"}}>{bet.notes}</div>}
                          </td>
                          <td style={{padding:"8px 9px",minWidth:100}}>
                            {isAdj?<span style={{color:T.textMuted,fontSize:11}}>—</span>
                              :isPLE?(
                                <div style={{fontSize:10}}>
                                  <div style={{color:p1Color.highlight}}>{state.p1Name.slice(0,7)}: {bet.p1Pick||"—"} <span style={{color:T.gold}}>({fmt(bet.p1Stake||0)})</span></div>
                                  <div style={{color:p2Color.highlight,marginTop:2}}>{state.p2Name.slice(0,7)}: {bet.p2Pick||"—"} <span style={{color:T.gold}}>({fmt(bet.p2Stake||0)})</span></div>
                                </div>
                              ):isSolo?(
                                <div style={{fontSize:10,color:T.textMuted}}>{(bet.soloPlayer==="p1"?state.p1Name:state.p2Name).slice(0,7)}: {bet.p1Pick||"—"}</div>
                              ):(
                                <div style={{fontSize:10}}>
                                  <div style={{color:p1Color.highlight}}>{state.p1Name.slice(0,7)}: {bet.p1Pick||"—"}</div>
                                  <div style={{color:p2Color.highlight,marginTop:2}}>{state.p2Name.slice(0,7)}: {bet.p2Pick||"—"}</div>
                                </div>
                              )}
                          </td>
                          <td style={{padding:"8px 9px",fontFamily:"'Bebas Neue',cursive",fontSize:15,color:isAdj?"#6FA8DC":T.gold,whiteSpace:"nowrap"}}>
                            {isAdj?(bet.adjustAmount>0?"+":"")+fmt(bet.adjustAmount):isPLE?<span style={{fontSize:10,color:T.textMuted}}>see picks</span>:fmt(bet.amount)}
                          </td>
                          <td style={{padding:"8px 9px",minWidth:130}}>
                            {bet.result==="Pending"?(
                              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                                <span style={{background:rC.bg,color:rC.color,fontSize:9,padding:"2px 7px",borderRadius:2,letterSpacing:1,display:"inline-block"}}>PENDING</span>
                                <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                                  {isSolo?(
                                    <><button className="sb" style={{borderColor:"#1A5A3A",color:"#5AAF7A"}} onClick={()=>settleBet(bet.id,"win")}>Win</button>
                                    <button className="sb" style={{borderColor:"#5A1A1A",color:"#E06C75"}} onClick={()=>settleBet(bet.id,"loss")}>Loss</button>
                                    <button className="sb" style={{borderColor:"#333",color:"#666"}} onClick={()=>settleBet(bet.id,"push")}>Push</button></>
                                  ):(
                                    <><button className="sb" style={{borderColor:"#1A5A3A",color:"#5AAF7A"}} onClick={()=>settleBet(bet.id,"p1")}>{state.p1Name.slice(0,5)} W</button>
                                    <button className="sb" style={{borderColor:"#1A5A3A",color:"#5AAF7A"}} onClick={()=>settleBet(bet.id,"p2")}>{state.p2Name.slice(0,5)} W</button>
                                    <button className="sb" style={{borderColor:"#333",color:"#666"}} onClick={()=>settleBet(bet.id,"push")}>Push</button></>
                                  )}
                                </div>
                              </div>
                            ):(
                              <span style={{background:rC.bg,color:rC.color,fontSize:9,padding:"3px 8px",borderRadius:2,letterSpacing:1}}>{bet.result.toUpperCase()}</span>
                            )}
                          </td>
                          <td style={{padding:"8px 9px",fontFamily:"'Bebas Neue',cursive",fontSize:13,color:isAdj&&bet.adjustTarget==="p1"?"#6FA8DC":bet.winner==="p1"?"#5AAF7A":bet.winner==="p2"?"#E06C75":T.textMuted,whiteSpace:"nowrap"}}>
                            {bet.p1BalAfter!=null?fmt(bet.p1BalAfter):"—"}
                          </td>
                          <td style={{padding:"8px 9px",fontFamily:"'Bebas Neue',cursive",fontSize:13,color:isAdj&&bet.adjustTarget==="p2"?"#6FA8DC":bet.winner==="p2"?"#5AAF7A":bet.winner==="p1"?"#E06C75":T.textMuted,whiteSpace:"nowrap"}}>
                            {bet.p2BalAfter!=null?fmt(bet.p2BalAfter):"—"}
                          </td>
                          <td style={{padding:"8px 6px"}}>
                            <div style={{display:"flex",gap:4}}>
                              {canEdit&&<button onClick={()=>openEditBet(bet)} style={{background:"transparent",border:"none",color:T.textDim,cursor:"pointer",fontSize:11,transition:"color .15s"}} onMouseEnter={e=>e.target.style.color=T.gold} onMouseLeave={e=>e.target.style.color=T.textDim}>✏</button>}
                              <button onClick={()=>deleteBet(bet.id)} style={{background:"transparent",border:"none",color:T.textDim,cursor:"pointer",fontSize:12,transition:"color .15s"}} onMouseEnter={e=>e.target.style.color="#E06C75"} onMouseLeave={e=>e.target.style.color=T.textDim}>✕</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ═══ STATS ═══ */}
        {tab==="stats"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {[
              {l:`${state.p1Name} H2H Record`,v:`${stats.p1H2hW}W — ${stats.p2H2hW}L`,sub:`Win Rate: ${h2hSettled.length>0?Math.round(stats.p1H2hW/h2hSettled.length*100):0}%`},
              {l:`${state.p2Name} H2H Record`,v:`${stats.p2H2hW}W — ${stats.p1H2hW}L`,sub:`Win Rate: ${h2hSettled.length>0?Math.round(stats.p2H2hW/h2hSettled.length*100):0}%`},
              {l:`${state.p1Name} Solo Record`,v:`${stats.p1SW}W — ${stats.p1SL}L`,sub:"Personal bets only"},
              {l:`${state.p2Name} Solo Record`,v:`${stats.p2SW}W — ${stats.p2SL}L`,sub:"Personal bets only"},
              {l:"Total Wagered",v:fmt(stats.totalWagered),sub:`Across ${stats.total} bets`},
              {l:"Pending Action",v:fmt(bets.filter(b=>b.result==="Pending").reduce((s,b)=>s+(b.amount||0),0)),sub:`${stats.pending} bets outstanding`},
              {l:`${state.p1Name} Season P&L`,v:fmt(state.p1Balance-STARTING_STACK),sub:state.p1Balance>=STARTING_STACK?"▲ In the green":"▼ In the red",gain:state.p1Balance>=STARTING_STACK},
              {l:`${state.p2Name} Season P&L`,v:fmt(state.p2Balance-STARTING_STACK),sub:state.p2Balance>=STARTING_STACK?"▲ In the green":"▼ In the red",gain:state.p2Balance>=STARTING_STACK},
            ].map(s=>(
              <div key={s.l} style={{background:T.surface,border:`1px solid ${T.border}`,padding:"16px",borderRadius:3}}>
                <div style={{fontSize:10,color:T.textMuted,letterSpacing:2,marginBottom:5}}>{s.l.toUpperCase()}</div>
                <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:30,color:s.gain===false?"#E06C75":s.gain?"#5AAF7A":T.gold,letterSpacing:1}}>{s.v}</div>
                <div style={{fontSize:11,color:T.textMuted,marginTop:3}}>{s.sub}</div>
              </div>
            ))}
            <div style={{gridColumn:"1/-1",background:T.surface,border:`1px solid ${T.border}`,padding:"16px",borderRadius:3}}>
              <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:16,color:T.gold,letterSpacing:2,marginBottom:12}}>BETS BY SPORT</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {SPORTS.map(sp=>{const c=bets.filter(b=>b.sport===sp).length;if(!c)return null;return(
                  <div key={sp} style={{background:T.surface2,border:`1px solid ${sportColors[sp]}44`,padding:"8px 12px",borderRadius:3,borderTop:`2px solid ${sportColors[sp]}`}}>
                    <div style={{fontSize:9,color:T.textMuted}}>{sp}</div>
                    <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:24,color:sportColors[sp]||T.gold}}>{c}</div>
                  </div>
                );})}
              </div>
            </div>
            {bets.filter(b=>b.amount>0&&!b.isAdjustment).length>0&&(
              <div style={{gridColumn:"1/-1",background:T.surface,border:`1px solid ${T.border}`,padding:"16px",borderRadius:3}}>
                <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:16,color:T.gold,letterSpacing:2,marginBottom:12}}>BIGGEST BETS</div>
                {[...bets].filter(b=>b.amount>0&&!b.isAdjustment).sort((a,b)=>b.amount-a.amount).slice(0,5).map(b=>(
                  <div key={b.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${T.border}`}}>
                    <div><div style={{fontSize:13,color:T.text}}>{b.description}</div><div style={{fontSize:10,color:T.textMuted}}>{b.date} · {b.sport} · {b.mode==="solo"?"Solo":"H2H"}</div></div>
                    <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:18,color:T.gold}}>{fmt(b.amount)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ SPECIAL MODES ═══ */}
        {tab==="modes"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:10,color:T.textMuted,letterSpacing:2}}>TRACK WHEN SPECIAL MODES ARE INVOKED THIS SEASON</div>
              <button className="bg" style={{padding:"7px 16px",fontSize:13,borderRadius:2}} onClick={()=>{setModeLogForm(blankModeLog);setShowLogMode(true);}}>+ LOG INVOCATION</button>
            </div>

            {modeLog.length>0&&(
              <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:3,padding:"14px 16px"}}>
                <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:14,color:T.gold,letterSpacing:2,marginBottom:10}}>INVOCATION LOG</div>
                {modeLog.map(entry=>{
                  const mode=SPECIAL_MODES.find(m=>m.key===entry.key);
                  return(
                    <div key={entry.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${T.border}`}}>
                      <div style={{display:"flex",gap:10,alignItems:"center"}}>
                        <span style={{fontSize:16}}>{mode?.icon||"⚡"}</span>
                        <div>
                          <div style={{fontSize:12,color:mode?.color||T.gold,fontFamily:"'Bebas Neue',cursive",letterSpacing:1}}>{mode?.name||entry.key}</div>
                          <div style={{fontSize:10,color:T.textMuted}}>{entry.date} · {entry.player==="p1"?state.p1Name:state.p2Name}{entry.note?` — ${entry.note}`:""}</div>
                        </div>
                      </div>
                      <button onClick={()=>deleteModeLog(entry.id)} style={{background:"transparent",border:"none",color:T.textDim,cursor:"pointer",fontSize:12}} onMouseEnter={e=>e.target.style.color="#E06C75"} onMouseLeave={e=>e.target.style.color=T.textDim}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}

            {SPECIAL_MODES.map(m=>{
              const seasonCount=modeUsageCount(m.key);
              const p1Count=modeUsageCount(m.key,"p1");
              const p2Count=modeUsageCount(m.key,"p2");
              return(
                <div key={m.name} style={{background:T.surface,border:`1px solid ${m.border}`,borderLeft:`3px solid ${m.color}`,borderRadius:3,padding:"18px 22px"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{fontSize:26}}>{m.icon}</div>
                      <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:22,color:m.color,letterSpacing:3}}>{m.name}</div>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      {m.trackPer==="season"&&(
                        <div style={{background:T.surface2,border:`1px solid ${m.border}`,padding:"4px 12px",borderRadius:2,textAlign:"center"}}>
                          <div style={{fontSize:9,color:T.textMuted,letterSpacing:1}}>USED THIS SEASON</div>
                          <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:seasonCount>0?m.color:T.textMuted}}>{seasonCount}</div>
                        </div>
                      )}
                      {m.trackPer==="player"&&(
                        <>
                          <div style={{background:T.surface2,border:`1px solid ${m.border}`,padding:"4px 12px",borderRadius:2,textAlign:"center"}}>
                            <div style={{fontSize:9,color:p1Color.highlight,letterSpacing:1}}>{state.p1Name.slice(0,8)}</div>
                            <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:p1Count>0?m.color:T.textMuted}}>{p1Count}</div>
                          </div>
                          <div style={{background:T.surface2,border:`1px solid ${m.border}`,padding:"4px 12px",borderRadius:2,textAlign:"center"}}>
                            <div style={{fontSize:9,color:p2Color.highlight,letterSpacing:1}}>{state.p2Name.slice(0,8)}</div>
                            <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:p2Count>0?m.color:T.textMuted}}>{p2Count}</div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{fontSize:13,color:T.textMuted,lineHeight:1.7,marginBottom:14}}>{m.body}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                    {[["TRIGGER",m.trigger],["PAYOUT",m.payout],["LIMIT",m.limit]].map(([label,val])=>(
                      <div key={label} style={{background:T.surface2,border:`1px solid ${T.border}`,padding:"8px 10px",borderRadius:2}}>
                        <div style={{fontSize:9,color:T.textMuted,letterSpacing:2,marginBottom:3}}>{label}</div>
                        <div style={{fontSize:11,color:m.color,lineHeight:1.4}}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ RANKINGS ═══ */}
        {tab==="rankings"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>

            {/* Header row */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:22,color:T.gold,letterSpacing:3}}>🏆 WWE POWER RANKINGS</div>
                <div style={{fontSize:11,color:T.textMuted,marginTop:2}}>Each player's Top 5 roster. Title win = stack bonus.</div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button className="bg" style={{padding:"8px 18px",fontSize:13,borderRadius:2}} onClick={()=>{setRankForm({p1:[...(state.p1Rankings||blankRankings())],p2:[...(state.p2Rankings||blankRankings())]});setEditingRankings(true);}}>✏ EDIT RANKINGS</button>
                <button className="gh" style={{padding:"8px 18px",fontSize:13,borderRadius:2,borderColor:"#1A4A1A",color:"#5AAF7A"}} onClick={()=>{setClaimForm(blankClaim);setShowClaimBonus(true);}}>💰 CLAIM BONUS</button>
              </div>
            </div>

            {/* Bonus scale reference */}
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {RANK_BONUSES.map((bonus,i)=>(
                <div key={i} style={{flex:1,minWidth:80,background:T.surface,border:`1px solid ${T.border}`,borderTop:`2px solid ${T.gold}`,borderRadius:3,padding:"8px 10px",textAlign:"center"}}>
                  <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:11,color:T.textMuted,letterSpacing:2}}>RANK #{i+1}</div>
                  <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:T.gold}}>{fmtShort(bonus)}</div>
                  <div style={{fontSize:9,color:T.textMuted}}>title bonus</div>
                </div>
              ))}
            </div>

            {/* Side-by-side rosters */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[["p1",state.p1Name,p1Color],["p2",state.p2Name,p2Color]].map(([player,name,pColor])=>{
                const rankings = (player==="p1"?state.p1Rankings:state.p2Rankings)||blankRankings();
                const playerLog = (state.rankingLog||[]).filter(r=>r.player===player);
                const totalEarned = playerLog.reduce((s,r)=>s+r.bonus,0);
                return(
                  <div key={player}>
                    <div style={{background:T.surface,border:`2px solid ${pColor.highlight}`,borderRadius:4,overflow:"hidden"}}>
                      {/* Roster header */}
                      <div style={{background:`${pColor.highlight}22`,borderBottom:`1px solid ${pColor.highlight}44`,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:18,color:pColor.highlight,letterSpacing:2}}>{name.toUpperCase()}'S ROSTER</div>
                        {totalEarned>0&&<div style={{fontSize:10,color:"#5AAF7A",background:"#0A2A1A",padding:"3px 8px",borderRadius:2,letterSpacing:1}}>+{fmt(totalEarned)} EARNED</div>}
                      </div>
                      {/* Wrestler list */}
                      <div style={{padding:"8px 0"}}>
                        {rankings.map((w,i)=>(
                          <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",borderBottom:i<4?`1px solid ${T.border}`:"none"}}>
                            <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:i===0?T.gold:`${pColor.highlight}66`,lineHeight:1,minWidth:32,textAlign:"center"}}>{i+1}</div>
                            <div style={{flex:1}}>
                              {w.name?(
                                <>
                                  <div style={{fontSize:14,color:T.text,fontWeight:500}}>{w.name}</div>
                                  {w.notes&&<div style={{fontSize:10,color:T.textMuted,fontStyle:"italic",marginTop:1}}>{w.notes}</div>}
                                </>
                              ):(
                                <div style={{fontSize:12,color:T.textDim,fontStyle:"italic"}}>— empty slot —</div>
                              )}
                            </div>
                            <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:13,color:T.gold}}>{fmtShort(RANK_BONUSES[i])}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Bonus history for this player */}
                    {playerLog.length>0&&(
                      <div style={{marginTop:8,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:3,padding:"10px 14px"}}>
                        <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:11,color:T.textMuted,letterSpacing:2,marginBottom:8}}>BONUS HISTORY</div>
                        {playerLog.map(entry=>(
                          <div key={entry.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:`1px solid ${T.border}`}}>
                            <div>
                              <div style={{fontSize:12,color:T.text}}>🏆 {entry.wrestler} <span style={{color:T.textMuted,fontSize:10}}>#{entry.rank+1}</span></div>
                              <div style={{fontSize:10,color:T.textMuted}}>{entry.date} · {entry.titleWon}</div>
                            </div>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:16,color:"#5AAF7A"}}>+{fmt(entry.bonus)}</div>
                              <button onClick={()=>deleteRankingLog(entry.id)} style={{background:"transparent",border:"none",color:T.textDim,cursor:"pointer",fontSize:11}} onMouseEnter={e=>e.target.style.color="#E06C75"} onMouseLeave={e=>e.target.style.color=T.textDim}>✕</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Rules box */}
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${T.gold}`,padding:"14px 18px",borderRadius:3}}>
              <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:14,color:T.gold,letterSpacing:2,marginBottom:10}}>HOW IT WORKS</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,fontSize:12,color:T.textMuted,lineHeight:1.7}}>
                <div>• Each player maintains an independent Top 5 roster of WWE wrestlers.</div>
                <div>• Rankings can be updated anytime — no lock-in.</div>
                <div>• If a ranked wrestler wins <em>any</em> title, that player claims a stack bonus.</div>
                <div>• Both players can rank the same wrestler — no overlap penalty.</div>
                <div>• Bonus auto-logs as a Balance Adjustment in the Ledger.</div>
                <div>• Rank #1 = $20K &nbsp;·&nbsp; #2 = $15K &nbsp;·&nbsp; #3 = $10K &nbsp;·&nbsp; #4 = $5K &nbsp;·&nbsp; #5 = $3K</div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ RULES ═══ */}
        {tab==="rules"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderTop:`2px solid ${T.gold}`,padding:"18px",borderRadius:3}}>
              <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:T.gold,letterSpacing:3,marginBottom:14}}>BET TYPES & MULTIPLIERS</div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead><tr style={{borderBottom:`1px solid ${T.border}`}}>{["BET TYPE","MULTIPLIER","AVAILABLE IN"].map(h=><th key={h} style={{padding:"6px 12px",textAlign:"left",fontFamily:"'Bebas Neue',cursive",fontSize:10,letterSpacing:2,color:T.textMuted}}>{h}</th>)}</tr></thead>
                <tbody>
                  {BET_TYPES.map(bt=><tr key={bt.label} style={{borderBottom:`1px solid ${T.border}`}}><td style={{padding:"8px 12px",color:T.text}}>{bt.label}</td><td style={{padding:"8px 12px",fontFamily:"'Bebas Neue',cursive",fontSize:17,color:T.goldBright}}>{bt.multiplier}</td><td style={{padding:"8px 12px",color:T.textMuted,fontSize:11}}>{bt.sports}</td></tr>)}
                  <tr><td style={{padding:"8px 12px",color:T.text}}>WWE PLE Card</td><td style={{padding:"8px 12px",fontFamily:"'Bebas Neue',cursive",fontSize:17,color:T.goldBright}}>1x per match</td><td style={{padding:"8px 12px",color:T.textMuted,fontSize:11}}>WWE only</td></tr>
                </tbody>
              </table>
            </div>
            <div style={{background:T.surface,border:`1px solid #3A1A1A`,borderLeft:"3px solid #9b1c1c",padding:"14px 18px",borderRadius:2}}>
              <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:17,letterSpacing:2,color:"#F08080",marginBottom:10}}>🤼 WWE PLE STAKE SCALE</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
                {[4,5,6,7,8].map(n=>(
                  <div key={n} style={{background:T.surface2,border:`1px solid ${T.border}`,padding:"10px 8px",borderRadius:2,textAlign:"center"}}>
                    <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:13,color:"#F08080",marginBottom:6}}>{n} MATCHES</div>
                    {getPleTiers(n).map(t=><div key={t} style={{fontSize:11,color:T.gold,lineHeight:1.6}}>{fmtShort(t)}</div>)}
                    <div style={{fontSize:10,color:T.textMuted,marginTop:6}}>Max: {fmtShort(getPleTiers(n).reduce((a,b)=>a+b,0))}</div>
                  </div>
                ))}
              </div>
            </div>
            {[
              {num:"01",title:"STARTING STACK",body:"Both players begin at $100,000 Mythical Money. No real cash — pride and bragging rights only."},
              {num:"02",title:"SEASON RESET",body:"Season ends the night of the NBA Finals clinching game. Whoever has more MM wins. Stacks reset to $100,000."},
              {num:"03",title:"BET LIMITS",body:"Minimum bet: $1,000 MM. Max single H2H bet: 30% of your current stack. Solo bets have no cap."},
              {num:"04",title:"BALANCE ADJUSTMENTS",body:"Use the ⚖ Adjust button in Settings to apply manual corrections to either stack. Logged with ADJ tag. Does not count as a bet."},
              {num:"05",title:"BAILOUT RULE",body:"Drop below $10,000? One-time bailout to $15,000 — but forfeit your next H2H winning payout to your opponent."},
              {num:"06",title:"GENTLEMAN'S HONOR",body:"All H2H bets agreed before the event starts. No retroactive bets. Your word is law."},
              {num:"07",title:"PUSH / DEAD HEAT",body:"Tie or no-contest? Original wager returned. Nobody wins, nobody loses."},
            ].map(r=>(
              <div key={r.num} style={{display:"flex",gap:16,background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${T.gold}`,padding:"13px 16px",borderRadius:2}}>
                <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:T.gold,opacity:.2,lineHeight:1,minWidth:34}}>{r.num}</div>
                <div><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:15,letterSpacing:2,color:T.goldBright,marginBottom:3}}>{r.title}</div><div style={{fontSize:13,color:T.textMuted,lineHeight:1.6}}>{r.body}</div></div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ SETTINGS ═══ */}
        {tab==="settings"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:700}}>

            {/* WHO YOU ARE */}
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderTop:`2px solid ${T.gold}`,padding:"18px",borderRadius:3}}>
              <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:18,color:T.gold,letterSpacing:3,marginBottom:14}}>👤 ACTIVE PROFILE</div>
              <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                {[["p1",state.p1Name,p1Color.highlight],["p2",state.p2Name,p2Color.highlight]].map(([key,name,color])=>(
                  <button key={key} onClick={()=>selectPlayer(key)}
                    style={{display:"flex",alignItems:"center",gap:8,padding:"10px 18px",border:`2px solid ${activePlayer===key?color:T.border2}`,borderRadius:4,background:activePlayer===key?`${color}22`:"transparent",cursor:"pointer",transition:"all .2s"}}>
                    <div style={{width:28,height:28,borderRadius:"50%",background:color,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <span style={{fontFamily:"'Bebas Neue',cursive",fontSize:16,color:"#fff"}}>{name.slice(0,1)}</span>
                    </div>
                    <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:16,color:activePlayer===key?color:T.textMuted,letterSpacing:2}}>{name}</div>
                    {activePlayer===key&&<span style={{fontSize:9,color:color,letterSpacing:1}}>● YOU</span>}
                  </button>
                ))}
              </div>
              <div style={{fontSize:11,color:T.textMuted,marginTop:10}}>Your profile controls which theme is remembered on this device. Switching profiles switches themes.</div>
            </div>

            {/* THEME */}
            <div style={{background:T.surface,border:`1px solid ${T.border}`,padding:"18px",borderRadius:3}}>
              <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:18,color:T.gold,letterSpacing:3,marginBottom:6}}>🎨 COLOR THEME</div>
              <div style={{fontSize:11,color:T.textMuted,marginBottom:16}}>Your theme saves to this device only — the other player sees their own choice.</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10}}>
                {Object.entries(THEMES).map(([key,theme])=>{
                  const active = themeKey === key;
                  return (
                    <button key={key} onClick={()=>selectTheme(key)}
                      style={{padding:"14px 10px",border:`2px solid ${active?theme.gold:theme.border2}`,borderRadius:6,background:theme.bg,cursor:"pointer",transition:"all .2s",textAlign:"center",transform:active?"scale(1.03)":"scale(1)"}}>
                      <div style={{fontSize:22,marginBottom:6}}>{theme.icon}</div>
                      <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:14,color:theme.gold,letterSpacing:2}}>{theme.name}</div>
                      <div style={{display:"flex",gap:4,justifyContent:"center",marginTop:8}}>
                        <div style={{width:12,height:12,borderRadius:2,background:theme.bg,border:`1px solid ${theme.border2}`}}/>
                        <div style={{width:12,height:12,borderRadius:2,background:theme.surface}}/>
                        <div style={{width:12,height:12,borderRadius:2,background:theme.gold}}/>
                      </div>
                      {active&&<div style={{fontSize:9,color:theme.gold,marginTop:6,letterSpacing:1}}>● ACTIVE</div>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* PLAYER NAMES */}
            <div style={{background:T.surface,border:`1px solid ${T.border}`,padding:"18px",borderRadius:3}}>
              <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:18,color:T.gold,letterSpacing:3,marginBottom:14}}>✏ PLAYER NAMES</div>
              <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
                {[["p1","PLAYER 1"],["p2","PLAYER 2"]].map(([k,l])=>(
                  <div key={k}><label style={{fontSize:9,color:T.textMuted,letterSpacing:2,display:"block",marginBottom:3}}>{l} — CURRENTLY: {state[k+"Name"]}</label><input className="fi" placeholder={state[k+"Name"]} value={nameForm[k]} onChange={e=>setNameForm({...nameForm,[k]:e.target.value})}/></div>
                ))}
              </div>
              <button className="bg" style={{padding:"10px 20px",fontSize:14,borderRadius:2}} onClick={saveNames}>SAVE NAMES</button>
            </div>

            {/* BALANCE ADJUSTMENT */}
            <div style={{background:T.surface,border:`1px solid ${T.border}`,padding:"18px",borderRadius:3}}>
              <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:18,color:"#6FA8DC",letterSpacing:3,marginBottom:6}}>⚖ BALANCE ADJUSTMENT</div>
              <div style={{fontSize:11,color:T.textMuted,marginBottom:14}}>Manual corrections to either stack. Logged with ADJ tag. Does not count as a bet.</div>
              <button className="gh" style={{padding:"9px 18px",fontSize:12,borderRadius:2,borderColor:"#1A1A2A",color:"#6FA8DC"}} onClick={()=>setShowAdjust(true)}>OPEN ADJUSTMENT PANEL</button>
            </div>

            {/* IMPORT / EXPORT */}
            <div style={{background:T.surface,border:`1px solid ${T.border}`,padding:"18px",borderRadius:3}}>
              <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:18,color:T.gold,letterSpacing:3,marginBottom:6}}>📁 DATA</div>
              <div style={{fontSize:11,color:T.textMuted,marginBottom:14}}>Export your full bet history to CSV, or import from a previously exported file.</div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                <button className="gh" style={{padding:"9px 18px",fontSize:12,borderRadius:2,borderColor:"#1A2A1A",color:"#5AAF7A"}} onClick={()=>exportCSV(bets,state.p1Name,state.p2Name)}>↓ Export CSV</button>
                <label className="gh" style={{padding:"9px 18px",fontSize:12,borderRadius:2,cursor:"pointer",display:"inline-block",border:`1px solid ${T.border2}`,color:T.textMuted}}>
                  ↑ Import CSV<input type="file" accept=".csv" style={{display:"none"}} onChange={handleImport}/>
                </label>
              </div>
            </div>

            {/* DANGER ZONE */}
            <div style={{background:T.surface,border:"1px solid #4A1A1A",borderLeft:"3px solid #C0392B",padding:"18px",borderRadius:3}}>
              <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:18,color:"#C0392B",letterSpacing:3,marginBottom:6}}>⚠ DANGER ZONE</div>
              <div style={{fontSize:11,color:T.textMuted,marginBottom:14}}>Reset the season — clears all bets and resets both stacks to $100,000. This is permanent.</div>
              <button className="gh" style={{padding:"9px 18px",fontSize:12,borderRadius:2,borderColor:"#4A1A1A",color:"#C0392B"}} onClick={()=>setShowResetConfirm(true)}>↺ RESET SEASON</button>
            </div>
          </div>
        )}
      </div>

      {/* ═══ ADD / EDIT BET MODAL ═══ */}
      {showAddBet&&(
        <div style={{position:"fixed",inset:0,background:T.modalOverlay,display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20}}>
          <div style={{background:T.modalBg,border:`1px solid ${T.border2}`,borderTop:`2px solid ${editingBet?"#6FA8DC":T.gold}`,borderRadius:4,width:"100%",maxWidth:560,maxHeight:"92vh",overflowY:"auto",padding:24}}>
            <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:24,color:editingBet?"#6FA8DC":T.gold,letterSpacing:3,marginBottom:16}}>{editingBet?"✏ EDIT BET":"LOG NEW BET"}</div>
            {!editingBet&&(
              <div style={{display:"flex",gap:0,marginBottom:16,background:T.surface2,borderRadius:3,padding:3}}>
                {[["h2h","⚔️ HEAD-TO-HEAD"],["solo","🎯 SOLO BET"]].map(([m,l])=>(
                  <button key={m} onClick={()=>setForm({...form,mode:m})} style={{flex:1,padding:"9px 6px",border:"none",borderRadius:2,cursor:"pointer",fontFamily:"'Bebas Neue',cursive",fontSize:14,letterSpacing:2,transition:"all .2s",background:form.mode===m?(m==="h2h"?"#1A2A3A":"#1A2A1A"):"transparent",color:form.mode===m?(m==="h2h"?"#6FA8DC":"#6EC98A"):T.textMuted,borderBottom:form.mode===m?`2px solid ${m==="h2h"?"#6FA8DC":"#6EC98A"}`:"2px solid transparent"}}>{l}</button>
                ))}
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div><label style={{fontSize:9,color:T.textMuted,letterSpacing:2,display:"block",marginBottom:3}}>DATE</label><input type="date" className="fi" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></div>
              <div><label style={{fontSize:9,color:T.textMuted,letterSpacing:2,display:"block",marginBottom:3}}>SPORT</label><select className="fi" value={form.sport} onChange={e=>setForm({...form,sport:e.target.value})}>{SPORTS.map(s=><option key={s}>{s}</option>)}</select></div>
              <div style={{gridColumn:"1/-1"}}><label style={{fontSize:9,color:T.textMuted,letterSpacing:2,display:"block",marginBottom:3}}>BET TYPE</label>
                <select className="fi" value={form.betType} onChange={e=>{const bt=BET_TYPES.find(b=>b.label===e.target.value);setForm({...form,betType:e.target.value,payout:parseFloat(bt?.multiplier)||1});}}>
                  {BET_TYPES.map(b=><option key={b.label}>{b.label} — {b.multiplier}</option>)}
                </select>
              </div>
              {form.mode==="solo"&&!editingBet&&(
                <div style={{gridColumn:"1/-1"}}><label style={{fontSize:9,color:T.textMuted,letterSpacing:2,display:"block",marginBottom:3}}>WHO IS PLACING THIS BET?</label>
                  <div style={{display:"flex",gap:8}}>
                    {[["p1",state.p1Name],["p2",state.p2Name]].map(([v,n])=>(
                      <button key={v} onClick={()=>setForm({...form,soloPlayer:v})} style={{flex:1,padding:"8px",border:`1px solid ${form.soloPlayer===v?"#6EC98A":T.border2}`,background:form.soloPlayer===v?"#1A2A1A":"transparent",color:form.soloPlayer===v?"#6EC98A":T.textMuted,fontFamily:"'Bebas Neue',cursive",fontSize:13,letterSpacing:1,cursor:"pointer",borderRadius:2}}>{n}</button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{gridColumn:"1/-1"}}><label style={{fontSize:9,color:T.textMuted,letterSpacing:2,display:"block",marginBottom:3}}>BET DESCRIPTION *</label><input className="fi" placeholder="e.g. Lakers vs Celtics" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></div>
              {form.mode==="h2h"?(
                <>
                  <div><label style={{fontSize:9,color:p1Color.highlight,letterSpacing:2,display:"block",marginBottom:3}}>{state.p1Name.toUpperCase()} PICK</label><input className="fi" placeholder="Their pick" value={form.p1Pick} onChange={e=>setForm({...form,p1Pick:e.target.value})}/></div>
                  <div><label style={{fontSize:9,color:p2Color.highlight,letterSpacing:2,display:"block",marginBottom:3}}>{state.p2Name.toUpperCase()} PICK</label><input className="fi" placeholder="Their pick" value={form.p2Pick} onChange={e=>setForm({...form,p2Pick:e.target.value})}/></div>
                </>
              ):(
                <div style={{gridColumn:"1/-1"}}><label style={{fontSize:9,color:"#6EC98A",letterSpacing:2,display:"block",marginBottom:3}}>YOUR PICK / SELECTION</label><input className="fi" placeholder="e.g. Lakers ML, Over 225.5" value={form.p1Pick} onChange={e=>setForm({...form,p1Pick:e.target.value})}/></div>
              )}
              <div><label style={{fontSize:9,color:T.textMuted,letterSpacing:2,display:"block",marginBottom:3}}>WAGER AMOUNT (MM) *</label><input className="fi" placeholder="e.g. 5000" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></div>
              <div><label style={{fontSize:9,color:T.textMuted,letterSpacing:2,display:"block",marginBottom:3}}>PAYOUT MULTIPLIER</label><input className="fi" type="number" step="0.5" min="1" value={form.payout} onChange={e=>setForm({...form,payout:e.target.value})}/></div>
              {!editingBet&&(
                <div style={{gridColumn:"1/-1"}}>
                  <label style={{fontSize:9,color:T.textMuted,letterSpacing:2,display:"block",marginBottom:5}}>RESULT</label>
                  {form.mode==="solo"?(
                    <div style={{display:"flex",gap:8}}>
                      {["Pending","Win","Loss","Push"].map(r=>{const col=r==="Win"?"#5AAF7A":r==="Loss"?"#E06C75":r==="Push"?"#666":T.gold;const active=form.soloResult===r;return<button key={r} onClick={()=>setForm({...form,soloResult:r})} style={{flex:1,padding:"7px 4px",border:`1px solid ${active?col:T.border2}`,background:active?T.surface2:"transparent",color:active?col:T.textMuted,fontFamily:"'Bebas Neue',cursive",fontSize:12,letterSpacing:1,cursor:"pointer",borderRadius:2}}>{r}</button>;})}
                    </div>
                  ):(
                    <div style={{display:"flex",gap:8}}>
                      {[["Pending",T.gold,"Pending","none"],[`${state.p1Name.slice(0,8)} W`,"#5AAF7A","Settled","p1"],[`${state.p2Name.slice(0,8)} W`,"#5AAF7A","Settled","p2"],["Push","#666","Settled","none"]].map(([label,col,res,win])=>{
                        const active=(res==="Pending"&&form.result==="Pending")||(res==="Settled"&&form.result==="Settled"&&form.winner===win&&!(win==="none"&&label!=="Push"));
                        return<button key={label} onClick={()=>setForm({...form,result:res,winner:win})} style={{flex:1,padding:"7px 3px",border:`1px solid ${active?col:T.border2}`,background:active?T.surface2:"transparent",color:active?col:T.textMuted,fontFamily:"'Bebas Neue',cursive",fontSize:11,letterSpacing:1,cursor:"pointer",borderRadius:2,whiteSpace:"nowrap"}}>{label}</button>;
                      })}
                    </div>
                  )}
                </div>
              )}
              <div style={{gridColumn:"1/-1"}}><label style={{fontSize:9,color:T.textMuted,letterSpacing:2,display:"block",marginBottom:3}}>NOTES (optional)</label><input className="fi" placeholder="Any context..." value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
            </div>
            <div style={{display:"flex",gap:10,marginTop:16}}>
              <button className="bg" style={{flex:1,padding:"11px",fontSize:16,borderRadius:2}} onClick={saveBet}>{editingBet?"SAVE CHANGES":"LOG BET"}</button>
              <button className="gh" style={{padding:"11px 16px",borderRadius:2}} onClick={()=>{setForm(blankForm);setEditingBet(null);setShowAddBet(false);}}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ WWE PLE MODAL ═══ */}
      {showPLE&&(
        <div style={{position:"fixed",inset:0,background:T.modalOverlay,display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20}}>
          <div style={{background:T.modalBg,border:"1px solid #3A1A1A",borderTop:"2px solid #9b1c1c",borderRadius:4,width:"100%",maxWidth:700,maxHeight:"92vh",overflowY:"auto",padding:24}}>
            <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:22,color:"#F08080",letterSpacing:3,marginBottom:4}}>🤼 WWE PLE CARD BUILDER</div>
            <div style={{fontSize:11,color:T.textMuted,marginBottom:16,lineHeight:1.6}}>Each player enters picks separately — hidden until both lock in. Stakes auto-scale by match count.</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:10,marginBottom:14}}>
              <div><label style={{fontSize:9,color:T.textMuted,letterSpacing:2,display:"block",marginBottom:3}}>EVENT NAME *</label><input className="fi" placeholder="e.g. WrestleMania 41" value={pleForm.eventName} onChange={e=>setPleForm({...pleForm,eventName:e.target.value})}/></div>
              <div><label style={{fontSize:9,color:T.textMuted,letterSpacing:2,display:"block",marginBottom:3}}>DATE</label><input type="date" className="fi" value={pleForm.date} onChange={e=>setPleForm({...pleForm,date:e.target.value})}/></div>
              <div><label style={{fontSize:9,color:T.textMuted,letterSpacing:2,display:"block",marginBottom:3}}>MATCHES</label><select className="fi" style={{width:80}} value={pleForm.matchCount} onChange={e=>updatePleMatchCount(e.target.value)}>{[4,5,6,7,8].map(n=><option key={n} value={n}>{n}</option>)}</select></div>
            </div>
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,padding:"8px 12px",borderRadius:2,marginBottom:14}}>
              <div style={{fontSize:9,color:T.textMuted,letterSpacing:2,marginBottom:6}}>STAKE TIERS FOR {pleForm.matchCount} MATCHES</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{pleTiers.map((t,i)=><div key={t} style={{background:T.surface,border:`1px solid ${T.border}`,padding:"3px 8px",borderRadius:2,textAlign:"center"}}><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:13,color:T.gold}}>{fmtShort(t)}</div><div style={{fontSize:9,color:T.textMuted}}>M{i+1}</div></div>)}</div>
            </div>
            <div style={{display:"flex",gap:0,marginBottom:14,background:T.surface2,borderRadius:3,padding:3}}>
              {[["p1",state.p1Name],["p2",state.p2Name]].map(([pl,name])=>{
                const locked=pleForm.matches.every(m=>m[`${pl}Locked`]);
                return<button key={pl} onClick={()=>setPleEntryPlayer(pl)} style={{flex:1,padding:"9px 6px",border:"none",borderRadius:2,cursor:"pointer",fontFamily:"'Bebas Neue',cursive",fontSize:14,letterSpacing:2,transition:"all .2s",background:pleEntryPlayer===pl?(pl==="p1"?"#1A2A3A":"#2A1A1A"):"transparent",color:pleEntryPlayer===pl?(pl==="p1"?p1Color.highlight:p2Color.highlight):T.textMuted,borderBottom:pleEntryPlayer===pl?`2px solid ${pl==="p1"?p1Color.highlight:p2Color.highlight}`:"2px solid transparent"}}>{name} {locked?"✓ LOCKED":"— ENTERING"}</button>;
              })}
            </div>
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,padding:"7px 12px",borderRadius:2,marginBottom:12,fontSize:11,color:T.textMuted}}>
              {pleEntryPlayer==="p1"?`${state.p1Name} is entering picks. ${state.p2Name}'s picks are hidden until locked.`:`${state.p2Name} is entering picks. ${state.p1Name}'s picks are hidden until locked.`}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {pleForm.matches.map((m,i)=>{
                const pl=pleEntryPlayer;
                const isLocked=m[`${pl}Locked`];
                const tier=pleTiers[i];
                return(
                  <div key={i} style={{background:T.surface,border:`1px solid ${isLocked?"#1A2A1A":T.border}`,padding:"11px 13px",borderRadius:3,opacity:isLocked?0.7:1}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontFamily:"'Bebas Neue',cursive",fontSize:12,color:"#9b1c1c",letterSpacing:2}}>MATCH {i+1}</span>
                        <span style={{fontFamily:"'Bebas Neue',cursive",fontSize:12,color:T.gold}}>{fmtShort(tier)}</span>
                        {isLocked&&<span style={{fontSize:9,color:"#5AAF7A",background:"#0A2A1A",padding:"2px 6px",borderRadius:2}}>LOCKED</span>}
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:8}}>
                      <div><label style={{fontSize:9,color:T.textMuted,letterSpacing:1,display:"block",marginBottom:3}}>MATCH / STIPULATION</label><input className="fi" placeholder="e.g. Cody Rhodes vs Roman Reigns" value={m.match} disabled={isLocked} onChange={e=>{const ms=[...pleForm.matches];ms[i]={...ms[i],match:e.target.value};setPleForm({...pleForm,matches:ms});}}/></div>
                      <div><label style={{fontSize:9,color:pl==="p1"?p1Color.highlight:p2Color.highlight,letterSpacing:1,display:"block",marginBottom:3}}>YOUR PICK</label><input className="fi" placeholder="Who wins?" value={m[`${pl}Pick`]} disabled={isLocked} onChange={e=>{const ms=[...pleForm.matches];ms[i]={...ms[i],[`${pl}Pick`]:e.target.value};setPleForm({...pleForm,matches:ms});}}/></div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",gap:10,marginTop:14}}>
              {!pleForm.matches.every(m=>m[`${pleEntryPlayer}Locked`])&&(
                <button style={{flex:1,padding:"11px",border:"none",borderRadius:2,cursor:"pointer",fontFamily:"'Bebas Neue',cursive",fontSize:15,letterSpacing:2,background:pleEntryPlayer==="p1"?"#1A2A3A":"#2A1A1A",color:pleEntryPlayer==="p1"?p1Color.highlight:p2Color.highlight}} onClick={()=>lockPlayerPicks(pleEntryPlayer)}>
                  🔒 LOCK {(pleEntryPlayer==="p1"?state.p1Name:state.p2Name).toUpperCase()}'S PICKS
                </button>
              )}
              {bothLocked&&<button className="bg" style={{flex:1,padding:"11px",fontSize:15,borderRadius:2}} onClick={addPLECard}>✓ SUBMIT PLE CARD</button>}
              <button className="gh" style={{padding:"11px 14px",borderRadius:2}} onClick={()=>{setPleForm(blankPLE);setPleEntryPlayer("p1");setShowPLE(false);}}>CANCEL</button>
            </div>
            {!bothLocked&&<div style={{fontSize:11,color:T.textMuted,marginTop:8,textAlign:"center"}}>Both players must lock in before the card can be submitted.</div>}
          </div>
        </div>
      )}

      {/* ═══ LOG SPECIAL MODE MODAL ═══ */}
      {showLogMode&&(
        <div style={{position:"fixed",inset:0,background:T.modalOverlay,display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20}}>
          <div style={{background:T.modalBg,border:`1px solid ${T.border2}`,borderTop:`2px solid ${T.gold}`,borderRadius:4,width:"100%",maxWidth:420,padding:24}}>
            <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:22,color:T.gold,letterSpacing:3,marginBottom:16}}>⚡ LOG MODE INVOCATION</div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div><label style={{fontSize:9,color:T.textMuted,letterSpacing:2,display:"block",marginBottom:3}}>SPECIAL MODE</label>
                <select className="fi" value={modeLogForm.modeKey} onChange={e=>setModeLogForm({...modeLogForm,modeKey:e.target.value})}>
                  {SPECIAL_MODES.filter(m=>m.trackPer!=="none").map(m=><option key={m.key} value={m.key}>{m.icon} {m.name}</option>)}
                </select>
              </div>
              <div><label style={{fontSize:9,color:T.textMuted,letterSpacing:2,display:"block",marginBottom:5}}>INVOKED BY</label>
                <div style={{display:"flex",gap:8}}>
                  {[["p1",state.p1Name],["p2",state.p2Name]].map(([v,n])=>(
                    <button key={v} onClick={()=>setModeLogForm({...modeLogForm,player:v})} style={{flex:1,padding:"8px",border:`1px solid ${modeLogForm.player===v?T.gold:T.border2}`,background:modeLogForm.player===v?T.surface2:"transparent",color:modeLogForm.player===v?T.gold:T.textMuted,fontFamily:"'Bebas Neue',cursive",fontSize:13,letterSpacing:1,cursor:"pointer",borderRadius:2}}>{n}</button>
                  ))}
                </div>
              </div>
              <div><label style={{fontSize:9,color:T.textMuted,letterSpacing:2,display:"block",marginBottom:3}}>NOTE (optional)</label><input className="fi" placeholder="e.g. Invoked before WrestleMania week" value={modeLogForm.note} onChange={e=>setModeLogForm({...modeLogForm,note:e.target.value})}/></div>
            </div>
            <div style={{display:"flex",gap:10,marginTop:16}}>
              <button className="bg" style={{flex:1,padding:"11px",fontSize:16,borderRadius:2}} onClick={logModeInvocation}>LOG IT</button>
              <button className="gh" style={{padding:"11px 14px",borderRadius:2}} onClick={()=>setShowLogMode(false)}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ADJUSTMENT MODAL ═══ */}
      {showAdjust&&(
        <div style={{position:"fixed",inset:0,background:T.modalOverlay,display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20}}>
          <div style={{background:T.modalBg,border:`1px solid ${T.border2}`,borderTop:"2px solid #6FA8DC",borderRadius:4,width:"100%",maxWidth:420,padding:24}}>
            <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:22,color:"#6FA8DC",letterSpacing:3,marginBottom:4}}>⚖ BALANCE ADJUSTMENT</div>
            <div style={{fontSize:11,color:T.textMuted,marginBottom:16,lineHeight:1.6}}>Manual correction or carry-over. Logged with ADJ tag. Does not count as a bet.</div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div><label style={{fontSize:9,color:T.textMuted,letterSpacing:2,display:"block",marginBottom:5}}>ADJUST WHICH PLAYER?</label>
                <div style={{display:"flex",gap:8}}>
                  {[["p1",state.p1Name],["p2",state.p2Name]].map(([v,n])=>(
                    <button key={v} onClick={()=>setAdjustForm({...adjustForm,target:v})} style={{flex:1,padding:"9px",border:`1px solid ${adjustForm.target===v?"#6FA8DC":T.border2}`,background:adjustForm.target===v?"#1A1A2A":"transparent",color:adjustForm.target===v?"#6FA8DC":T.textMuted,fontFamily:"'Bebas Neue',cursive",fontSize:14,letterSpacing:1,cursor:"pointer",borderRadius:2}}>{n}</button>
                  ))}
                </div>
              </div>
              <div><label style={{fontSize:9,color:T.textMuted,letterSpacing:2,display:"block",marginBottom:5}}>ADD OR SUBTRACT?</label>
                <div style={{display:"flex",gap:8}}>
                  {[["add","+ ADD","#5AAF7A"],["subtract","− SUBTRACT","#E06C75"]].map(([v,l,col])=>(
                    <button key={v} onClick={()=>setAdjustForm({...adjustForm,direction:v})} style={{flex:1,padding:"9px",border:`1px solid ${adjustForm.direction===v?col:T.border2}`,background:adjustForm.direction===v?T.surface2:"transparent",color:adjustForm.direction===v?col:T.textMuted,fontFamily:"'Bebas Neue',cursive",fontSize:16,letterSpacing:2,cursor:"pointer",borderRadius:2}}>{l}</button>
                  ))}
                </div>
              </div>
              <div><label style={{fontSize:9,color:T.textMuted,letterSpacing:2,display:"block",marginBottom:3}}>AMOUNT *</label><input className="fi" placeholder="e.g. 50000" value={adjustForm.amount} onChange={e=>setAdjustForm({...adjustForm,amount:e.target.value})}/></div>
              <div><label style={{fontSize:9,color:T.textMuted,letterSpacing:2,display:"block",marginBottom:3}}>REASON (optional)</label><input className="fi" placeholder="e.g. Carry-over from previous season" value={adjustForm.reason} onChange={e=>setAdjustForm({...adjustForm,reason:e.target.value})}/></div>
              {adjustForm.amount&&(
                <div style={{background:T.surface2,border:`1px solid ${T.border}`,padding:"9px 13px",borderRadius:2,fontSize:12,color:T.textMuted}}>
                  <span style={{color:adjustForm.direction==="add"?"#5AAF7A":"#E06C75"}}>{adjustForm.direction==="add"?"+":"-"}{fmt(parseInt(String(adjustForm.amount).replace(/,/g,""))||0)}</span>
                  {" "}to {adjustForm.target==="p1"?state.p1Name:state.p2Name}'s stack →{" "}
                  <span style={{color:T.gold,fontFamily:"'Bebas Neue',cursive",fontSize:15}}>{fmt((adjustForm.target==="p1"?state.p1Balance:state.p2Balance)+(adjustForm.direction==="add"?1:-1)*(parseInt(String(adjustForm.amount).replace(/,/g,""))||0))}</span>
                </div>
              )}
            </div>
            <div style={{display:"flex",gap:10,marginTop:16}}>
              <button className="bg" style={{flex:1,padding:"11px",fontSize:16,borderRadius:2}} onClick={applyAdjustment}>APPLY</button>
              <button className="gh" style={{padding:"11px 14px",borderRadius:2}} onClick={()=>{setAdjustForm(blankAdjust);setShowAdjust(false);}}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ COLOR PICKER MODAL ═══ */}
      {showColorPicker&&(
        <div style={{position:"fixed",inset:0,background:T.modalOverlay,display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20}}>
          <div style={{background:T.modalBg,border:`1px solid ${T.border2}`,borderTop:`2px solid ${T.gold}`,borderRadius:4,width:"100%",maxWidth:380,padding:24}}>
            <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:T.gold,letterSpacing:3,marginBottom:4}}>🎨 CHOOSE COLOR</div>
            <div style={{fontSize:11,color:T.textMuted,marginBottom:16}}>Pick a highlight color for {showColorPicker==="p1"?state.p1Name:state.p2Name}.</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:16}}>
              {PLAYER_COLORS.map(c=>{
                const current=showColorPicker==="p1"?p1Color:p2Color;
                const active=current.highlight===c.highlight;
                return(
                  <button key={c.label} onClick={()=>saveColor(showColorPicker,{highlight:c.highlight,font:c.font})}
                    style={{background:c.highlight,border:active?"3px solid #fff":"3px solid transparent",borderRadius:4,height:44,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"transform .15s",transform:active?"scale(1.1)":"scale(1)"}}>
                    <span style={{color:c.font,fontSize:10,fontFamily:"'Bebas Neue',cursive",letterSpacing:1}}>{c.label}</span>
                  </button>
                );
              })}
            </div>
            <button className="gh" style={{width:"100%",padding:"10px",borderRadius:2,fontSize:13}} onClick={()=>setShowColorPicker(null)}>CANCEL</button>
          </div>
        </div>
      )}

      {/* ═══ EDIT RANKINGS MODAL ═══ */}
      {editingRankings&&(
        <div style={{position:"fixed",inset:0,background:T.modalOverlay,display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20}}>
          <div style={{background:T.modalBg,border:`1px solid ${T.border2}`,borderTop:`2px solid ${T.gold}`,borderRadius:4,width:"100%",maxWidth:700,maxHeight:"92vh",overflowY:"auto",padding:24}}>
            <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:22,color:T.gold,letterSpacing:3,marginBottom:4}}>🏆 EDIT POWER RANKINGS</div>
            <div style={{fontSize:11,color:T.textMuted,marginBottom:18,lineHeight:1.6}}>Set each player's Top 5 WWE roster. Add optional notes (e.g. "if turns face", "only on RAW").</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              {[["p1",state.p1Name,p1Color],["p2",state.p2Name,p2Color]].map(([player,name,pColor])=>(
                <div key={player}>
                  <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:15,color:pColor.highlight,letterSpacing:2,marginBottom:10,borderBottom:`1px solid ${pColor.highlight}44`,paddingBottom:6}}>{name.toUpperCase()}'S ROSTER</div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {(rankForm[player]||blankRankings()).map((w,i)=>(
                      <div key={i} style={{display:"flex",gap:8,alignItems:"center"}}>
                        <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:i===0?T.gold:`${pColor.highlight}66`,minWidth:24,textAlign:"center"}}>{i+1}</div>
                        <div style={{flex:1,display:"flex",flexDirection:"column",gap:4}}>
                          <input className="fi" style={{fontSize:13}} placeholder={`Rank #${i+1} wrestler`} value={w.name}
                            onChange={e=>{const updated=[...rankForm[player]];updated[i]={...updated[i],name:e.target.value};setRankForm({...rankForm,[player]:updated});}}/>
                          <input className="fi" style={{fontSize:11,padding:"5px 10px"}} placeholder="Notes (optional)" value={w.notes||""}
                            onChange={e=>{const updated=[...rankForm[player]];updated[i]={...updated[i],notes:e.target.value};setRankForm({...rankForm,[player]:updated});}}/>
                        </div>
                        <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:12,color:T.gold,minWidth:32,textAlign:"right"}}>{fmtShort(RANK_BONUSES[i])}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:10,marginTop:20}}>
              <button className="bg" style={{flex:1,padding:"11px",fontSize:16,borderRadius:2}} onClick={saveRankings}>SAVE RANKINGS</button>
              <button className="gh" style={{padding:"11px 16px",borderRadius:2}} onClick={()=>setEditingRankings(false)}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ CLAIM BONUS MODAL ═══ */}
      {showClaimBonus&&(
        <div style={{position:"fixed",inset:0,background:T.modalOverlay,display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20}}>
          <div style={{background:T.modalBg,border:`1px solid ${T.border2}`,borderTop:"2px solid #5AAF7A",borderRadius:4,width:"100%",maxWidth:460,padding:24}}>
            <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:22,color:"#5AAF7A",letterSpacing:3,marginBottom:4}}>💰 CLAIM RANKING BONUS</div>
            <div style={{fontSize:11,color:T.textMuted,marginBottom:18,lineHeight:1.6}}>Select which player's ranked wrestler won a title, then confirm the title name.</div>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div><label style={{fontSize:9,color:T.textMuted,letterSpacing:2,display:"block",marginBottom:5}}>WHICH PLAYER?</label>
                <div style={{display:"flex",gap:8}}>
                  {[["p1",state.p1Name,p1Color],["p2",state.p2Name,p2Color]].map(([v,n,pColor])=>(
                    <button key={v} onClick={()=>setClaimForm({...claimForm,player:v,rank:0})} style={{flex:1,padding:"9px",border:`1px solid ${claimForm.player===v?pColor.highlight:T.border2}`,background:claimForm.player===v?`${pColor.highlight}22`:"transparent",color:claimForm.player===v?pColor.highlight:T.textMuted,fontFamily:"'Bebas Neue',cursive",fontSize:14,letterSpacing:1,cursor:"pointer",borderRadius:2}}>{n}</button>
                  ))}
                </div>
              </div>
              <div><label style={{fontSize:9,color:T.textMuted,letterSpacing:2,display:"block",marginBottom:5}}>WHICH RANKED WRESTLER WON?</label>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {((claimForm.player==="p1"?state.p1Rankings:state.p2Rankings)||blankRankings()).map((w,i)=>{
                    const active = claimForm.rank===i;
                    const hasName = w.name && w.name.trim();
                    return(
                      <button key={i} disabled={!hasName} onClick={()=>setClaimForm({...claimForm,rank:i})}
                        style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",border:`1px solid ${active?"#5AAF7A":T.border2}`,borderRadius:3,background:active?"#0A2A1A":"transparent",cursor:hasName?"pointer":"not-allowed",opacity:hasName?1:0.4,transition:"all .15s"}}>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:active?"#5AAF7A":T.textMuted}}>{i+1}</div>
                          <div style={{textAlign:"left"}}>
                            <div style={{fontSize:13,color:active?"#fff":T.text}}>{hasName?w.name:"(empty)"}</div>
                            {w.notes&&<div style={{fontSize:10,color:T.textMuted}}>{w.notes}</div>}
                          </div>
                        </div>
                        <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:16,color:active?"#5AAF7A":T.gold}}>{fmtShort(RANK_BONUSES[i])}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div><label style={{fontSize:9,color:T.textMuted,letterSpacing:2,display:"block",marginBottom:3}}>TITLE WON *</label>
                <input className="fi" placeholder="e.g. WWE Championship, Women's World Title..." value={claimForm.titleWon} onChange={e=>setClaimForm({...claimForm,titleWon:e.target.value})}/>
              </div>
              {claimForm.titleWon&&(()=>{
                const rankings=(claimForm.player==="p1"?state.p1Rankings:state.p2Rankings)||blankRankings();
                const wrestler=rankings[claimForm.rank]?.name;
                const bonus=RANK_BONUSES[claimForm.rank];
                const playerName=claimForm.player==="p1"?state.p1Name:state.p2Name;
                return wrestler?(
                  <div style={{background:"#0A2A1A",border:"1px solid #1A4A1A",padding:"10px 14px",borderRadius:3,fontSize:12}}>
                    <div style={{color:"#5AAF7A",fontFamily:"'Bebas Neue',cursive",fontSize:16,letterSpacing:1}}>✓ {playerName} claims +{fmt(bonus)}</div>
                    <div style={{color:T.textMuted,marginTop:3}}>{wrestler} (Rank #{claimForm.rank+1}) won the {claimForm.titleWon}</div>
                  </div>
                ):null;
              })()}
            </div>
            <div style={{display:"flex",gap:10,marginTop:18}}>
              <button className="bg" style={{flex:1,padding:"11px",fontSize:16,borderRadius:2}} onClick={claimRankingBonus}>CLAIM {fmtShort(RANK_BONUSES[claimForm.rank])} BONUS</button>
              <button className="gh" style={{padding:"11px 16px",borderRadius:2}} onClick={()=>{setClaimForm(blankClaim);setShowClaimBonus(false);}}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ RESET CONFIRM ═══ */}
      {showResetConfirm&&(
        <div style={{position:"fixed",inset:0,background:T.modalOverlay,display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20}}>
          <div style={{background:T.modalBg,border:"1px solid #4A1A1A",borderTop:"2px solid #C0392B",borderRadius:4,width:"100%",maxWidth:340,padding:24,textAlign:"center"}}>
            <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:24,color:"#C0392B",letterSpacing:3,marginBottom:8}}>RESET SEASON?</div>
            <div style={{fontSize:12,color:T.textMuted,marginBottom:20,lineHeight:1.6}}>Clears all bets and resets both stacks to $100,000. Permanent.</div>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <button style={{background:"#C0392B",border:"none",color:"white",fontFamily:"'Bebas Neue',cursive",fontSize:16,letterSpacing:2,padding:"10px 22px",borderRadius:2,cursor:"pointer"}} onClick={resetSeason}>RESET</button>
              <button className="gh" style={{padding:"10px 20px",borderRadius:2,fontSize:13}} onClick={()=>setShowResetConfirm(false)}>CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
