import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend
} from "recharts";
import * as Papa from "papaparse";

/* ───────── visitor tracking ───────── */
const TRACKING_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbydp8UN9OtEudLnbL-ySBKMEgVrp9iP9qa7X6MoE1mxAuuxGVnemsiU69CllGWF2AgSmw/exec"


/* ───────── constants ───────── */
const PAL = [
  "#2563eb","#7c3aed","#0d9488","#ea580c","#db2777","#16a34a",
  "#ca8a04","#dc2626","#4f46e5","#059669","#d97706","#475569",
  "#0891b2","#9333ea","#65a30d","#c026d3","#0284c7","#f97316"
];

const shortenAccount = (acct) => {
  if (acct.length <= 40) return acct;
  if (acct.includes(" - ")) {
    const parts = acct.split(" - ");
    if (parts.length >= 2) return parts.slice(0, 2).join(" - ").substring(0, 40);
  }
  return acct.substring(0, 37) + "…";
};

const getAccountTypeBadgeColor = (accountName) => {
  const a = accountName.toLowerCase();
  if (a.includes("roth")) return "bg-pink-100 text-pink-700";
  if (a.includes("traditional") || a.includes("trad") || a.includes("rollover")) return "bg-purple-100 text-purple-700";
  if (a.includes("401k") || a.includes("401(k)")) return "bg-violet-100 text-violet-700";
  if (a.includes("403b") || a.includes("403(b)")) return "bg-violet-100 text-violet-700";
  if (a.includes("hsa")) return "bg-lime-100 text-lime-700";
  if (a.includes("529")) return "bg-cyan-100 text-cyan-700";
  if (a.includes("trust")) return "bg-blue-100 text-blue-700";
  if (a.includes("espp")) return "bg-amber-100 text-amber-700";
  if (a.includes("checking") || a.includes("savings")) return "bg-gray-100 text-gray-600";
  return "bg-orange-100 text-orange-700"; // Default Taxable
};

const getAssetClassColor = (assetClass) => {
  const lower = assetClass.toLowerCase();
  if (lower.includes("bond") || lower.includes("fixed")) return "emerald";
  if (lower.includes("intl") || lower.includes("international") || lower.includes("foreign")) return "teal";
  if (lower.includes("equity") || lower.includes("stock")) return "blue";
  if (lower.includes("cash") || lower.includes("money market")) return "gray";
  return "slate";
};

/* ───────── helpers ───────── */
const fmt = (v) => {
  if (v == null || isNaN(v)) return "$0";
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `$${v.toFixed(2)}`;
};

const parseVal = (s) => {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(/[$,"\s]/g, ""));
  return isNaN(n) ? 0 : n;
};

const getAssetClassFromCSV = (row) => {
  const { morningstar, type, stockStyle, bondStyle } = row;
  
  // Normalize based on CSV values
  const classify = (value) => {
    if (!value || !value.trim()) return null;
    const v = value.toLowerCase();
    
    // Bond/Fixed Income classification
    if (v.includes("bond") || v.includes("fixed income") || v.includes("government") || v.includes("corporate")) return "US Bonds";
    if (v.includes("international bond") || v.includes("global bond") || v.includes("foreign bond")) return "Intl Bonds";
    if (v.includes("money market") || v.includes("cash")) return "Cash";
    
    // Equity classification
    if (v.includes("foreign") || v.includes("international") || v.includes("intl") || v.includes("emerging")) return "Intl Equity";
    if (v.includes("stock") || v.includes("equity") || v.includes("blend") || v.includes("growth") || v.includes("value") || v.includes("large") || v.includes("small") || v.includes("mid")) return "US Equity";
    
    return null;
  };
  
  // Try to classify from available fields in priority order
  let classification = classify(morningstar) || classify(type) || classify(stockStyle) || classify(bondStyle);
  
  // If we couldn't classify, return the original value for display but mark as "Other"
  if (!classification) {
    return morningstar || type || stockStyle || bondStyle || "Other";
  }
  
  return classification;
};

/* ───────── CSV parser ───────── */
const parseCSV = (text) => {
  const lines = text.split(/\r?\n/);
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/Symbol\s*,/i)) { headerIdx = i; break; }
  }
  if (headerIdx === -1) throw new Error("Could not find header row with 'Symbol' column");

  const csvBody = lines.slice(headerIdx).join("\n");
  const parsed = Papa.parse(csvBody, { header: true, skipEmptyLines: true });

  const holdings = [];
  let asOfDate = "";
  for (let i = 0; i < headerIdx; i++) {
    const m = lines[i].match(/As of date:\s*(.+?)(?:,|$)/i);
    if (m) { asOfDate = m[1].trim(); break; }
  }

  for (const row of parsed.data) {
    const rawKeys = Object.keys(row);
    const get = (partial) => {
      const key = rawKeys.find(k => k.trim().toLowerCase().includes(partial.toLowerCase()));
      return key ? (row[key] || "").trim() : "";
    };

    const symbol = get("Symbol");
    const desc = get("Description");
    const account = get("Account");
    const type = get("Investment Type");
    const morningstar = get("Morningstar");
    const stockStyle = get("Stock Style");
    const bondStyle = get("Bond Style");
    let value = parseVal(get("Total Value"));
    const qty = parseVal(get("Quantity"));
    const price = parseVal(get("Price"));
    const weight = get("Portfolio Weight");

    if (value === 0 && qty > 0 && price > 0) value = qty * price;
    if (value === 0 && qty > 0 && (morningstar.includes("Money Market") || type === "Cash")) value = qty;

    if (value <= 0 && !type) continue;
    if (desc.toLowerCase().includes("data and information")) continue;

    const displaySymbol = symbol || (type === "Cash" ? "CASH" : desc.substring(0, 8) || "OTHER");
    
    // Clean CSV values (remove placeholder text)
    const cleanValue = (v) => v.replace(/- -|--|N\/A|n\/a/gi, "").trim();
    const cleanMorningstar = cleanValue(morningstar);
    const cleanType = cleanValue(type);
    const cleanStockStyle = cleanValue(stockStyle);
    const cleanBondStyle = cleanValue(bondStyle);

    holdings.push({
      symbol: displaySymbol,
      desc: desc || displaySymbol,
      account,
      accountShort: shortenAccount(account),
      type: cleanType || "Other",
      morningstar: cleanMorningstar,
      stockStyle: cleanStockStyle,
      bondStyle: cleanBondStyle,
      qty, price, value,
      weight,
      assetClass: getAssetClassFromCSV({ morningstar: cleanMorningstar, type: cleanType, stockStyle: cleanStockStyle, bondStyle: cleanBondStyle }),
    });
  }

  return { holdings, asOfDate };
};

/* ───────── sub-components ───────── */
const Badge = ({ children, className = "" }) => (
  <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${className}`}>{children}</span>
);

const CategoryCard = ({ label, value, total, isActive, onClick, count, colorClass }) => (
  <button onClick={onClick}
    className={`rounded-xl p-3 border-2 text-left transition-all w-full ${
      isActive ? "border-blue-500 bg-blue-50 shadow-md ring-1 ring-blue-200" : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
    }`}>
    <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">{label}</p>
    <p className="text-lg font-bold text-gray-900 mt-0.5">{fmt(value)}</p>
    <div className="flex justify-between items-center mt-1">
      <span className="text-sm font-medium text-gray-500">{(value / total * 100).toFixed(1)}%</span>
      <span className="text-xs text-gray-400">{count} item{count !== 1 ? "s" : ""}</span>
    </div>
  </button>
);

const HoldingsTable = ({ data, total, showAccount = true, showAssetClass = false }) => {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const subtotal = data.reduce((s, h) => s + h.value, 0);
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-400 tracking-wider">
            <th className="py-2.5 px-3">Holding</th>
            {showAccount && <th className="py-2.5 px-3">Account</th>}
            {showAssetClass && <th className="py-2.5 px-3">Class</th>}
            <th className="py-2.5 px-3 text-right">Qty</th>
            <th className="py-2.5 px-3 text-right">Price</th>
            <th className="py-2.5 px-3 text-right">Value</th>
            <th className="py-2.5 px-3 text-right">Weight</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((h, i) => (
            <tr key={i} className="border-b border-gray-100 hover:bg-blue-50/40 transition-colors">
              <td className="py-2 px-3">
                <div className="font-semibold text-gray-800 text-sm">{h.symbol}</div>
                <div className="text-xs text-gray-400 truncate max-w-52">{h.desc}</div>
              </td>
              {showAccount && (
                <td className="py-2 px-3">
                  <div className="text-sm text-gray-700">{h.accountShort}</div>
                  <Badge className={getAccountTypeBadgeColor(h.account)}>{h.account}</Badge>
                </td>
              )}
              {showAssetClass && (
                <td className="py-2 px-3">
                  <Badge className="bg-gray-100 text-gray-600">{h.assetClass}</Badge>
                </td>
              )}
              <td className="py-2 px-3 text-right text-sm text-gray-500">
                {h.qty ? (h.qty % 1 !== 0 ? h.qty.toFixed(2) : h.qty.toLocaleString()) : "–"}
              </td>
              <td className="py-2 px-3 text-right text-sm text-gray-500">
                {h.price > 0 ? `$${h.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "–"}
              </td>
              <td className="py-2 px-3 text-right">
                <div className="font-semibold text-sm text-gray-800">{fmt(h.value)}</div>
              </td>
              <td className="py-2 px-3 text-right text-sm text-gray-500">
                {(h.value / total * 100).toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 border-t-2 border-gray-300">
            <td colSpan={showAccount ? (showAssetClass ? 6 : 5) : (showAssetClass ? 5 : 4)} className="py-2.5 px-3 font-bold text-sm text-gray-700">
              Subtotal ({sorted.length} items)
            </td>
            <td className="py-2.5 px-3 text-right font-bold text-sm text-gray-900">{fmt(subtotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

const ConsolidatedTable = ({ groups, total, onSelect, selected }) => {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-400 tracking-wider">
            <th className="py-2.5 px-3">Holding</th>
            <th className="py-2.5 px-3">Asset Class</th>
            <th className="py-2.5 px-3 text-center">Accounts</th>
            <th className="py-2.5 px-3 text-right">Total Value</th>
            <th className="py-2.5 px-3 text-right">Weight</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, i) => (
            <tr key={i}
              onClick={() => onSelect(selected === g.symbol ? null : g.symbol)}
              className={`border-b border-gray-100 cursor-pointer transition-colors ${
                selected === g.symbol ? "bg-blue-50 border-blue-200" : "hover:bg-gray-50"
              }`}>
              <td className="py-2.5 px-3">
                <div className="font-semibold text-gray-800 text-sm">{g.symbol}</div>
                <div className="text-xs text-gray-400 truncate max-w-52">{g.desc}</div>
              </td>
              <td className="py-2.5 px-3">
                <Badge className={`bg-${getAssetClassColor(g.assetClass)}-100 text-${getAssetClassColor(g.assetClass)}-700`}>{g.assetClass}</Badge>
              </td>
              <td className="py-2.5 px-3 text-center">
                {g.accounts.length > 1 ? (
                  <Badge className="bg-blue-100 text-blue-700">{g.accounts.length} accounts</Badge>
                ) : (
                  <span className="text-xs text-gray-500">{g.accounts[0]}</span>
                )}
              </td>
              <td className="py-2.5 px-3 text-right font-semibold text-sm text-gray-800">{fmt(g.value)}</td>
              <td className="py-2.5 px-3 text-right text-sm text-gray-500">{(g.value / total * 100).toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-gray-900 text-white px-3 py-2 rounded-lg shadow-xl text-sm border border-gray-700">
      <p className="font-semibold">{d.name}</p>
      <p>{fmt(d.value)}{d.pct ? ` (${d.pct})` : ""}</p>
    </div>
  );
};

/* ───────── UPLOAD SCREEN ───────── */
const UploadScreen = ({ onData }) => {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);
  const [loadingSample, setLoadingSample] = useState(false);
  const fileRef = useRef();

  const processFile = useCallback((file) => {
    setError(null);
    if (!file) return;
    if (!file.name.match(/\.(csv|txt)$/i)) {
      setError("Please upload a .csv file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = parseCSV(e.target.result);
        if (result.holdings.length === 0) throw new Error("No holdings found in CSV");
        onData(result);
      } catch (err) {
        setError(`Parse error: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }, [onData]);

  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); processFile(e.dataTransfer.files[0]); };

  const loadSample = useCallback(async () => {
    setError(null);
    setLoadingSample(true);
    try {
      const base = import.meta.env.BASE_URL;
      const res = await fetch(`${base}sample-portfolio.csv`);
      if (!res.ok) throw new Error("Could not fetch sample file");
      const text = await res.text();
      const result = parseCSV(text);
      if (result.holdings.length === 0) throw new Error("No holdings found in sample CSV");
      onData(result);
    } catch (err) {
      setError(`Sample load error: ${err.message}`);
    } finally {
      setLoadingSample(false);
    }
  }, [onData]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-6">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4 shadow-lg shadow-blue-600/30">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Portfolio Analyzer</h1>
          <p className="text-blue-300/70 mt-2 text-sm">Upload your Fidelity GPS CSV export for instant analysis</p>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-300 ${
            dragOver
              ? "border-blue-400 bg-blue-500/10 scale-[1.02]"
              : "border-slate-600 bg-slate-800/50 hover:border-blue-500/50 hover:bg-slate-800/80"
          }`}>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
            onChange={(e) => processFile(e.target.files[0])} />
          <div className="mb-4">
            <svg className={`w-12 h-12 mx-auto transition-colors ${dragOver ? "text-blue-400" : "text-slate-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <p className="text-white font-medium">Drop your CSV here or click to browse</p>
          <p className="text-slate-400 text-sm mt-1">Accepts Fidelity Guided Portfolio Summary (GPS) exports</p>
        </div>

        <div className="mt-4 text-center">
          <button onClick={loadSample} disabled={loadingSample}
            className="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors disabled:opacity-50">
            {loadingSample ? "Loading..." : "Or click here to load a sample portfolio"}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="mt-6 rounded-xl bg-slate-800/50 border border-slate-700 px-4 py-3">
          <p className="text-slate-300 text-xs font-medium mb-2">How to export from Fidelity:</p>
          <ol className="text-slate-400 text-xs space-y-1 list-decimal list-inside">
            <li>Log in to Fidelity.com → Portfolio → Guided Portfolio Summary</li>
            <li>Click "Export" or "Download" to get the CSV</li>
            <li>Upload the downloaded file here</li>
          </ol>
        </div>

        <p className="text-slate-600 text-xs text-center mt-6">
          Your portfolio data is processed entirely in your browser and is never uploaded. Anonymous visit info (IP, location) may be collected for analytics.
          <span className="mx-1">·</span>
          <a href="https://github.com/suhasjog/asset_allocation" target="_blank" rel="noopener noreferrer"
            className="text-slate-500 hover:text-blue-400 transition-colors underline underline-offset-2">
            Source on GitHub
          </a>
        </p>
      </div>
    </div>
  );
};

/* ───────── MAIN DASHBOARD ───────── */
const Dashboard = ({ holdings, asOfDate, onReset }) => {
  const [view, setView] = useState("overview");
  const [selected, setSelected] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const total = useMemo(() => holdings.reduce((s, h) => s + h.value, 0), [holdings]);
  const pct = (v) => `${(v / total * 100).toFixed(1)}%`;

  /* grouped data */
  const assetClassGroups = useMemo(() => {
    const m = {};
    holdings.forEach(h => {
      if (!m[h.assetClass]) m[h.assetClass] = [];
      m[h.assetClass].push(h);
    });
    return Object.entries(m)
      .map(([name, items]) => ({ name, items, value: items.reduce((s, h) => s + h.value, 0) }))
      .sort((a, b) => b.value - a.value);
  }, [holdings]);

  const accountGroups = useMemo(() => {
    const m = {};
    holdings.forEach(h => {
      const key = h.accountShort;
      if (!m[key]) m[key] = { items: [], account: h.account };
      m[key].items.push(h);
    });
    return Object.entries(m)
      .map(([name, { items, account }]) => ({ name, items, account, value: items.reduce((s, h) => s + h.value, 0) }))
      .sort((a, b) => b.value - a.value);
  }, [holdings]);

  const holdingGroups = useMemo(() => {
    const m = {};
    holdings.forEach(h => {
      const key = h.symbol;
      if (!m[key]) m[key] = { items: [], desc: h.desc, assetClass: h.assetClass };
      m[key].items.push(h);
    });
    return Object.entries(m)
      .map(([symbol, { items, desc, assetClass }]) => ({
        symbol, desc, assetClass, items,
        value: items.reduce((s, h) => s + h.value, 0),
        totalQty: items.reduce((s, h) => s + h.qty, 0),
        accounts: [...new Set(items.map(h => h.accountShort))],
      }))
      .sort((a, b) => b.value - a.value);
  }, [holdings]);

  const styleGroups = useMemo(() => {
    const m = {};
    holdings.forEach(h => {
      const style = h.stockStyle || h.assetClass || "Other";
      if (!m[style]) m[style] = [];
      m[style].push(h);
    });
    return Object.entries(m)
      .map(([name, items]) => ({ name, items, value: items.reduce((s, h) => s + h.value, 0) }))
      .sort((a, b) => b.value - a.value);
  }, [holdings]);

  /* derived metrics */
  const metrics = useMemo(() => {
    const equityVal = (assetClassGroups.find(g => g.name === "US Equity")?.value || 0)
                    + (assetClassGroups.find(g => g.name === "Intl Equity")?.value || 0);
    const bondVal = (assetClassGroups.find(g => g.name === "US Bonds")?.value || 0)
                  + (assetClassGroups.find(g => g.name === "Intl Bonds")?.value || 0)
                  + (assetClassGroups.find(g => g.name === "Fixed Income")?.value || 0);
    const cashVal = assetClassGroups.find(g => g.name === "Cash")?.value || 0;
    const usEq = assetClassGroups.find(g => g.name === "US Equity")?.value || 0;
    const intlEq = assetClassGroups.find(g => g.name === "Intl Equity")?.value || 0;
    const invested = equityVal + bondVal;
    const individualStocks = holdings.filter(h => h.type === "Equity").reduce((s, h) => s + h.value, 0);
    return { equityVal, bondVal, cashVal, usEq, intlEq, invested, individualStocks,
      stockPct: invested > 0 ? (equityVal / invested * 100).toFixed(0) : 0,
      bondPct: invested > 0 ? (bondVal / invested * 100).toFixed(0) : 0,
      usPct: equityVal > 0 ? (usEq / equityVal * 100).toFixed(0) : 0,
      intlPct: equityVal > 0 ? (intlEq / equityVal * 100).toFixed(0) : 0,
    };
  }, [assetClassGroups, holdings]);

  const filteredAll = useMemo(() => {
    const term = searchTerm.toLowerCase();
    const list = term
      ? holdings.filter(h =>
          h.symbol.toLowerCase().includes(term) ||
          h.desc.toLowerCase().includes(term) ||
          h.accountShort.toLowerCase().includes(term) ||
          h.assetClass.toLowerCase().includes(term) ||
          h.account.toLowerCase().includes(term) ||
          h.type.toLowerCase().includes(term)
        )
      : holdings;
    return [...list].sort((a, b) => b.value - a.value);
  }, [holdings, searchTerm]);

  const views = [
    { id: "overview", label: "Overview" },
    { id: "asset_class", label: "By Asset Class" },
    { id: "account", label: "By Account" },
    { id: "holding", label: "By Holding" },
    { id: "style", label: "By Style" },
    { id: "all", label: "All Holdings" },
  ];

  const PieLabel = ({ cx, cy, midAngle, outerRadius, name, value }) => {
    const p = (value / total * 100);
    if (p < 3.5) return null;
    const RADIAN = Math.PI / 180;
    const r = outerRadius + 25;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    return <text x={x} y={y} fill="#475569" textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontSize={11} fontWeight={500}>{name} ({p.toFixed(1)}%)</text>;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 via-blue-900 to-slate-800 text-white">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold tracking-tight">Portfolio Analysis</h1>
                <button onClick={onReset}
                  className="text-xs bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-lg transition-colors">
                  ↺ New File
                </button>
              </div>
              {asOfDate && <p className="text-blue-300/60 text-xs mt-0.5">As of {asOfDate}</p>}
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold tracking-tight">{fmt(total)}</div>
              <div className="text-blue-300/60 text-xs">{holdings.length} positions · {accountGroups.length} accounts</div>
            </div>
          </div>
        </div>
        {/* Quick stat bar */}
        <div className="border-t border-white/10">
          <div className="max-w-6xl mx-auto grid grid-cols-3 sm:grid-cols-6 divide-x divide-white/10">
            {assetClassGroups.slice(0, 6).map((g, i) => (
              <div key={g.name} className="px-3 py-2 text-center">
                <div className="text-xs text-blue-200/50 uppercase tracking-wider">{g.name}</div>
                <div className="text-sm font-bold text-white mt-0.5">{pct(g.value)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex px-3 overflow-x-auto">
          {views.map(v => (
            <button key={v.id} onClick={() => { setView(v.id); setSelected(null); }}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                view === v.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto p-4">

        {/* ===== OVERVIEW ===== */}
        {view === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total Equities", val: metrics.equityVal, sub: `${metrics.stockPct}% of invested`, c: "border-l-blue-500" },
                { label: "Total Bonds", val: metrics.bondVal, sub: `${metrics.bondPct}% of invested`, c: "border-l-emerald-500" },
                { label: "Cash / MM", val: metrics.cashVal, sub: pct(metrics.cashVal), c: "border-l-gray-400" },
                { label: "Individual Stocks", val: metrics.individualStocks, sub: pct(metrics.individualStocks), c: "border-l-indigo-500" },
              ].map((c, i) => (
                <div key={i} className={`bg-white rounded-xl p-4 border border-gray-200 border-l-4 ${c.c} shadow-sm`}>
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">{c.label}</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">{fmt(c.val)}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{c.sub}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Asset allocation pie */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <h3 className="font-bold text-gray-700 mb-2 text-sm uppercase tracking-wider">Asset Allocation</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={assetClassGroups.map(g => ({ name: g.name, value: g.value }))}
                      dataKey="value" cx="50%" cy="50%" innerRadius={60} outerRadius={105} label={PieLabel} labelLine={false}>
                      {assetClassGroups.map((_, i) => <Cell key={i} fill={PAL[i % PAL.length]} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Top consolidated holdings */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <h3 className="font-bold text-gray-700 mb-3 text-sm uppercase tracking-wider">Top 10 Consolidated Holdings</h3>
                <div className="space-y-2.5">
                  {holdingGroups.slice(0, 10).map((g, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-4 text-right font-mono">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-bold text-gray-800">{g.symbol}</span>
                            {g.accounts.length > 1 && <Badge className="bg-blue-50 text-blue-600">{g.accounts.length} accts</Badge>}
                          </div>
                          <div className="text-right flex-shrink-0 ml-2">
                            <span className="text-sm font-semibold text-gray-800">{fmt(g.value)}</span>
                            <span className="text-xs text-gray-400 ml-1.5">{pct(g.value)}</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full mt-1">
                          <div className="h-1.5 rounded-full transition-all" style={{
                            width: `${Math.min(g.value / total * 100 * 3.5, 100)}%`,
                            backgroundColor: PAL[i % PAL.length]
                          }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Stock/Bond and US/Intl splits */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <h3 className="font-bold text-gray-700 mb-3 text-sm uppercase tracking-wider">Stock / Bond Split</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={[
                      { name: `Stocks (${metrics.stockPct}%)`, value: metrics.equityVal },
                      { name: `Bonds (${metrics.bondPct}%)`, value: metrics.bondVal },
                      { name: `Cash (${pct(metrics.cashVal)})`, value: metrics.cashVal },
                    ]} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={70}>
                      <Cell fill="#2563eb" /><Cell fill="#059669" /><Cell fill="#94a3b8" />
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <h3 className="font-bold text-gray-700 mb-3 text-sm uppercase tracking-wider">US / International Equity</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={[
                      { name: `US (${metrics.usPct}%)`, value: metrics.usEq },
                      { name: `International (${metrics.intlPct}%)`, value: metrics.intlEq },
                    ]} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={70}>
                      <Cell fill="#2563eb" /><Cell fill="#0d9488" />
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ===== ASSET CLASS ===== */}
        {view === "asset_class" && (
          <div className="space-y-4">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="lg:w-72 flex-shrink-0">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={assetClassGroups.map(g => ({ name: g.name, value: g.value }))}
                      dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={95}
                      onClick={(_, i) => setSelected(selected === assetClassGroups[i]?.name ? null : assetClassGroups[i]?.name)}>
                      {assetClassGroups.map((g, i) => (
                        <Cell key={i} fill={PAL[i]} stroke={selected === g.name ? "#1e3a8a" : "#fff"} strokeWidth={selected === g.name ? 3 : 1} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {assetClassGroups.map(g => (
                  <CategoryCard key={g.name} label={g.name} value={g.value} total={total}
                    isActive={selected === g.name} onClick={() => setSelected(selected === g.name ? null : g.name)}
                    count={g.items.length} colorClass={getAssetClassColor(g.name)} />
                ))}
              </div>
            </div>
            {selected && assetClassGroups.find(g => g.name === selected) && (
              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="font-bold text-gray-800 text-lg">{selected}</h3>
                  <span className="text-sm text-gray-500">{fmt(assetClassGroups.find(g => g.name === selected).value)} ({pct(assetClassGroups.find(g => g.name === selected).value)})</span>
                  <button onClick={() => setSelected(null)} className="ml-auto text-xs text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded-md transition-colors">✕ Close</button>
                </div>
                <HoldingsTable data={assetClassGroups.find(g => g.name === selected).items} total={total} />
              </div>
            )}
          </div>
        )}

        {/* ===== ACCOUNT ===== */}
        {view === "account" && (
          <div className="space-y-4">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="lg:w-80 flex-shrink-0">
                <ResponsiveContainer width="100%" height={Math.max(accountGroups.length * 36, 200)}>
                  <BarChart data={accountGroups.map(g => ({ name: g.name, value: g.value }))} layout="vertical" margin={{ left: 10 }}>
                    <XAxis type="number" tickFormatter={v => v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : `$${(v/1e3).toFixed(0)}K`} fontSize={10} />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}
                      onClick={(d, i) => setSelected(selected === accountGroups[i]?.name ? null : accountGroups[i]?.name)}>
                      {accountGroups.map((g, i) => (
                        <Cell key={i} fill={PAL[i % PAL.length]} stroke={selected === g.name ? "#1e3a8a" : "none"} strokeWidth={2} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1.5 max-h-[500px] overflow-y-auto">
                {accountGroups.map((g, i) => (
                  <button key={g.name}
                    onClick={() => setSelected(selected === g.name ? null : g.name)}
                    className={`w-full text-left rounded-lg px-3 py-2.5 border transition-all flex items-center gap-3 ${
                      selected === g.name ? "border-blue-400 bg-blue-50 shadow-sm" : "border-gray-200 bg-white hover:border-gray-300"
                    }`}>
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PAL[i % PAL.length] }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-800 truncate">{g.name}</span>
                        <Badge className={getAccountTypeBadgeColor(g.account)}>{g.account}</Badge>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-semibold text-sm text-gray-800">{fmt(g.value)}</div>
                      <div className="text-xs text-gray-400">{pct(g.value)} · {g.items.length} items</div>
                    </div>
                    <span className="text-gray-300 text-xs">{selected === g.name ? "▼" : "▶"}</span>
                  </button>
                ))}
              </div>
            </div>
            {selected && accountGroups.find(g => g.name === selected) && (
              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="font-bold text-gray-800 text-lg">{selected}</h3>
                  <Badge className={getAccountTypeBadgeColor(accountGroups.find(g => g.name === selected).account)}>
                    {accountGroups.find(g => g.name === selected).account}
                  </Badge>
                  <span className="text-sm text-gray-500">{fmt(accountGroups.find(g => g.name === selected).value)}</span>
                  <button onClick={() => setSelected(null)} className="ml-auto text-xs text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded-md transition-colors">✕ Close</button>
                </div>
                <HoldingsTable data={accountGroups.find(g => g.name === selected).items} total={total} showAccount={false} showAssetClass={true} />
              </div>
            )}
          </div>
        )}

        {/* ===== HOLDING (consolidated) ===== */}
        {view === "holding" && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">Same symbols across all accounts are consolidated. Click any row to see the per-account breakdown.</p>
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="lg:w-80 flex-shrink-0">
                <ResponsiveContainer width="100%" height={Math.min(holdingGroups.length * 28, 400)}>
                  <BarChart data={holdingGroups.slice(0, 15).map(g => ({ name: g.symbol, value: g.value }))} layout="vertical" margin={{ left: 5 }}>
                    <XAxis type="number" tickFormatter={v => v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : `$${(v/1e3).toFixed(0)}K`} fontSize={10} />
                    <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 11, fontWeight: 600 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {holdingGroups.slice(0, 15).map((_, i) => <Cell key={i} fill={PAL[i % PAL.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1">
                <ConsolidatedTable groups={holdingGroups} total={total} selected={selected} onSelect={setSelected} />
              </div>
            </div>
            {selected && holdingGroups.find(g => g.symbol === selected) && (
              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-bold text-gray-800 text-lg">{selected}</h3>
                  <span className="text-sm text-gray-500">{holdingGroups.find(g => g.symbol === selected).desc}</span>
                  <button onClick={() => setSelected(null)} className="ml-auto text-xs text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded-md transition-colors">✕ Close</button>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Total: <strong>{fmt(holdingGroups.find(g => g.symbol === selected).value)}</strong> across{" "}
                  <strong>{holdingGroups.find(g => g.symbol === selected).accounts.length}</strong> account(s):{" "}
                  {holdingGroups.find(g => g.symbol === selected).accounts.join(", ")}
                </p>
                <HoldingsTable data={holdingGroups.find(g => g.symbol === selected).items} total={total} />
              </div>
            )}
          </div>
        )}

        {/* ===== STYLE ===== */}
        {view === "style" && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">Morningstar / Style Box classification. Click a style to drill down to individual holdings.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {styleGroups.map(g => (
                <CategoryCard key={g.name} label={g.name} value={g.value} total={total}
                  isActive={selected === g.name} onClick={() => setSelected(selected === g.name ? null : g.name)}
                  count={g.items.length} />
              ))}
            </div>
            {selected && styleGroups.find(g => g.name === selected) && (
              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="font-bold text-gray-800 text-lg">{selected}</h3>
                  <span className="text-sm text-gray-500">{fmt(styleGroups.find(g => g.name === selected).value)} ({pct(styleGroups.find(g => g.name === selected).value)})</span>
                  <button onClick={() => setSelected(null)} className="ml-auto text-xs text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded-md transition-colors">✕ Close</button>
                </div>
                <HoldingsTable data={styleGroups.find(g => g.name === selected).items} total={total} />
              </div>
            )}
          </div>
        )}

        {/* ===== ALL HOLDINGS (searchable) ===== */}
        {view === "all" && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <input
                  type="text" placeholder="Search symbol, name, account, asset class, type..."
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm"
                />
                <svg className="absolute left-3 top-3 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap">{filteredAll.length} of {holdings.length}</span>
            </div>
            <HoldingsTable data={filteredAll} total={total} showAssetClass={true} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="max-w-6xl mx-auto px-4 py-4 mt-6">
        <p className="text-xs text-gray-400 text-center">
          All data processed locally in your browser · For informational purposes only · Not financial advice
          <span className="mx-1">·</span>
          <a href="https://github.com/suhasjog/asset_allocation" target="_blank" rel="noopener noreferrer"
            className="text-gray-500 hover:text-blue-500 transition-colors underline underline-offset-2">
            Source on GitHub
          </a>
        </p>
      </div>
    </div>
  );
};

/* ───────── ROOT APP ───────── */
export default function App() {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!TRACKING_SCRIPT_URL || TRACKING_SCRIPT_URL.startsWith("PASTE_YOUR")) return;
    fetch("https://ipapi.co/json/")
      .then((r) => r.json())
      .then((geo) => {
        const params = new URLSearchParams({
          ip: geo.ip || "",
          city: geo.city || "",
          region: geo.region || "",
          country: geo.country_name || "",
          userAgent: navigator.userAgent,
          referrer: document.referrer,
          pageUrl: window.location.href,
        });
        new Image().src = `${TRACKING_SCRIPT_URL}?${params}`;
      })
      .catch(() => {});
  }, []);

  if (!data) return <UploadScreen onData={setData} />;
  return <Dashboard holdings={data.holdings} asOfDate={data.asOfDate} onReset={() => setData(null)} />;
}
