"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { ArrowLeft, Star, StarOff, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api-url";
import {
  formatPrice,
  formatChangePercent,
  formatMarketCap,
  formatPercent,
  formatRatio,
  formatVolume,
  changeColor,
  changeBg,
  displaySymbol,
} from "@/lib/format";
import { toast } from "sonner";

interface Quote {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketPreviousClose?: number;
  regularMarketVolume?: number;
  marketCap?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  exchange?: string;
}

interface Fundamental {
  trailingPE?: number;
  forwardPE?: number;
  priceToBook?: number;
  trailingEps?: number;
  forwardEps?: number;
  dividendYield?: number;
  dividendRate?: number;
  beta?: number;
  marketCap?: number;
  returnOnEquity?: number;
  returnOnAssets?: number;
  grossMargins?: number;
  operatingMargins?: number;
  profitMargins?: number;
  currentRatio?: number;
  debtToEquity?: number;
  revenueGrowth?: number;
  totalRevenue?: number;
  freeCashflow?: number;
  targetMeanPrice?: number;
  recommendationKey?: string;
  sector?: string;
  industry?: string;
  longBusinessSummary?: string;
  pegRatio?: number;
}

interface HistoryPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface WatchlistItem { symbol: string }

const PERIODS = [
  { label: "5D", value: "5d", interval: "15m" },
  { label: "1M", value: "1mo", interval: "1d" },
  { label: "3M", value: "3mo", interval: "1d" },
  { label: "6M", value: "6mo", interval: "1d" },
  { label: "1Y", value: "1y", interval: "1d" },
  { label: "5Y", value: "5y", interval: "1wk" },
];

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

const tooltipStyle = {
  backgroundColor: "hsl(222, 47%, 10%)",
  border: "1px solid hsl(217, 33%, 17%)",
  borderRadius: 6,
  fontSize: 12,
  color: "hsl(213, 31%, 91%)",
};

export default function StockPage() {
  const params = useParams<{ symbol: string }>();
  const rawSymbol = decodeURIComponent(params.symbol ?? "");
  const [period, setPeriod] = useState(PERIODS[1]);
  const queryClient = useQueryClient();

  const { data: quote, isLoading: quoteLoading } = useQuery<Quote>({
    queryKey: ["stock", "quote", rawSymbol],
    queryFn: () => fetch(apiUrl(`/stocks/quote/${encodeURIComponent(rawSymbol)}`)).then((r) => r.json()),
    enabled: !!rawSymbol,
  });

  const { data: fundamentals } = useQuery<Fundamental>({
    queryKey: ["stock", "fundamentals", rawSymbol],
    queryFn: () => fetch(apiUrl(`/stocks/fundamentals/${encodeURIComponent(rawSymbol)}`)).then((r) => r.json()),
    enabled: !!rawSymbol,
  });

  const { data: history, isLoading: historyLoading } = useQuery<HistoryPoint[]>({
    queryKey: ["stock", "history", rawSymbol, period.value],
    queryFn: () =>
      fetch(apiUrl(`/stocks/history/${encodeURIComponent(rawSymbol)}?period=${period.value}&interval=${period.interval}`)).then((r) => r.json()),
    enabled: !!rawSymbol,
  });

  const { data: watchlist } = useQuery<WatchlistItem[]>({
    queryKey: ["watchlist"],
    queryFn: () => fetch(apiUrl("/watchlist")).then((r) => r.json()),
  });

  const isWatched = (watchlist ?? []).some((w) => w.symbol === rawSymbol);
  const addMutation = useMutation({
    mutationFn: () => fetch(apiUrl("/watchlist"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: rawSymbol }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["watchlist"] }); toast.success("Added to watchlist"); },
  });
  const removeMutation = useMutation({
    mutationFn: () => fetch(apiUrl(`/watchlist/${encodeURIComponent(rawSymbol)}`), { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["watchlist"] }); toast.success("Removed from watchlist"); },
  });

  const closes = (history ?? []).map((h) => h.close);
  const rsiValues = computeRSI(closes);
  const chartData = (history ?? []).map((h, i) => ({
    date: new Date(h.timestamp * 1000).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
    close: h.close,
    rsi: rsiValues[i] ?? null,
  }));

  const chg = quote?.regularMarketChangePercent ?? 0;
  const lineColor = chg >= 0 ? "#22c55e" : "#ef4444";
  const isPos = chg >= 0;

  return (
    <div className="space-y-5 max-w-screen-xl">
      {/* Back */}
      <Link href="/screener" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Screener
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">{displaySymbol(rawSymbol)}</h1>
            {quote?.shortName && (
              <span className="text-base font-normal text-muted-foreground">{quote.shortName}</span>
            )}
            {fundamentals?.sector && (
              <span className="rounded-full bg-primary/10 text-primary text-xs font-semibold px-2.5 py-0.5">
                {fundamentals.sector}
              </span>
            )}
          </div>
          {fundamentals?.industry && (
            <p className="text-xs text-muted-foreground mt-1">{fundamentals.industry}</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => (isWatched ? removeMutation.mutate() : addMutation.mutate())}
          disabled={addMutation.isPending || removeMutation.isPending}
          className={isWatched ? "border-primary/30 text-primary" : ""}
        >
          {isWatched ? <StarOff className="h-4 w-4" /> : <Star className="h-4 w-4" />}
          {isWatched ? "Unwatch" : "Add to Watchlist"}
        </Button>
      </div>

      {/* Price + Stats */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Price card */}
        <div className="lg:col-span-2 rounded-lg border bg-card p-5">
          {quoteLoading ? (
            <div className="h-20 animate-pulse bg-accent/40 rounded-lg" />
          ) : (
            <div className="flex flex-wrap items-start gap-6">
              <div>
                <div className="text-4xl font-bold tabular-nums">{formatPrice(quote?.regularMarketPrice)}</div>
                <div className={`mt-2 flex items-center gap-1.5 text-lg font-semibold ${changeColor(chg)}`}>
                  {isPos ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                  <span className="tabular-nums">
                    {chg >= 0 ? "+" : ""}{(quote?.regularMarketChange ?? 0).toFixed(2)}
                  </span>
                  <span className={`text-sm rounded-full px-2 py-0.5 ${changeBg(chg)}`}>
                    {formatChangePercent(chg)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* OHLCV stats */}
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Today's Stats</h3>
          <StatRow label="Open" value={formatPrice(quote?.regularMarketOpen)} />
          <StatRow label="Prev Close" value={formatPrice(quote?.regularMarketPreviousClose)} />
          <StatRow label="Day High" value={formatPrice(quote?.regularMarketDayHigh)} />
          <StatRow label="Day Low" value={formatPrice(quote?.regularMarketDayLow)} />
          <StatRow label="52W High" value={formatPrice(quote?.fiftyTwoWeekHigh)} />
          <StatRow label="52W Low" value={formatPrice(quote?.fiftyTwoWeekLow)} />
          <StatRow label="Volume" value={formatVolume(quote?.regularMarketVolume)} />
          <StatRow label="Market Cap" value={quote?.marketCap ? formatMarketCap(quote.marketCap / 1e7) : "—"} />
        </div>
      </div>

      {/* Price chart */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-semibold text-sm">Price Chart</h2>
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  period.value === p.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {historyLoading ? (
          <div className="h-48 animate-pulse bg-accent/40 rounded-lg" />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(215,20%,55%)" }} interval="preserveStartEnd" tickLine={false} axisLine={false} />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "hsl(215,20%,55%)" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `₹${v.toFixed(0)}`} width={60} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`₹${v.toFixed(2)}`, "Price"]} />
              <Line type="monotone" dataKey="close" stroke={lineColor} strokeWidth={2} dot={false} activeDot={{ r: 3, fill: lineColor }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* RSI */}
      {!historyLoading && chartData.length > 14 && (
        <div className="rounded-lg border bg-card p-4">
          <h2 className="font-semibold text-sm mb-4">RSI (14)</h2>
          <ResponsiveContainer width="100%" height={110}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(215,20%,55%)" }} interval="preserveStartEnd" tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(215,20%,55%)" }} tickLine={false} axisLine={false} ticks={[0, 30, 50, 70, 100]} width={30} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number | null) => [v != null ? v.toFixed(2) : "—", "RSI"]} />
              <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.5} />
              <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.5} />
              <Line type="monotone" dataKey="rsi" stroke="hsl(199,89%,48%)" strokeWidth={1.5} dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Fundamentals */}
      {fundamentals && (
        <div className="space-y-4">
          <h2 className="font-semibold">Fundamentals</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            <FundCard label="P/E (TTM)" value={formatRatio(fundamentals.trailingPE)} />
            <FundCard label="P/E (Fwd)" value={formatRatio(fundamentals.forwardPE)} />
            <FundCard label="PEG Ratio" value={formatRatio(fundamentals.pegRatio)} />
            <FundCard label="Price / Book" value={formatRatio(fundamentals.priceToBook)} />
            <FundCard label="EPS (TTM)" value={formatRatio(fundamentals.trailingEps)} />
            <FundCard label="EPS (Fwd)" value={formatRatio(fundamentals.forwardEps)} />
            <FundCard label="Beta" value={formatRatio(fundamentals.beta)} />
            <FundCard label="Dividend Yield" value={fundamentals.dividendYield != null ? formatPercent(fundamentals.dividendYield * 100) : "—"} />
            <FundCard label="ROE" value={fundamentals.returnOnEquity != null ? formatPercent(fundamentals.returnOnEquity * 100) : "—"} />
            <FundCard label="ROA" value={fundamentals.returnOnAssets != null ? formatPercent(fundamentals.returnOnAssets * 100) : "—"} />
            <FundCard label="Gross Margin" value={fundamentals.grossMargins != null ? formatPercent(fundamentals.grossMargins * 100) : "—"} />
            <FundCard label="Net Margin" value={fundamentals.profitMargins != null ? formatPercent(fundamentals.profitMargins * 100) : "—"} />
            <FundCard label="Current Ratio" value={formatRatio(fundamentals.currentRatio)} />
            <FundCard label="Debt / Equity" value={fundamentals.debtToEquity != null ? formatRatio(fundamentals.debtToEquity / 100) : "—"} />
            <FundCard label="Rev Growth" value={fundamentals.revenueGrowth != null ? formatPercent(fundamentals.revenueGrowth * 100) : "—"} />
          </div>

          {fundamentals.recommendationKey && (
            <div className="rounded-lg border bg-card p-4 flex items-center gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Analyst Consensus</p>
                <span className={`rounded-full px-3 py-1 text-sm font-bold uppercase tracking-wide ${
                  fundamentals.recommendationKey === "buy" || fundamentals.recommendationKey === "strong_buy"
                    ? "bg-green-500/10 text-green-500"
                    : fundamentals.recommendationKey === "sell" || fundamentals.recommendationKey === "strong_sell"
                    ? "bg-red-500/10 text-red-500"
                    : "bg-secondary text-muted-foreground"
                }`}>
                  {fundamentals.recommendationKey.replace(/_/g, " ")}
                </span>
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
              <p className="text-sm text-muted-foreground leading-relaxed">{fundamentals.longBusinessSummary}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
