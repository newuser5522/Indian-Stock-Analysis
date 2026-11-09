"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Code2,
  Play,
  X,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { apiUrl } from "@/lib/api-url";
import {
  formatChangePercent,
  changeBg,
  changeColor,
  formatVolume,
  displaySymbol,
} from "@/lib/format";
import { isFno } from "@/lib/fno-stocks";
import { applyQuery, PRESETS, type StockRow } from "@/lib/query-parser";
import { Button } from "@/components/ui/button";

// ── Preset queries ────────────────────────────────────────────────────────────
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

  const {
    data: stocks = [],
    isLoading,
    isError: isDataError,
    refetch,
  } = useQuery<StockRow[]>({
    queryKey: ["screener", "advanced"],
    queryFn: async () => {
      const response = await fetch(apiUrl("/screener/advanced"));
      if (!response.ok)
        throw new Error(
          `Screener data request failed (HTTP ${response.status})`,
        );
      const data: unknown = await response.json();
      if (!Array.isArray(data))
        throw new Error("Screener API returned invalid data");
      return data as StockRow[];
    },
    staleTime: 3 * 60 * 1000,
  });

  const { results, error } = useMemo(() => {
    if (!stocks.length) return { results: [], error: undefined };
    const filtered = applyQuery(stocks, runQuery);
    const sorted = [...filtered.results].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null || (typeof av === "number" && !Number.isFinite(av))) {
        return bv == null || (typeof bv === "number" && !Number.isFinite(bv))
          ? 0
          : 1;
      }
      if (bv == null || (typeof bv === "number" && !Number.isFinite(bv))) return -1;
      const comparison =
        typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv)
          : Number(av) - Number(bv);
      return sortAsc ? comparison : -comparison;
    });
    return { results: sorted, error: filtered.error };
  }, [stocks, runQuery, sortKey, sortAsc]);

  const handleRun = () => setRunQuery(query);
  const handlePreset = (q: string) => {
    setQuery(q);
    setRunQuery(q);
  };
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };
  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (
      sortAsc ? (
        <ChevronUp className="h-3 w-3 inline ml-0.5" />
      ) : (
        <ChevronDown className="h-3 w-3 inline ml-0.5" />
      )
    ) : null;

  function fmt(n: number | null | undefined, d = 2) {
    if (n == null) return "—";
    return n.toLocaleString("en-IN", {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
  }

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Code2 className="h-5 w-5 text-primary" />
          Query Screener
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Write formula queries like screener.in — filter 109+ NSE stocks by any
          metric
        </p>
      </div>

      {/* Query input */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
          <span className="text-primary">›</span>
          <span>
            Fields: pe, pb, roe, price, change_pct, volume, market_cap, eps,
            div_yield, forward_pe, week52_high, week52_low
          </span>
        </div>
        <div className="flex gap-2">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleRun();
            }}
            rows={2}
            placeholder="e.g.  pe < 20 AND roe > 15 AND market_cap > 10000"
            className="flex-1 font-mono text-sm rounded-md border border-input bg-transparent px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring resize-none placeholder:text-muted-foreground/40"
          />
          <div className="flex flex-col gap-1.5">
            <Button size="sm" onClick={handleRun} disabled={isLoading}>
              <Play className="h-3.5 w-3.5" />
              Run
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setQuery("");
                setRunQuery("");
              }}
            >
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
          Operators:{" "}
          <code className="bg-secondary/60 px-1 rounded">
            &lt; &gt; &lt;= &gt;= = !=
          </code>{" "}
          · Logic: <code className="bg-secondary/60 px-1 rounded">AND</code> /{" "}
          <code className="bg-secondary/60 px-1 rounded">OR</code> · Press{" "}
          <kbd className="bg-secondary/60 px-1 rounded">Ctrl+Enter</kbd> to run
        </p>
      </div>

      {/* Presets */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Preset Queries
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
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
        onClick={() => setShowDocs((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
      >
        {showDocs ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
        {showDocs ? "Hide" : "Show"} field reference
      </button>
      {showDocs && (
        <div className="rounded-lg border bg-card p-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left pb-2 text-muted-foreground font-semibold">
                  Field
                </th>
                <th className="text-left pb-2 text-muted-foreground font-semibold">
                  Aliases
                </th>
                <th className="text-left pb-2 text-muted-foreground font-semibold">
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {FIELD_DOCS.map((f) => (
                <tr
                  key={f.field}
                  className="border-b border-border/40 hover:bg-accent/20"
                >
                  <td className="py-1.5 pr-4 font-mono font-bold text-primary">
                    {f.field}
                  </td>
                  <td className="py-1.5 pr-4 font-mono text-muted-foreground">
                    {f.alias}
                  </td>
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
            {isLoading
              ? "Loading dataset…"
              : isDataError
                ? "Dataset unavailable"
                : runQuery
                  ? `${results.length} stocks match`
                  : `${stocks.length} stocks loaded`}
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
        ) : isDataError ? (
          <div role="alert" className="py-16 text-center">
            <p className="text-amber-500 font-medium">
              Screener data is unavailable.
            </p>
            <Button
              className="mt-3"
              variant="outline"
              size="sm"
              onClick={() => refetch()}
            >
              Retry
            </Button>
          </div>
        ) : results.length === 0 && runQuery ? (
          <div className="py-16 text-center">
            <Code2 className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">
              No stocks match your query
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Try relaxing the conditions
            </p>
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
                  ].map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-foreground select-none transition-colors text-right first:text-left"
                    >
                      {col.label}
                      <SortIcon k={col.key} />
                    </th>
                  ))}
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {results.slice(0, 100).map((s) => (
                  <tr
                    key={s.symbol}
                    className="border-b hover:bg-accent/30 transition-colors"
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/stock/${encodeURIComponent(s.symbol)}`}
                        className="group"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold group-hover:text-primary transition-colors text-xs">
                            {displaySymbol(s.symbol)}
                          </span>
                          {isFno(s.symbol) && (
                            <span className="text-[8px] font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 rounded px-1 py-0.5 leading-none">
                              F&O
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate max-w-30">
                          {s.name}
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="rounded bg-secondary/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {s.sector}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-xs">
                      {s.price != null ? `₹${fmt(s.price)}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span
                        className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${changeBg(s.change_pct)}`}
                      >
                        {formatChangePercent(s.change_pct)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                      {s.market_cap != null ? fmt(s.market_cap, 0) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                      {fmt(s.pe)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                      {fmt(s.pb)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right tabular-nums text-xs font-medium ${changeColor(s.roe)}`}
                    >
                      {fmt(s.roe)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                      {fmt(s.eps)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                      {s.div_yield != null ? `${fmt(s.div_yield)}%` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                      {formatVolume(s.volume)}
                    </td>
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
                Showing 100 of {results.length} results — refine your query to
                narrow down
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
