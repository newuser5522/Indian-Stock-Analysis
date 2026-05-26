"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Code2, Play, X, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import Link from "next/link";
import { apiUrl } from "@/lib/api-url";
import { formatChangePercent, changeBg, changeColor, formatVolume, displaySymbol } from "@/lib/format";
import { isFno } from "@/lib/fno-stocks";
import { Button } from "@/components/ui/button";

interface StockRow {
  symbol: string;
  name: string;
  sector: string;
  exchange: string;
  price: number | null;
  change_pct: number | null;
  volume: number | null;
  pe: number | null;
  forward_pe: number | null;
  pb: number | null;
  market_cap: number | null;
  eps: number | null;
  roe: number | null;
  div_yield: number | null;
  week52_high: number | null;
  week52_low: number | null;
}

// ── Query parser ─────────────────────────────────────────────────────────────
const FIELD_MAP: Record<string, keyof StockRow> = {
  price: "price", close: "price", ltp: "price",
  change: "change_pct", change_pct: "change_pct", chg: "change_pct",
  volume: "volume", vol: "volume",
  pe: "pe", p_e: "pe", trailing_pe: "pe",
  forward_pe: "forward_pe", fwd_pe: "forward_pe",
  pb: "pb", p_b: "pb", price_book: "pb",
  market_cap: "market_cap", mcap: "market_cap", cap: "market_cap",
  eps: "eps", earnings: "eps",
  roe: "roe", return_on_equity: "roe",
  div_yield: "div_yield", dividend: "div_yield", yield: "div_yield",
  week52_high: "week52_high", high52: "week52_high",
  week52_low: "week52_low", low52: "week52_low",
};

type Op = "<" | ">" | "<=" | ">=" | "=" | "==" | "!=" | "<>";
type Cond = { field: keyof StockRow; op: Op; value: number };

function parseQuery(query: string): { conditions: Cond[]; logic: "AND" | "OR"; error?: string } {
  const logic: "AND" | "OR" = /\bor\b/i.test(query) ? "OR" : "AND";
  const parts = query.split(/\b(?:and|or)\b/i).map(s => s.trim()).filter(Boolean);
  const conditions: Cond[] = [];

  for (const part of parts) {
    const m = part.match(/^(\w+)\s*(<=|>=|<>|!=|<|>|==|=)\s*(-?[\d.]+)$/i);
    if (!m) return { conditions: [], logic, error: `Cannot parse: "${part}"` };
    const rawField = m[1].toLowerCase();
    const field = FIELD_MAP[rawField];
    if (!field) return { conditions: [], logic, error: `Unknown field: "${m[1]}"` };
    const op = m[2] as Op;
    const value = parseFloat(m[3]);
    if (isNaN(value)) return { conditions: [], logic, error: `Invalid number: "${m[3]}"` };
    conditions.push({ field, op, value });
  }
  return { conditions, logic };
}

function evalCondition(row: StockRow, cond: Cond): boolean {
  const v = row[cond.field];
  if (v == null) return false;
  const n = v as number;
  switch (cond.op) {
    case "<": return n < cond.value;
    case ">": return n > cond.value;
    case "<=": return n <= cond.value;
    case ">=": return n >= cond.value;
    case "=": case "==": return Math.abs(n - cond.value) < 0.0001;
    case "!=": case "<>": return Math.abs(n - cond.value) >= 0.0001;
    default: return false;
  }
}

function applyQuery(stocks: StockRow[], query: string): { results: StockRow[]; error?: string } {
  if (!query.trim()) return { results: stocks };
  const { conditions, logic, error } = parseQuery(query);
  if (error) return { results: [], error };
  if (conditions.length === 0) return { results: stocks };
  const results = stocks.filter(row =>
    logic === "AND"
      ? conditions.every(c => evalCondition(row, c))
      : conditions.some(c => evalCondition(row, c))
  );
  return { results };
}

// ── Preset queries ────────────────────────────────────────────────────────────
const PRESETS = [
  { label: "Value Picks", query: "pe < 15 AND pb < 2 AND roe > 12", desc: "Low P/E, low P/B, decent ROE" },
  { label: "Growth Stocks", query: "roe > 20 AND pe < 40 AND market_cap > 5000", desc: "High ROE, reasonable P/E, mid-large cap" },
  { label: "Dividend Plays", query: "div_yield > 2 AND pe < 25 AND market_cap > 10000", desc: "High dividend yield, large cap" },
  { label: "Blue Chips", query: "market_cap > 50000 AND pe < 30", desc: "Large cap with reasonable valuation" },
  { label: "Small Cap Value", query: "market_cap < 5000 AND pe < 20 AND roe > 10", desc: "Small caps trading cheap" },
  { label: "52W Near High", query: "price > week52_high * 0.9", desc: "Within 10% of 52-week high" },
  { label: "Oversold", query: "change_pct < -3", desc: "Fell more than 3% today" },
  { label: "High Momentum", query: "change_pct > 2 AND volume > 500000", desc: "Up 2%+ with high volume" },
  { label: "Quality F&O Stocks", query: "pe < 30 AND roe > 15 AND market_cap > 20000", desc: "Well-valued F&O eligible stocks" },
];

const FIELD_DOCS = [
  { field: "price", alias: "close, ltp", desc: "Current market price (₹)" },
  { field: "change_pct", alias: "change, chg", desc: "Today's change (%)" },
  { field: "volume", alias: "vol", desc: "Today's volume (shares)" },
  { field: "pe", alias: "p_e, trailing_pe", desc: "Trailing P/E ratio" },
  { field: "forward_pe", alias: "fwd_pe", desc: "Forward P/E ratio" },
  { field: "pb", alias: "p_b, price_book", desc: "Price to Book ratio" },
  { field: "market_cap", alias: "mcap, cap", desc: "Market cap (₹ Crore)" },
  { field: "eps", alias: "earnings", desc: "Trailing EPS (₹)" },
  { field: "roe", alias: "return_on_equity", desc: "Return on Equity (%)" },
  { field: "div_yield", alias: "dividend, yield", desc: "Dividend yield (%)" },
  { field: "week52_high", alias: "high52", desc: "52-week high price (₹)" },
  { field: "week52_low", alias: "low52", desc: "52-week low price (₹)" },
];

type SortKey = keyof StockRow;

export default function QueryPage() {
  const [query, setQuery] = useState("");
  const [runQuery, setRunQuery] = useState("");
  const [showDocs, setShowDocs] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("market_cap");
  const [sortAsc, setSortAsc] = useState(false);

  const { data: stocks = [], isLoading } = useQuery<StockRow[]>({
    queryKey: ["screener", "advanced"],
    queryFn: () => fetch(apiUrl("/screener/advanced")).then(r => r.json()),
    staleTime: 3 * 60 * 1000,
  });

  const { results, error } = useMemo(() => {
    if (!stocks.length) return { results: [], error: undefined };
    const filtered = applyQuery(stocks, runQuery);
    const sorted = [...filtered.results].sort((a, b) => {
      const av = (a[sortKey] as number | null) ?? (sortAsc ? Infinity : -Infinity);
      const bv = (b[sortKey] as number | null) ?? (sortAsc ? Infinity : -Infinity);
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return { results: sorted, error: filtered.error };
  }, [stocks, runQuery, sortKey, sortAsc]);

  const handleRun = () => setRunQuery(query);
  const handlePreset = (q: string) => { setQuery(q); setRunQuery(q); };
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(false); }
  };
  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (sortAsc ? <ChevronUp className="h-3 w-3 inline ml-0.5" /> : <ChevronDown className="h-3 w-3 inline ml-0.5" />) : null;

  function fmt(n: number | null | undefined, d = 2) {
    if (n == null) return "—";
    return n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  return (
    <div className="space-y-5 max-w-screen-xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Code2 className="h-5 w-5 text-primary" />
          Query Screener
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Write formula queries like screener.in — filter 109+ NSE stocks by any metric
        </p>
      </div>

      {/* Query input */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
          <span className="text-primary">›</span>
          <span>Fields: pe, pb, roe, price, change_pct, volume, market_cap, eps, div_yield, forward_pe, week52_high, week52_low</span>
        </div>
        <div className="flex gap-2">
          <textarea
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleRun(); }}
            rows={2}
            placeholder="e.g.  pe < 20 AND roe > 15 AND market_cap > 10000"
            className="flex-1 font-mono text-sm rounded-md border border-input bg-transparent px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring resize-none placeholder:text-muted-foreground/40"
          />
          <div className="flex flex-col gap-1.5">
            <Button size="sm" onClick={handleRun} disabled={isLoading}>
              <Play className="h-3.5 w-3.5" />
              Run
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setQuery(""); setRunQuery(""); }}>
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        </div>
        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2 font-mono">
            ⚠ {error}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground">
          Operators: <code className="bg-secondary/60 px-1 rounded">&lt; &gt; &lt;= &gt;= = !=</code> · Logic: <code className="bg-secondary/60 px-1 rounded">AND</code> / <code className="bg-secondary/60 px-1 rounded">OR</code> · Press <kbd className="bg-secondary/60 px-1 rounded">Ctrl+Enter</kbd> to run
        </p>
      </div>

      {/* Presets */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Preset Queries</div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => handlePreset(p.query)}
              title={p.desc}
              className="rounded-full px-3 py-1.5 text-xs font-medium bg-secondary/40 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors border border-transparent hover:border-primary/20"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Field reference toggle */}
      <button
        onClick={() => setShowDocs(v => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
      >
        {showDocs ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {showDocs ? "Hide" : "Show"} field reference
      </button>
      {showDocs && (
        <div className="rounded-lg border bg-card p-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left pb-2 text-muted-foreground font-semibold">Field</th>
                <th className="text-left pb-2 text-muted-foreground font-semibold">Aliases</th>
                <th className="text-left pb-2 text-muted-foreground font-semibold">Description</th>
              </tr>
            </thead>
            <tbody>
              {FIELD_DOCS.map(f => (
                <tr key={f.field} className="border-b border-border/40 hover:bg-accent/20">
                  <td className="py-1.5 pr-4 font-mono font-bold text-primary">{f.field}</td>
                  <td className="py-1.5 pr-4 font-mono text-muted-foreground">{f.alias}</td>
                  <td className="py-1.5 text-muted-foreground">{f.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Results */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-3">
          <span className="font-semibold text-sm">
            {isLoading ? "Loading dataset…" : runQuery ? `${results.length} stocks match` : `${stocks.length} stocks loaded`}
          </span>
          {runQuery && (
            <span className="font-mono text-xs bg-secondary/60 px-2 py-0.5 rounded text-muted-foreground truncate max-w-xs">
              {runQuery}
            </span>
          )}
        </div>
        {isLoading ? (
          <div className="divide-y">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="px-4 py-3 flex gap-4">
                <div className="h-4 w-24 bg-accent/40 animate-pulse rounded" />
                <div className="ml-auto h-4 w-48 bg-accent/40 animate-pulse rounded" />
              </div>
            ))}
          </div>
        ) : (results.length === 0 && runQuery) ? (
          <div className="py-16 text-center">
            <Code2 className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No stocks match your query</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Try relaxing the conditions</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  {[
                    { key: "symbol" as SortKey, label: "Stock" },
                    { key: "sector" as SortKey, label: "Sector" },
                    { key: "price" as SortKey, label: "Price" },
                    { key: "change_pct" as SortKey, label: "Chg%" },
                    { key: "market_cap" as SortKey, label: "MCap (Cr)" },
                    { key: "pe" as SortKey, label: "P/E" },
                    { key: "pb" as SortKey, label: "P/B" },
                    { key: "roe" as SortKey, label: "ROE%" },
                    { key: "eps" as SortKey, label: "EPS" },
                    { key: "div_yield" as SortKey, label: "Div%" },
                    { key: "volume" as SortKey, label: "Volume" },
                  ].map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-foreground select-none transition-colors text-right first:text-left"
                    >
                      {col.label}<SortIcon k={col.key} />
                    </th>
                  ))}
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {results.slice(0, 100).map(s => (
                  <tr key={s.symbol} className="border-b hover:bg-accent/30 transition-colors">
                    <td className="px-3 py-2.5">
                      <Link href={`/stock/${encodeURIComponent(s.symbol)}`} className="group">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold group-hover:text-primary transition-colors text-xs">{displaySymbol(s.symbol)}</span>
                          {isFno(s.symbol) && (
                            <span className="text-[8px] font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 rounded px-1 py-0.5 leading-none">F&O</span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">{s.name}</div>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="rounded bg-secondary/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">{s.sector}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-xs">
                      {s.price != null ? `₹${fmt(s.price)}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${changeBg(s.change_pct)}`}>
                        {formatChangePercent(s.change_pct)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                      {s.market_cap != null ? fmt(s.market_cap, 0) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs">{fmt(s.pe)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs">{fmt(s.pb)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums text-xs font-medium ${changeColor(s.roe)}`}>{fmt(s.roe)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs">{fmt(s.eps)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                      {s.div_yield != null ? `${fmt(s.div_yield)}%` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">{formatVolume(s.volume)}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/stock/${encodeURIComponent(s.symbol)}`}>
                        <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-primary transition-colors" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {results.length > 100 && (
              <div className="px-4 py-3 text-center text-xs text-muted-foreground border-t">
                Showing 100 of {results.length} results — refine your query to narrow down
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
