"use client";

import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import Link from "next/link";
import { apiUrl } from "@/lib/api-url";
import { formatPrice, formatChangePercent, formatVolume, changeColor } from "@/lib/format";
import { displaySymbol } from "@/lib/format";

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
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {q.name ?? q.shortName ?? displaySymbol(q.symbol)}
        </span>
        {isPos ? (
          <TrendingUp className="h-4 w-4 text-emerald-400" />
        ) : (
          <TrendingDown className="h-4 w-4 text-red-400" />
        )}
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">
        {formatPrice(q.regularMarketPrice)}
      </div>
      <div className={`mt-1 text-sm font-medium tabular-nums ${changeColor(chg)}`}>
        {formatChangePercent(chg)}
      </div>
    </div>
  );
}

function StockRow({ q, rank }: { q: Quote; rank: number }) {
  const chg = q.regularMarketChangePercent ?? 0;
  return (
    <Link
      href={`/stock/${encodeURIComponent(q.symbol)}`}
      className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-secondary/50 transition-colors"
    >
      <span className="w-5 text-center text-xs text-muted-foreground">{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{displaySymbol(q.symbol)}</div>
        <div className="text-xs text-muted-foreground truncate">{q.shortName ?? ""}</div>
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold tabular-nums">{formatPrice(q.regularMarketPrice)}</div>
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
  data,
  isLoading,
}: {
  title: string;
  icon: React.ElementType;
  data?: Quote[];
  isLoading: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-secondary/40 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-0.5">
          {(data ?? []).slice(0, 10).map((q, i) => (
            <StockRow key={q.symbol} q={q} rank={i + 1} />
          ))}
        </div>
      )}
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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Market Overview</h1>

      {/* Index cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {indicesLoading
          ? [...Array(6)].map((_, i) => (
              <div key={i} className="rounded-xl border bg-card p-4 h-24 animate-pulse" />
            ))
          : (indices ?? []).map((q) => <IndexCard key={q.symbol} q={q} />)}
      </div>

      {/* Top movers */}
      <div className="grid gap-4 md:grid-cols-3">
        <MoverSection
          title="Top Gainers"
          icon={TrendingUp}
          data={gainers}
          isLoading={gainersLoading}
        />
        <MoverSection
          title="Top Losers"
          icon={TrendingDown}
          data={losers}
          isLoading={losersLoading}
        />
        <MoverSection
          title="Most Active"
          icon={Activity}
          data={active}
          isLoading={activeLoading}
        />
      </div>
    </div>
  );
}
