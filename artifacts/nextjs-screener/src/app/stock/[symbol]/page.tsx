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
import { ArrowLeft, Star, StarOff } from "lucide-react";
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
  trailingPE?: number;
  priceToBook?: number;
  dividendYield?: number;
  returnOnEquity?: number;
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

interface WatchlistItem {
  symbol: string;
}

const PERIODS = [
  { label: "5D", value: "5d", interval: "15m" },
  { label: "1M", value: "1mo", interval: "1d" },
  { label: "3M", value: "3mo", interval: "1d" },
  { label: "6M", value: "6mo", interval: "1d" },
  { label: "1Y", value: "1y", interval: "1d" },
  { label: "5Y", value: "5y", interval: "1wk" },
];

function computeRSI(closes: number[], period = 14): number[] {
  const rsi: number[] = new Array(period).fill(null);
  if (closes.length <= period) return rsi;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return rsi;
}

function FundamentalCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-secondary/20 p-3">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="font-semibold text-sm">{value}</div>
    </div>
  );
}

export default function StockPage() {
  const params = useParams<{ symbol: string }>();
  const rawSymbol = decodeURIComponent(params.symbol ?? "");
  const [period, setPeriod] = useState(PERIODS[1]);
  const queryClient = useQueryClient();

  const { data: quote, isLoading: quoteLoading } = useQuery<Quote>({
    queryKey: ["stock", "quote", rawSymbol],
    queryFn: () =>
      fetch(apiUrl(`/stocks/quote/${encodeURIComponent(rawSymbol)}`)).then((r) => r.json()),
    enabled: !!rawSymbol,
  });

  const { data: fundamentals } = useQuery<Fundamental>({
    queryKey: ["stock", "fundamentals", rawSymbol],
    queryFn: () =>
      fetch(apiUrl(`/stocks/fundamentals/${encodeURIComponent(rawSymbol)}`)).then((r) => r.json()),
    enabled: !!rawSymbol,
  });

  const { data: history, isLoading: historyLoading } = useQuery<HistoryPoint[]>({
    queryKey: ["stock", "history", rawSymbol, period.value],
    queryFn: () =>
      fetch(
        apiUrl(
          `/stocks/history/${encodeURIComponent(rawSymbol)}?period=${period.value}&interval=${period.interval}`
        )
      ).then((r) => r.json()),
    enabled: !!rawSymbol,
  });

  const { data: watchlist } = useQuery<WatchlistItem[]>({
    queryKey: ["watchlist"],
    queryFn: () => fetch(apiUrl("/watchlist")).then((r) => r.json()),
  });

  const isWatched = (watchlist ?? []).some((w) => w.symbol === rawSymbol);

  const addMutation = useMutation({
    mutationFn: () =>
      fetch(apiUrl("/watchlist"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: rawSymbol }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      toast.success("Added to watchlist");
    },
  });

  const removeMutation = useMutation({
    mutationFn: () =>
      fetch(apiUrl(`/watchlist/${encodeURIComponent(rawSymbol)}`), { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      toast.success("Removed from watchlist");
    },
  });

  const closes = (history ?? []).map((h) => h.close);
  const rsiValues = computeRSI(closes);
  const chartData = (history ?? []).map((h, i) => ({
    date: new Date(h.timestamp * 1000).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    }),
    close: h.close,
    rsi: rsiValues[i] ?? null,
  }));

  const chg = quote?.regularMarketChangePercent ?? 0;
  const lineColor = chg >= 0 ? "#34d399" : "#f87171";

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/screener"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
          <h1 className="text-2xl font-bold">
            {displaySymbol(rawSymbol)}
            {quote?.shortName && (
              <span className="ml-2 text-base font-normal text-muted-foreground">
                {quote.shortName}
              </span>
            )}
          </h1>
          {fundamentals?.sector && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {fundamentals.sector} · {fundamentals.industry}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => (isWatched ? removeMutation.mutate() : addMutation.mutate())}
          disabled={addMutation.isPending || removeMutation.isPending}
        >
          {isWatched ? <StarOff className="h-4 w-4" /> : <Star className="h-4 w-4" />}
          {isWatched ? "Unwatch" : "Watch"}
        </Button>
      </div>

      {/* Price summary */}
      <div className="rounded-xl border bg-card p-5">
        {quoteLoading ? (
          <div className="h-16 animate-pulse bg-secondary/40 rounded-lg" />
        ) : (
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <div className="text-4xl font-bold tabular-nums">
                {formatPrice(quote?.regularMarketPrice)}
              </div>
              <div className={`mt-1 text-lg font-semibold tabular-nums ${changeColor(chg)}`}>
                {quote?.regularMarketChange != null
                  ? `${chg >= 0 ? "+" : ""}${quote.regularMarketChange.toFixed(2)}`
                  : ""}{" "}
                ({formatChangePercent(chg)})
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm ml-auto">
              <div className="text-muted-foreground">Open</div>
              <div className="text-right tabular-nums">{formatPrice(quote?.regularMarketOpen)}</div>
              <div className="text-muted-foreground">Prev Close</div>
              <div className="text-right tabular-nums">{formatPrice(quote?.regularMarketPreviousClose)}</div>
              <div className="text-muted-foreground">Day High</div>
              <div className="text-right tabular-nums">{formatPrice(quote?.regularMarketDayHigh)}</div>
              <div className="text-muted-foreground">Day Low</div>
              <div className="text-right tabular-nums">{formatPrice(quote?.regularMarketDayLow)}</div>
              <div className="text-muted-foreground">52W High</div>
              <div className="text-right tabular-nums">{formatPrice(quote?.fiftyTwoWeekHigh)}</div>
              <div className="text-muted-foreground">52W Low</div>
              <div className="text-right tabular-nums">{formatPrice(quote?.fiftyTwoWeekLow)}</div>
              <div className="text-muted-foreground">Volume</div>
              <div className="text-right tabular-nums">{formatVolume(quote?.regularMarketVolume)}</div>
              <div className="text-muted-foreground">Market Cap</div>
              <div className="text-right tabular-nums">
                {quote?.marketCap ? formatMarketCap(quote.marketCap / 1e7) : "—"}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Price chart */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Price Chart</h2>
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <Button
                key={p.value}
                variant={period.value === p.value ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setPeriod(p)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
        {historyLoading ? (
          <div className="h-48 animate-pulse bg-secondary/40 rounded-lg" />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                interval="preserveStartEnd"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `₹${v.toFixed(0)}`}
                width={60}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(222 47% 14%)",
                  border: "1px solid hsl(217 32% 17%)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => [`₹${v.toFixed(2)}`, "Price"]}
              />
              <Line
                type="monotone"
                dataKey="close"
                stroke={lineColor}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* RSI chart */}
      {!historyLoading && chartData.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h2 className="font-semibold mb-4">RSI (14)</h2>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                interval="preserveStartEnd"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                ticks={[0, 30, 50, 70, 100]}
                width={30}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(222 47% 14%)",
                  border: "1px solid hsl(217 32% 17%)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number | null) =>
                  v != null ? [v.toFixed(2), "RSI"] : ["—", "RSI"]
                }
              />
              <ReferenceLine y={70} stroke="#f87171" strokeDasharray="3 3" />
              <ReferenceLine y={30} stroke="#34d399" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="rsi"
                stroke="#818cf8"
                strokeWidth={1.5}
                dot={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Fundamentals */}
      {fundamentals && (
        <div className="space-y-4">
          <h2 className="font-semibold">Fundamentals</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <FundamentalCard label="P/E (TTM)" value={formatRatio(fundamentals.trailingPE)} />
            <FundamentalCard label="P/E (Forward)" value={formatRatio(fundamentals.forwardPE)} />
            <FundamentalCard label="PEG Ratio" value={formatRatio(fundamentals.pegRatio)} />
            <FundamentalCard label="Price / Book" value={formatRatio(fundamentals.priceToBook)} />
            <FundamentalCard label="EPS (TTM)" value={formatRatio(fundamentals.trailingEps)} />
            <FundamentalCard label="EPS (Fwd)" value={formatRatio(fundamentals.forwardEps)} />
            <FundamentalCard label="Beta" value={formatRatio(fundamentals.beta)} />
            <FundamentalCard
              label="Dividend Yield"
              value={fundamentals.dividendYield != null ? formatPercent(fundamentals.dividendYield * 100) : "—"}
            />
            <FundamentalCard
              label="ROE"
              value={fundamentals.returnOnEquity != null ? formatPercent(fundamentals.returnOnEquity * 100) : "—"}
            />
            <FundamentalCard
              label="ROA"
              value={fundamentals.returnOnAssets != null ? formatPercent(fundamentals.returnOnAssets * 100) : "—"}
            />
            <FundamentalCard
              label="Gross Margin"
              value={fundamentals.grossMargins != null ? formatPercent(fundamentals.grossMargins * 100) : "—"}
            />
            <FundamentalCard
              label="Net Margin"
              value={fundamentals.profitMargins != null ? formatPercent(fundamentals.profitMargins * 100) : "—"}
            />
            <FundamentalCard label="Current Ratio" value={formatRatio(fundamentals.currentRatio)} />
            <FundamentalCard
              label="Debt / Equity"
              value={fundamentals.debtToEquity != null ? formatRatio(fundamentals.debtToEquity / 100) : "—"}
            />
            <FundamentalCard
              label="Revenue Growth"
              value={fundamentals.revenueGrowth != null ? formatPercent(fundamentals.revenueGrowth * 100) : "—"}
            />
            <FundamentalCard
              label="Market Cap"
              value={fundamentals.marketCap != null ? formatMarketCap(fundamentals.marketCap / 1e7) : "—"}
            />
          </div>

          {fundamentals.longBusinessSummary && (
            <div className="rounded-xl border bg-card p-4">
              <h3 className="font-semibold text-sm mb-2">About</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {fundamentals.longBusinessSummary}
              </p>
            </div>
          )}

          {fundamentals.recommendationKey && (
            <div className="rounded-xl border bg-card p-4">
              <h3 className="font-semibold text-sm mb-2">Analyst Consensus</h3>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-3 py-1 text-sm font-semibold uppercase ${
                    fundamentals.recommendationKey === "buy" || fundamentals.recommendationKey === "strong_buy"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : fundamentals.recommendationKey === "sell" || fundamentals.recommendationKey === "strong_sell"
                      ? "bg-red-500/10 text-red-400"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {fundamentals.recommendationKey.replace(/_/g, " ")}
                </span>
                {fundamentals.targetMeanPrice != null && (
                  <span className="text-sm text-muted-foreground">
                    Target: {formatPrice(fundamentals.targetMeanPrice)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
