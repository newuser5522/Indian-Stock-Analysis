import { Link } from "wouter";
import { ArrowUpRight, ArrowDownRight, RefreshCw, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { useGetMarketOverview, useGetTopGainers, useGetTopLosers, useGetMostActive } from "@workspace/api-client-react";
import { formatPrice, formatChangePercent, formatChange, formatVolume, formatMarketCap, displaySymbol, changeBg, changeColor } from "@/lib/format";
import { cn } from "@/lib/utils";

function IndexCard({ symbol, name, price, change, changePercent }: {
  symbol: string; name: string; price: number; change: number; changePercent: number; previousClose: number;
}) {
  const isUp = change >= 0;
  return (
    <div className={cn("rounded-lg border bg-card p-4 transition-colors", isUp ? "border-l-2 border-l-emerald-500/60" : "border-l-2 border-l-red-500/60")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-mono text-muted-foreground">{symbol.replace("^", "")}</p>
          <p className="mt-0.5 font-semibold text-sm leading-tight">{name}</p>
        </div>
        <span className={cn("flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-mono font-medium", isUp ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>
          {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {formatChangePercent(changePercent)}
        </span>
      </div>
      <p className="mt-3 font-mono text-xl font-bold tabular-nums">{price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p>
      <p className={cn("mt-0.5 font-mono text-xs", changeColor(change))}>
        {formatChange(change)} today
      </p>
    </div>
  );
}

function StockRow({ symbol, name, price, change, changePercent, volume, marketCap }: {
  symbol: string; name: string; price: number; change: number; changePercent: number;
  volume?: number; marketCap?: number;
}) {
  return (
    <Link href={`/stock/${encodeURIComponent(symbol)}`} className="group flex items-center justify-between gap-4 rounded-md px-3 py-2.5 transition-colors hover:bg-muted/60">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold">{displaySymbol(symbol)}</span>
          <span className="truncate text-xs text-muted-foreground">{name}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
          {volume != null && <span>Vol: {formatVolume(volume)}</span>}
          {marketCap != null && <span>MCap: {formatMarketCap(marketCap)}</span>}
        </div>
      </div>
      <div className="text-right">
        <p className="font-mono text-sm font-semibold tabular-nums">{formatPrice(price)}</p>
        <span className={cn("inline-block rounded px-1.5 py-0.5 text-xs font-mono font-medium tabular-nums", changeBg(changePercent))}>
          {formatChangePercent(changePercent)}
        </span>
      </div>
    </Link>
  );
}

function Section({ title, icon: Icon, children, loading }: { title: string; icon: React.FC<{ className?: string }>; children: React.ReactNode; loading?: boolean }) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="font-semibold text-sm">{title}</h2>
        {loading && <RefreshCw className="ml-auto h-3 w-3 animate-spin text-muted-foreground" />}
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

export default function MarketOverview() {
  const { data: overviewData, isLoading: overviewLoading } = useGetMarketOverview({
    query: { refetchInterval: 60_000 },
  });
  const { data: gainersData, isLoading: gainersLoading } = useGetTopGainers(
    { exchange: "NSE", limit: 8 },
    { query: { refetchInterval: 60_000 } },
  );
  const { data: losersData, isLoading: losersLoading } = useGetTopLosers(
    { exchange: "NSE", limit: 8 },
    { query: { refetchInterval: 60_000 } },
  );
  const { data: activeData, isLoading: activeLoading } = useGetMostActive(
    { exchange: "NSE", limit: 8 },
    { query: { refetchInterval: 60_000 } },
  );

  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-6 lg:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold">Market Overview</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Indian equity markets — NSE &amp; BSE. Prices refresh every 60s.</p>
      </div>

      {/* Indices */}
      <section className="mb-8">
        {overviewLoading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {(overviewData?.indices ?? []).map((idx) => (
              <IndexCard key={idx.symbol} {...idx} />
            ))}
          </div>
        )}
      </section>

      {/* Movers */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Section title="Top Gainers" icon={TrendingUp} loading={gainersLoading}>
          {gainersLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 mx-3 my-1.5 animate-pulse rounded bg-muted/40" />
              ))
            : (gainersData?.stocks ?? []).map((s) => (
                <StockRow key={s.symbol} {...s} />
              ))}
        </Section>
        <Section title="Top Losers" icon={TrendingDown} loading={losersLoading}>
          {losersLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 mx-3 my-1.5 animate-pulse rounded bg-muted/40" />
              ))
            : (losersData?.stocks ?? []).map((s) => (
                <StockRow key={s.symbol} {...s} />
              ))}
        </Section>
        <Section title="Most Active" icon={Activity} loading={activeLoading}>
          {activeLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 mx-3 my-1.5 animate-pulse rounded bg-muted/40" />
              ))
            : (activeData?.stocks ?? []).map((s) => (
                <StockRow key={s.symbol} {...s} />
              ))}
        </Section>
      </div>
    </div>
  );
}
