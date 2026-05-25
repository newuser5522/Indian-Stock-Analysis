"use client";

import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import Link from "next/link";
import { apiUrl } from "@/lib/api-url";
import {
  formatPrice,
  formatChangePercent,
  formatVolume,
  changeColor,
  changeBg,
  displaySymbol,
} from "@/lib/format";

interface Quote {
  symbol: string;
  name?: string;
  shortName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  marketCap?: number;
}

function IndexCard({ q }: { q: Quote }) {
  const chg = q.regularMarketChangePercent ?? 0;
  const isPos = chg >= 0;
  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
          {q.name ?? q.shortName ?? displaySymbol(q.symbol)}
        </span>
        <span className={`flex items-center gap-0.5 text-xs font-medium rounded-full px-2 py-0.5 shrink-0 ${changeBg(chg)}`}>
          {isPos ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {formatChangePercent(chg)}
        </span>
      </div>
      <div className="text-xl font-bold tabular-nums text-foreground">
        {formatPrice(q.regularMarketPrice)}
      </div>
      <div className={`text-xs tabular-nums ${changeColor(chg)}`}>
        {q.regularMarketChange != null
          ? `${chg >= 0 ? "+" : ""}${q.regularMarketChange.toFixed(2)} today`
          : ""}
      </div>
    </div>
  );
}

function StockRow({ q, rank }: { q: Quote; rank: number }) {
  const chg = q.regularMarketChangePercent ?? 0;
  return (
    <Link
      href={`/stock/${encodeURIComponent(q.symbol)}`}
      className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent/50 transition-colors group"
    >
      <span className="w-5 text-center text-xs text-muted-foreground font-mono">{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm group-hover:text-primary transition-colors">
          {displaySymbol(q.symbol)}
        </div>
        <div className="text-xs text-muted-foreground truncate">{q.shortName ?? ""}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-bold tabular-nums">{formatPrice(q.regularMarketPrice)}</div>
        <div className={`text-xs font-medium tabular-nums ${changeColor(chg)}`}>
          {formatChangePercent(chg)}
        </div>
      </div>
    </Link>
  );
}

function MoverSection({
  title,
  icon: Icon,
  iconClass,
  data,
  isLoading,
}: {
  title: string;
  icon: React.ElementType;
  iconClass: string;
  data?: Quote[];
  isLoading: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <Icon className={`h-4 w-4 ${iconClass}`} />
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      <div className="flex-1 p-2">
        {isLoading ? (
          <div className="space-y-1.5 p-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 rounded-md bg-accent/40 animate-pulse" />
            ))}
          </div>
        ) : (data ?? []).length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">No data available</div>
        ) : (
          <div className="space-y-0.5">
            {(data ?? []).slice(0, 10).map((q, i) => (
              <StockRow key={q.symbol} q={q} rank={i + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MarketPage() {
  const { data: indices, isLoading: indicesLoading } = useQuery<Quote[]>({
    queryKey: ["market", "overview"],
    queryFn: () => fetch(apiUrl("/market/overview")).then((r) => r.json()),
  });

  const { data: gainers, isLoading: gainersLoading } = useQuery<Quote[]>({
    queryKey: ["market", "top-gainers"],
    queryFn: () => fetch(apiUrl("/market/top-gainers")).then((r) => r.json()),
  });

  const { data: losers, isLoading: losersLoading } = useQuery<Quote[]>({
    queryKey: ["market", "top-losers"],
    queryFn: () => fetch(apiUrl("/market/top-losers")).then((r) => r.json()),
  });

  const { data: active, isLoading: activeLoading } = useQuery<Quote[]>({
    queryKey: ["market", "most-active"],
    queryFn: () => fetch(apiUrl("/market/most-active")).then((r) => r.json()),
  });

  return (
    <div className="space-y-6 max-w-screen-xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Market Overview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Live NSE/BSE indices and top movers</p>
      </div>

      {/* Index cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        {indicesLoading
          ? [...Array(6)].map((_, i) => (
              <div key={i} className="rounded-lg border bg-card p-4 h-[88px] animate-pulse" />
            ))
          : (indices ?? []).map((q) => <IndexCard key={q.symbol} q={q} />)}
      </div>

      {/* Top movers */}
      <div className="grid gap-4 md:grid-cols-3">
        <MoverSection
          title="Top Gainers"
          icon={TrendingUp}
          iconClass="text-green-500"
          data={gainers}
          isLoading={gainersLoading}
        />
        <MoverSection
          title="Top Losers"
          icon={TrendingDown}
          iconClass="text-red-500"
          data={losers}
          isLoading={losersLoading}
        />
        <MoverSection
          title="Most Active"
          icon={Activity}
          iconClass="text-primary"
          data={active}
          isLoading={activeLoading}
        />
      </div>
    </div>
  );
}
