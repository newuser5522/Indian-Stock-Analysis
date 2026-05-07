import { useState, useMemo } from "react";
import { useParams, Link } from "wouter";
import { ArrowLeft, Star } from "lucide-react";
import {
  useGetStockQuote, useGetStockFundamentals, useGetStockHistory,
  useAddToWatchlist, useRemoveFromWatchlist, useGetWatchlist,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  formatPrice, formatChangePercent, formatChange, formatMarketCap,
  formatLargeNumber, formatPercent, formatRatio, displaySymbol, changeBg,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ComposedChart, Area,
} from "recharts";

const PERIODS = [
  { label: "1D", value: "1d", interval: "5m" },
  { label: "5D", value: "5d", interval: "15m" },
  { label: "1M", value: "1mo", interval: "1d" },
  { label: "3M", value: "3mo", interval: "1d" },
  { label: "6M", value: "6mo", interval: "1wk" },
  { label: "1Y", value: "1y", interval: "1wk" },
  { label: "5Y", value: "5y", interval: "1mo" },
];

function calculateRSI(closes: number[], period = 14): (number | null)[] {
  if (closes.length < period + 1) return closes.map(() => null);
  const rsi: (number | null)[] = [];

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = 0; i < period; i++) rsi.push(null);
  rsi.push(parseFloat((100 - 100 / (1 + avgGain / (avgLoss || 0.001))).toFixed(2)));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? Math.abs(diff) : 0)) / period;
    rsi.push(parseFloat((100 - 100 / (1 + avgGain / (avgLoss || 0.001))).toFixed(2)));
  }
  return rsi;
}

function FundRow({ label, value, highlight }: {
  label: string; value: string; highlight?: "positive" | "negative" | null;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn(
        "font-mono text-xs font-medium tabular-nums",
        highlight === "positive" ? "text-emerald-400" : highlight === "negative" ? "text-red-400" : ""
      )}>{value}</span>
    </div>
  );
}

function FundSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function PriceTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; dataKey: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-lg space-y-1">
      <p className="text-muted-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="font-mono font-bold">{formatPrice(p.value)}</p>
      ))}
    </div>
  );
}

function RsiTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number | null }[]; label?: string }) {
  if (!active || !payload?.length || payload[0].value == null) return null;
  const val = payload[0].value;
  const color = val >= 70 ? "#f87171" : val <= 30 ? "#34d399" : "#94a3b8";
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-mono font-bold" style={{ color }}>RSI {val.toFixed(1)}</p>
    </div>
  );
}

export default function StockDetail() {
  const params = useParams<{ symbol: string }>();
  const symbol = decodeURIComponent(params.symbol ?? "");
  const [period, setPeriod] = useState("1mo");
  const [interval, setIntervalStr] = useState("1d");
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: quote, isLoading: quoteLoading } = useGetStockQuote(symbol, {
    query: { enabled: !!symbol, refetchInterval: 30_000 }
  });
  const { data: fundamentals } = useGetStockFundamentals(symbol, {
    query: { enabled: !!symbol }
  });
  const { data: historyData, isLoading: histLoading } = useGetStockHistory(symbol, { period, interval }, {
    query: { enabled: !!symbol }
  });
  const { data: watchlistData } = useGetWatchlist();

  const isWatched = (watchlistData?.items ?? []).some((i) => i.symbol === symbol);

  const addMutation = useAddToWatchlist({
    mutation: { onSuccess: () => { qc.invalidateQueries(); toast({ title: "Added to watchlist" }); } }
  });
  const removeMutation = useRemoveFromWatchlist({
    mutation: { onSuccess: () => { qc.invalidateQueries(); toast({ title: "Removed from watchlist" }); } }
  });

  const candles = historyData?.candles ?? [];

  const chartData = useMemo(() => {
    const closes = candles.map((c) => c.close);
    const rsiValues = calculateRSI(closes);
    return candles.map((c, i) => ({
      time: new Date(c.timestamp * 1000).toLocaleDateString("en-IN", {
        month: "short", day: "numeric",
        ...(period === "1d" || period === "5d" ? { hour: "2-digit", minute: "2-digit", hour12: false } : {})
      }),
      price: c.close,
      rsi: rsiValues[i],
    }));
  }, [candles, period]);

  const isUp = (quote?.changePercent ?? 0) >= 0;
  const chartColor = isUp ? "#34d399" : "#f87171";

  const firstPrice = chartData[0]?.price;
  const lastPrice = chartData[chartData.length - 1]?.price;
  const chartChange = firstPrice && lastPrice ? ((lastPrice - firstPrice) / firstPrice) * 100 : null;

  const latestRsi = chartData.length > 0 ? [...chartData].reverse().find((d) => d.rsi != null)?.rsi : null;
  const rsiColor = latestRsi != null ? (latestRsi >= 70 ? "text-red-400" : latestRsi <= 30 ? "text-emerald-400" : "text-muted-foreground") : "text-muted-foreground";
  const rsiLabel = latestRsi != null ? (latestRsi >= 70 ? "Overbought" : latestRsi <= 30 ? "Oversold" : "Neutral") : "";

  if (!symbol) return <div className="p-8 text-center text-muted-foreground">Invalid symbol</div>;

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-6 lg:px-6">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 mt-0.5" asChild>
            <Link href="/"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            {quoteLoading ? (
              <div className="space-y-2">
                <div className="h-7 w-36 animate-pulse rounded bg-muted" />
                <div className="h-4 w-48 animate-pulse rounded bg-muted" />
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold font-mono">{displaySymbol(symbol)}</h1>
                <p className="text-sm text-muted-foreground">{quote?.name} · {quote?.exchange}</p>
                {(quote?.sector || fundamentals?.sector) && (
                  <p className="text-xs text-muted-foreground/70 mt-0.5">
                    {fundamentals?.sector ?? quote?.sector}
                    {(fundamentals?.industry ?? quote?.industry) ? ` · ${fundamentals?.industry ?? quote?.industry}` : ""}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
        <Button
          variant={isWatched ? "default" : "outline"}
          size="sm"
          className="gap-1.5"
          onClick={() => {
            if (isWatched) removeMutation.mutate({ symbol: encodeURIComponent(symbol) });
            else if (quote) addMutation.mutate({ data: { symbol, name: quote.name, exchange: quote.exchange } });
          }}
        >
          <Star className={cn("h-3.5 w-3.5", isWatched ? "fill-current" : "")} />
          {isWatched ? "Watching" : "Add to Watchlist"}
        </Button>
      </div>

      {/* Price summary */}
      {quoteLoading ? (
        <div className="mb-6 h-20 animate-pulse rounded-lg bg-muted" />
      ) : quote && (
        <div className="mb-6 flex flex-wrap items-end gap-4">
          <div>
            <p className="font-mono text-4xl font-bold tabular-nums">{formatPrice(quote.price)}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className={cn("rounded-full px-2.5 py-0.5 font-mono text-sm font-medium tabular-nums", changeBg(quote.changePercent))}>
                {formatChange(quote.change)} ({formatChangePercent(quote.changePercent)})
              </span>
              <span className="text-xs text-muted-foreground">today</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-5 text-xs text-muted-foreground pb-1">
            <div><span>Open</span><p className="font-mono font-medium text-foreground tabular-nums">{formatPrice(quote.open)}</p></div>
            <div><span>High</span><p className="font-mono font-medium text-emerald-400 tabular-nums">{formatPrice(quote.high)}</p></div>
            <div><span>Low</span><p className="font-mono font-medium text-red-400 tabular-nums">{formatPrice(quote.low)}</p></div>
            <div><span>Prev Close</span><p className="font-mono font-medium text-foreground tabular-nums">{formatPrice(quote.previousClose)}</p></div>
            {fundamentals?.vwap && <div><span>VWAP</span><p className="font-mono font-medium text-foreground tabular-nums">{formatPrice(fundamentals.vwap)}</p></div>}
            <div><span>52W High</span><p className="font-mono font-medium text-foreground tabular-nums">{formatPrice(quote.fiftyTwoWeekHigh)}</p></div>
            <div><span>52W Low</span><p className="font-mono font-medium text-foreground tabular-nums">{formatPrice(quote.fiftyTwoWeekLow)}</p></div>
            {(fundamentals?.marketCap ?? quote.marketCap) && (
              <div><span>Mkt Cap</span><p className="font-mono font-medium text-foreground">{formatMarketCap(fundamentals?.marketCap ?? quote.marketCap)}</p></div>
            )}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="mb-6 rounded-lg border bg-card p-4">
        {/* Period selector + chart change */}
        <div className="mb-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {chartChange != null && (
              <span className={cn("font-mono text-sm font-medium", chartChange >= 0 ? "text-emerald-400" : "text-red-400")}>
                {chartChange >= 0 ? "+" : ""}{chartChange.toFixed(2)}% ({period})
              </span>
            )}
            {latestRsi != null && (
              <span className={cn("text-xs font-mono", rsiColor)}>
                RSI({latestRsi.toFixed(1)}) · {rsiLabel}
              </span>
            )}
          </div>
          <div className="flex rounded-md border border-border overflow-hidden">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                className={cn("px-2.5 py-1 text-xs font-mono font-medium transition-colors", period === p.value ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")}
                onClick={() => { setPeriod(p.value); setIntervalStr(p.interval); }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {histLoading ? (
          <div className="h-72 animate-pulse rounded bg-muted" />
        ) : chartData.length > 0 ? (
          <div>
            {/* Price Chart */}
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColor} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} width={68} domain={["auto", "auto"]} />
                <Tooltip content={<PriceTooltip />} />
                {firstPrice && <ReferenceLine y={firstPrice} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 2" strokeOpacity={0.4} />}
                <Area type="monotone" dataKey="price" stroke={chartColor} strokeWidth={2} fill="url(#priceGrad)" dot={false} activeDot={{ r: 4, fill: chartColor }} />
              </ComposedChart>
            </ResponsiveContainer>

            {/* RSI Chart */}
            <div className="mt-1 border-t border-border/50 pt-2">
              <p className="text-[10px] font-mono text-muted-foreground mb-1 px-1">RSI (14)</p>
              <ResponsiveContainer width="100%" height={90}>
                <LineChart data={chartData} margin={{ top: 2, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="time" tick={false} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} ticks={[0, 30, 50, 70, 100]} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={28} />
                  <Tooltip content={<RsiTooltip />} />
                  <ReferenceLine y={70} stroke="#f87171" strokeDasharray="4 2" strokeOpacity={0.7} label={{ value: "70", position: "insideRight", fontSize: 9, fill: "#f87171" }} />
                  <ReferenceLine y={30} stroke="#34d399" strokeDasharray="4 2" strokeOpacity={0.7} label={{ value: "30", position: "insideRight", fontSize: 9, fill: "#34d399" }} />
                  <ReferenceLine y={50} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 4" strokeOpacity={0.3} />
                  <Line type="monotone" dataKey="rsi" stroke="#a78bfa" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <p className="h-72 flex items-center justify-center text-sm text-muted-foreground">Chart data unavailable</p>
        )}
      </div>

      {/* Fundamentals */}
      {fundamentals ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <FundSection title="Valuation">
            <FundRow label="P/E (Trailing)" value={formatRatio(fundamentals.pe)} />
            <FundRow label="P/E (Forward)" value={formatRatio(fundamentals.forwardPe)} />
            <FundRow label="P/B Ratio" value={formatRatio(fundamentals.pb)} />
            <FundRow label="P/S Ratio" value={formatRatio(fundamentals.ps)} />
            <FundRow label="EPS (TTM)" value={fundamentals.eps != null ? formatPrice(fundamentals.eps) : "—"} />
            <FundRow label="EPS Growth" value={formatPercent(fundamentals.epsGrowth)} highlight={fundamentals.epsGrowth != null ? (fundamentals.epsGrowth > 0 ? "positive" : "negative") : null} />
            <FundRow label="Beta" value={formatRatio(fundamentals.beta)} />
          </FundSection>

          <FundSection title="Profitability">
            <FundRow label="ROE" value={formatPercent(fundamentals.roe)} highlight={fundamentals.roe != null ? (fundamentals.roe > 15 ? "positive" : null) : null} />
            <FundRow label="ROA" value={formatPercent(fundamentals.roa)} />
            <FundRow label="Gross Margin" value={formatPercent(fundamentals.grossMargins)} />
            <FundRow label="Operating Margin" value={formatPercent(fundamentals.operatingMargins)} />
            <FundRow label="Net Margin" value={formatPercent(fundamentals.profitMargins)} highlight={fundamentals.profitMargins != null ? (fundamentals.profitMargins > 10 ? "positive" : null) : null} />
            <FundRow label="Revenue" value={formatLargeNumber(fundamentals.revenue)} />
            <FundRow label="Revenue Growth" value={formatPercent(fundamentals.revenueGrowth)} highlight={fundamentals.revenueGrowth != null ? (fundamentals.revenueGrowth > 0 ? "positive" : "negative") : null} />
          </FundSection>

          <FundSection title="Financial Health">
            <FundRow label="Current Ratio" value={formatRatio(fundamentals.currentRatio)} highlight={fundamentals.currentRatio != null ? (fundamentals.currentRatio > 1.5 ? "positive" : fundamentals.currentRatio < 1 ? "negative" : null) : null} />
            <FundRow label="Quick Ratio" value={formatRatio(fundamentals.quickRatio)} />
            <FundRow label="Debt/Equity" value={formatRatio(fundamentals.debtToEquity)} highlight={fundamentals.debtToEquity != null ? (fundamentals.debtToEquity < 0.5 ? "positive" : fundamentals.debtToEquity > 2 ? "negative" : null) : null} />
            <FundRow label="Free Cashflow" value={formatLargeNumber(fundamentals.freeCashflow)} />
            <FundRow label="Operating CF" value={formatLargeNumber(fundamentals.operatingCashflow)} />
            <FundRow label="EBITDA" value={formatLargeNumber(fundamentals.ebitda)} />
          </FundSection>

          <FundSection title="Market & Trading">
            <FundRow label="Market Cap" value={fundamentals.marketCap != null ? formatMarketCap(fundamentals.marketCap) : "—"} />
            <FundRow label="VWAP" value={fundamentals.vwap != null ? formatPrice(fundamentals.vwap) : "—"} />
            <FundRow label="Face Value" value={fundamentals.faceValue != null ? `₹${fundamentals.faceValue}` : "—"} />
            <FundRow label="Shares Issued" value={fundamentals.sharesOutstanding != null ? formatLargeNumber(fundamentals.sharesOutstanding) : "—"} />
            <FundRow label="Delivery %" value={fundamentals.deliveryPct != null ? `${fundamentals.deliveryPct.toFixed(2)}%` : "—"} highlight={fundamentals.deliveryPct != null ? (fundamentals.deliveryPct > 50 ? "positive" : null) : null} />
            <FundRow label="Annual Volatility" value={fundamentals.annualVolatility != null ? `${fundamentals.annualVolatility}%` : "—"} />
            <FundRow label="Dividend Yield" value={formatPercent(fundamentals.dividendYield)} highlight={fundamentals.dividendYield != null ? (fundamentals.dividendYield > 1 ? "positive" : null) : null} />
            {fundamentals.analystRating && (
              <FundRow label="Analyst Rating" value={fundamentals.analystRating.toUpperCase()} highlight={fundamentals.analystRating.includes("buy") ? "positive" : fundamentals.analystRating.includes("sell") ? "negative" : null} />
            )}
            {fundamentals.targetPrice != null && <FundRow label="Target Price" value={formatPrice(fundamentals.targetPrice)} />}
          </FundSection>
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm font-medium mb-1">Loading fundamental data…</p>
          <p className="text-xs text-muted-foreground">Fetching from NSE India</p>
        </div>
      )}
    </div>
  );
}
