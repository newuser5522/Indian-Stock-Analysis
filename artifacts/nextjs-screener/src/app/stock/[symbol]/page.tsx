"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import {
  ComposedChart, LineChart, Line, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea, Legend,
} from "recharts";
import { ArrowLeft, Star, StarOff, TrendingUp, TrendingDown, ExternalLink, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api-url";
import {
  formatPrice, formatChangePercent, formatMarketCap, formatPercent,
  formatRatio, formatVolume, changeColor, changeBg, displaySymbol,
} from "@/lib/format";
import { toast } from "sonner";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface Quote {
  symbol: string; shortName?: string; longName?: string;
  regularMarketPrice?: number; regularMarketChange?: number; regularMarketChangePercent?: number;
  regularMarketOpen?: number; regularMarketDayHigh?: number; regularMarketDayLow?: number;
  regularMarketPreviousClose?: number; regularMarketVolume?: number; marketCap?: number;
  fiftyTwoWeekHigh?: number; fiftyTwoWeekLow?: number; exchange?: string;
}
interface Fundamental {
  trailingPE?: number; forwardPE?: number; priceToBook?: number; trailingEps?: number;
  forwardEps?: number; dividendYield?: number; dividendRate?: number; beta?: number;
  returnOnEquity?: number; returnOnAssets?: number; grossMargins?: number;
  operatingMargins?: number; profitMargins?: number; currentRatio?: number;
  debtToEquity?: number; revenueGrowth?: number; totalRevenue?: number; freeCashflow?: number;
  targetMeanPrice?: number; recommendationKey?: string; sector?: string; industry?: string;
  longBusinessSummary?: string; pegRatio?: number;
}
interface HistoryPoint { timestamp: number; open: number; high: number; low: number; close: number; volume: number }
interface HistoryRow {
  date: string; timestamp: number; open: number; high: number; low: number; close: number;
  volume: number; change1d: number; change5d: number | null; change22d: number | null; change66d: number | null; rsi: number | null;
}
interface NewsItem { uuid: string; title: string; publisher: string; link: string; providerPublishTime: number; relatedTickers?: string[] }
interface WatchlistItem { symbol: string }

/* ─── Constants ─────────────────────────────────────────────────────────── */
const PERIODS = [
  { label: "5D", value: "5d", interval: "15m" },
  { label: "1M", value: "1mo", interval: "1d" },
  { label: "3M", value: "3mo", interval: "1d" },
  { label: "6M", value: "6mo", interval: "1d" },
  { label: "1Y", value: "1y", interval: "1d" },
  { label: "5Y", value: "5y", interval: "1wk" },
];
const TABS = ["Price Chart", "Volume & Delivery", "Price History"] as const;
type StockTab = (typeof TABS)[number];

/* ─── RSI computation ───────────────────────────────────────────────────── */
function computeRSI(closes: number[], period = 14): (number | null)[] {
  const rsi: (number | null)[] = new Array(period).fill(null);
  if (closes.length <= period) return rsi;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return rsi;
}

/* ─── Small helpers ─────────────────────────────────────────────────────── */
function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold tabular-nums">{value}</span>
    </div>
  );
}
function FundCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/40 border border-border/50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="font-bold text-sm">{value}</div>
    </div>
  );
}

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(222,47%,10%)",
  border: "1px solid hsl(217,33%,17%)",
  borderRadius: 6, fontSize: 11, color: "hsl(213,31%,91%)",
};

function timeAgo(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function pctCell(v: number | null): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

/* ─── RSI chart with coloured bands ─────────────────────────────────────── */
function RSIChart({ data }: { data: { date: string; rsi: number | null }[] }) {
  // Build 3 series for coloured line segments
  const processed = data.map((d, i) => {
    const r = d.rsi;
    const prev = i > 0 ? data[i - 1].rsi : null;
    const next = i < data.length - 1 ? data[i + 1].rsi : null;
    return {
      ...d,
      // Overlap by 1 point at each boundary to prevent gaps
      rsiRed: r != null && (r > 70 || (prev != null && prev > 70) || (next != null && next > 70)) ? r : null,
      rsiGreen: r != null && (r < 30 || (prev != null && prev < 30) || (next != null && next < 30)) ? r : null,
      rsiYellow: r != null ? r : null,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={130}>
      <LineChart data={processed} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        {/* Coloured zone fills */}
        <ReferenceArea y1={70} y2={100} fill="#ef4444" fillOpacity={0.06} />
        <ReferenceArea y1={40} y2={60} fill="#22d3ee" fillOpacity={0.06} />
        <ReferenceArea y1={0} y2={30} fill="#22c55e" fillOpacity={0.06} />
        {/* Reference lines */}
        <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.7} strokeWidth={1} />
        <ReferenceLine y={60} stroke="hsl(217,33%,30%)" strokeDasharray="2 4" strokeOpacity={0.5} strokeWidth={1} />
        <ReferenceLine y={50} stroke="hsl(217,33%,28%)" strokeDasharray="2 4" strokeOpacity={0.5} strokeWidth={1} />
        <ReferenceLine y={40} stroke="hsl(217,33%,30%)" strokeDasharray="2 4" strokeOpacity={0.5} strokeWidth={1} />
        <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.7} strokeWidth={1} />
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(215,20%,55%)" }} interval="preserveStartEnd" tickLine={false} axisLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "hsl(215,20%,55%)" }} tickLine={false} axisLine={false}
          ticks={[0, 30, 40, 50, 60, 70, 100]} width={26} />
        <Tooltip contentStyle={TOOLTIP_STYLE}
          formatter={(v: number | null, name: string) => {
            if (v == null) return [null, null];
            const label = name === "rsiRed" ? "RSI (OB)" : name === "rsiGreen" ? "RSI (OS)" : "RSI";
            return [v.toFixed(1), label];
          }} />
        {/* Base yellow line (neutral) */}
        <Line type="monotone" dataKey="rsiYellow" stroke="#f59e0b" strokeWidth={1.5} dot={false} connectNulls name="RSI" />
        {/* Red overlay for overbought */}
        <Line type="monotone" dataKey="rsiRed" stroke="#ef4444" strokeWidth={2.5} dot={false} connectNulls={false} name="rsiRed" legendType="none" />
        {/* Green overlay for oversold */}
        <Line type="monotone" dataKey="rsiGreen" stroke="#22c55e" strokeWidth={2.5} dot={false} connectNulls={false} name="rsiGreen" legendType="none" />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ─── Main page ─────────────────────────────────────────────────────────── */
export default function StockPage() {
  const params = useParams<{ symbol: string }>();
  const rawSymbol = decodeURIComponent(params.symbol ?? "");
  const [period, setPeriod] = useState(PERIODS[1]);
  const [activeTab, setActiveTab] = useState<StockTab>("Price Chart");
  const queryClient = useQueryClient();

  const { data: quote, isLoading: quoteLoading } = useQuery<Quote>({
    queryKey: ["stock", "quote", rawSymbol],
    queryFn: () => fetch(apiUrl(`/stocks/quote/${encodeURIComponent(rawSymbol)}`)).then(r => r.json()),
    enabled: !!rawSymbol,
    refetchInterval: 30_000,
  });
  const { data: fundamentals } = useQuery<Fundamental>({
    queryKey: ["stock", "fundamentals", rawSymbol],
    queryFn: () => fetch(apiUrl(`/stocks/fundamentals/${encodeURIComponent(rawSymbol)}`)).then(r => r.json()),
    enabled: !!rawSymbol,
  });
  const { data: history, isLoading: historyLoading } = useQuery<HistoryPoint[]>({
    queryKey: ["stock", "history", rawSymbol, period.value],
    queryFn: () =>
      fetch(apiUrl(`/stocks/history/${encodeURIComponent(rawSymbol)}?period=${period.value}&interval=${period.interval}`)).then(r => r.json()),
    enabled: !!rawSymbol,
  });
  const { data: historyTable = [], isLoading: tableLoading } = useQuery<HistoryRow[]>({
    queryKey: ["stock", "history-table", rawSymbol],
    queryFn: () => fetch(apiUrl(`/stocks/history-table/${encodeURIComponent(rawSymbol)}`)).then(r => r.json()),
    enabled: !!rawSymbol && activeTab === "Price History",
    staleTime: 10 * 60 * 1000,
  });
  const { data: stockNews = [], isLoading: newsLoading } = useQuery<NewsItem[]>({
    queryKey: ["stock", "news", rawSymbol],
    queryFn: () => fetch(apiUrl(`/stocks/news/${encodeURIComponent(rawSymbol)}`)).then(r => r.json()),
    enabled: !!rawSymbol,
    staleTime: 5 * 60 * 1000,
  });
  const { data: watchlist } = useQuery<WatchlistItem[]>({
    queryKey: ["watchlist"],
    queryFn: () => fetch(apiUrl("/watchlist")).then(r => r.json()),
  });

  const isWatched = (watchlist ?? []).some(w => w.symbol === rawSymbol);
  const addMutation = useMutation({
    mutationFn: () => fetch(apiUrl("/watchlist"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: rawSymbol }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["watchlist"] }); toast.success("Added to watchlist"); },
  });
  const removeMutation = useMutation({
    mutationFn: () => fetch(apiUrl(`/watchlist/${encodeURIComponent(rawSymbol)}`), { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["watchlist"] }); toast.success("Removed"); },
  });

  /* Chart data */
  const closes = (history ?? []).map(h => h.close);
  const rsiArr = computeRSI(closes);
  const chartData = (history ?? []).map((h, i) => ({
    date: new Date(h.timestamp * 1000).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
    close: h.close,
    volume: h.volume,
    rsi: rsiArr[i] ?? null,
  }));

  const chg = quote?.regularMarketChangePercent ?? 0;
  const lineColor = chg >= 0 ? "#22c55e" : "#ef4444";
  const isPos = chg >= 0;

  /* 52W range pct */
  const low52 = quote?.fiftyTwoWeekLow ?? 0;
  const high52 = quote?.fiftyTwoWeekHigh ?? 0;
  const price = quote?.regularMarketPrice ?? 0;
  const rangePct = high52 > low52 ? ((price - low52) / (high52 - low52)) * 100 : 50;

  return (
    <div className="space-y-5 max-w-screen-xl">
      {/* Back */}
      <Link href="/screener" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" />Back to Screener
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">{displaySymbol(rawSymbol)}</h1>
            {quote?.shortName && <span className="text-base font-normal text-muted-foreground">{quote.shortName}</span>}
            {fundamentals?.sector && (
              <span className="rounded-full bg-primary/10 text-primary text-xs font-semibold px-2.5 py-0.5">{fundamentals.sector}</span>
            )}
          </div>
          {fundamentals?.industry && <p className="text-xs text-muted-foreground mt-1">{fundamentals.industry}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm"
            onClick={() => (isWatched ? removeMutation.mutate() : addMutation.mutate())}
            disabled={addMutation.isPending || removeMutation.isPending}
            className={isWatched ? "border-primary/30 text-primary" : ""}>
            {isWatched ? <StarOff className="h-4 w-4" /> : <Star className="h-4 w-4" />}
            {isWatched ? "Unwatch" : "Watchlist"}
          </Button>
        </div>
      </div>

      {/* Price + stats */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-lg border bg-card p-5">
          {quoteLoading ? (
            <div className="h-24 animate-pulse bg-accent/40 rounded-lg" />
          ) : (
            <>
              <div className="text-4xl font-bold tabular-nums">{formatPrice(quote?.regularMarketPrice)}</div>
              <div className={`mt-2 flex items-center gap-2 text-lg font-semibold ${changeColor(chg)}`}>
                {isPos ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                <span className="tabular-nums">{chg >= 0 ? "+" : ""}{(quote?.regularMarketChange ?? 0).toFixed(2)}</span>
                <span className={`text-sm rounded-full px-2 py-0.5 ${changeBg(chg)}`}>{formatChangePercent(chg)}</span>
              </div>
              {/* 52W range bar */}
              {high52 > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                    <span>52W Low: {formatPrice(low52)}</span>
                    <span>52W High: {formatPrice(high52)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(2, Math.min(100, rangePct))}%` }} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Today's Stats</h3>
          <StatRow label="Open" value={formatPrice(quote?.regularMarketOpen)} />
          <StatRow label="Prev Close" value={formatPrice(quote?.regularMarketPreviousClose)} />
          <StatRow label="High" value={formatPrice(quote?.regularMarketDayHigh)} />
          <StatRow label="Low" value={formatPrice(quote?.regularMarketDayLow)} />
          <StatRow label="Volume" value={formatVolume(quote?.regularMarketVolume)} />
          <StatRow label="Market Cap" value={quote?.marketCap ? formatMarketCap(quote.marketCap / 1e7) : "—"} />
        </div>
      </div>

      {/* Chart tabs */}
      <div className="flex gap-0.5 border-b border-border">
        {TABS.map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>{t}</button>
        ))}
      </div>

      {/* Price Chart tab */}
      {activeTab === "Price Chart" && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="font-semibold text-sm">{displaySymbol(rawSymbol)} — PRICE</h2>
              <div className="flex gap-1">
                {PERIODS.map(p => (
                  <button key={p.value} onClick={() => setPeriod(p)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      period.value === p.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}>{p.label}</button>
                ))}
              </div>
            </div>
            {historyLoading ? (
              <div className="h-52 animate-pulse bg-accent/40 rounded-lg" />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(215,20%,55%)" }} interval="preserveStartEnd" tickLine={false} axisLine={false} />
                  <YAxis yAxisId="price" domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "hsl(215,20%,55%)" }} tickLine={false} axisLine={false}
                    tickFormatter={(v: number) => `₹${v.toFixed(0)}`} width={62} />
                  <YAxis yAxisId="volume" orientation="right" tick={{ fontSize: 9, fill: "hsl(215,20%,55%)" }} tickLine={false} axisLine={false}
                    tickFormatter={(v: number) => formatVolume(v)} width={45} />
                  <Tooltip contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number, name: string) => name === "volume" ? [formatVolume(v), "Volume"] : [`₹${v.toFixed(2)}`, "Price"]} />
                  <Bar yAxisId="volume" dataKey="volume" fill={lineColor} opacity={0.25} radius={[1, 1, 0, 0]} maxBarSize={8} />
                  <Line yAxisId="price" type="monotone" dataKey="close" stroke={lineColor} strokeWidth={2} dot={false} activeDot={{ r: 3, fill: lineColor }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* RSI chart */}
          {!historyLoading && chartData.length > 14 && (
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold text-sm">RSI (14)</h2>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Above 70: Overbought</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Below 30: Oversold</span>
                </div>
              </div>
              <RSIChart data={chartData} />
            </div>
          )}
        </div>
      )}

      {/* Volume & Delivery tab */}
      {activeTab === "Volume & Delivery" && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="font-semibold text-sm">{displaySymbol(rawSymbol)} — 70-DAY VOLUME ANALYSIS</h2>
            <div className="flex gap-1">
              {PERIODS.filter(p => ["1M","3M","6M"].includes(p.label)).map(p => (
                <button key={p.value} onClick={() => setPeriod(p)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    period.value === p.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}>{p.label}</button>
              ))}
            </div>
          </div>
          {historyLoading ? (
            <div className="h-64 animate-pulse bg-accent/40 rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(215,20%,55%)" }} interval="preserveStartEnd" tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(215,20%,55%)" }} tickLine={false} axisLine={false}
                  tickFormatter={(v: number) => formatVolume(v)} width={50} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, name: string) => [
                  name === "close" ? `₹${v.toFixed(2)}` : formatVolume(v),
                  name === "close" ? "Price" : "Volume"
                ]} />
                <Bar dataKey="volume" fill="#22d3ee" opacity={0.5} radius={[2, 2, 0, 0]} name="Volume" />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Price History tab */}
      {activeTab === "Price History" && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <span className="font-semibold text-sm">Historical Data</span>
            <span className="text-xs text-muted-foreground">{historyTable.length} days · Date | Open | High | Low | Close | 1D% | 5D% | 22D% | 66D% | RSI | Volume</span>
          </div>
          {tableLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading historical data…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {["Date","Open","High","Low","Close","1D%","5D%","22D%","66D%","RSI","Volume"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historyTable.slice(0, 80).map(row => {
                    const rsiColor = row.rsi == null ? "" : row.rsi > 70 ? "text-red-500" : row.rsi < 30 ? "text-green-500" : "text-amber-400";
                    return (
                      <tr key={row.timestamp} className="border-b hover:bg-accent/30 transition-colors">
                        <td className="px-3 py-2 font-medium tabular-nums">{row.date}</td>
                        <td className="px-3 py-2 tabular-nums">₹{row.open.toFixed(2)}</td>
                        <td className="px-3 py-2 tabular-nums">₹{row.high.toFixed(2)}</td>
                        <td className="px-3 py-2 tabular-nums">₹{row.low.toFixed(2)}</td>
                        <td className="px-3 py-2 tabular-nums font-semibold">₹{row.close.toFixed(2)}</td>
                        <td className={`px-3 py-2 tabular-nums ${changeColor(row.change1d)}`}>{pctCell(row.change1d)}</td>
                        <td className={`px-3 py-2 tabular-nums ${changeColor(row.change5d)}`}>{pctCell(row.change5d)}</td>
                        <td className={`px-3 py-2 tabular-nums ${changeColor(row.change22d)}`}>{pctCell(row.change22d)}</td>
                        <td className={`px-3 py-2 tabular-nums ${changeColor(row.change66d)}`}>{pctCell(row.change66d)}</td>
                        <td className={`px-3 py-2 tabular-nums font-semibold ${rsiColor}`}>{row.rsi != null ? row.rsi.toFixed(0) : "—"}</td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{formatVolume(row.volume)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Fundamentals */}
      {fundamentals && (
        <div className="space-y-4">
          <h2 className="font-semibold">Fundamentals</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <FundCard label="P/E (TTM)" value={formatRatio(fundamentals.trailingPE)} />
            <FundCard label="P/E (Fwd)" value={formatRatio(fundamentals.forwardPE)} />
            <FundCard label="PEG Ratio" value={formatRatio(fundamentals.pegRatio)} />
            <FundCard label="Price / Book" value={formatRatio(fundamentals.priceToBook)} />
            <FundCard label="EPS (TTM)" value={formatRatio(fundamentals.trailingEps)} />
            <FundCard label="EPS (Fwd)" value={formatRatio(fundamentals.forwardEps)} />
            <FundCard label="Beta" value={formatRatio(fundamentals.beta)} />
            <FundCard label="Div Yield" value={fundamentals.dividendYield != null ? formatPercent(fundamentals.dividendYield * 100) : "—"} />
            <FundCard label="ROE" value={fundamentals.returnOnEquity != null ? formatPercent(fundamentals.returnOnEquity * 100) : "—"} />
            <FundCard label="ROA" value={fundamentals.returnOnAssets != null ? formatPercent(fundamentals.returnOnAssets * 100) : "—"} />
            <FundCard label="Gross Margin" value={fundamentals.grossMargins != null ? formatPercent(fundamentals.grossMargins * 100) : "—"} />
            <FundCard label="Net Margin" value={fundamentals.profitMargins != null ? formatPercent(fundamentals.profitMargins * 100) : "—"} />
            <FundCard label="Current Ratio" value={formatRatio(fundamentals.currentRatio)} />
            <FundCard label="Debt / Equity" value={fundamentals.debtToEquity != null ? formatRatio(fundamentals.debtToEquity / 100) : "—"} />
            <FundCard label="Rev Growth" value={fundamentals.revenueGrowth != null ? formatPercent(fundamentals.revenueGrowth * 100) : "—"} />
          </div>

          {fundamentals.recommendationKey && (
            <div className="rounded-lg border bg-card p-4 flex items-center gap-4 flex-wrap">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Analyst Consensus</p>
                <span className={`rounded-full px-3 py-1 text-sm font-bold uppercase tracking-wide ${
                  fundamentals.recommendationKey === "buy" || fundamentals.recommendationKey === "strong_buy" ? "bg-green-500/10 text-green-500"
                  : fundamentals.recommendationKey === "sell" || fundamentals.recommendationKey === "strong_sell" ? "bg-red-500/10 text-red-500"
                  : "bg-secondary text-muted-foreground"
                }`}>{fundamentals.recommendationKey.replace(/_/g, " ")}</span>
              </div>
              {fundamentals.targetMeanPrice != null && (
                <div className="border-l pl-4">
                  <p className="text-xs text-muted-foreground mb-1">Price Target</p>
                  <p className="font-bold">{formatPrice(fundamentals.targetMeanPrice)}</p>
                </div>
              )}
            </div>
          )}

          {fundamentals.longBusinessSummary && (
            <div className="rounded-lg border bg-card p-4">
              <h3 className="font-semibold text-sm mb-2">About</h3>
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-6">{fundamentals.longBusinessSummary}</p>
            </div>
          )}
        </div>
      )}

      {/* Stock-specific news */}
      <div className="space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          Latest News for {displaySymbol(rawSymbol)}
        </h2>
        <div className="rounded-lg border bg-card divide-y overflow-hidden">
          {newsLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading news…</div>
          ) : stockNews.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">No news found</div>
          ) : (
            stockNews.slice(0, 10).map(item => (
              <div key={item.uuid} className="p-3 hover:bg-accent/20 transition-colors flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="h-2.5 w-2.5" />{timeAgo(item.providerPublishTime)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">· {item.publisher}</span>
                  </div>
                  <p className="text-sm leading-snug font-medium">{item.title}</p>
                </div>
                <a href={item.link} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 p-1.5 rounded-md hover:bg-accent/60 text-muted-foreground hover:text-primary transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
