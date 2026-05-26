"use client";

import { useQuery } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api-url";
import { formatChangePercent, changeBg, changeColor, formatVolume } from "@/lib/format";
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";
import Link from "next/link";

interface GoldEtf {
  symbol: string;
  name: string;
  amc: string;
  price: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  volume: number;
  week52High: number;
  week52Low: number;
  monthReturn: number | null;
  sparkline: number[];
}

function SparkLine({ data, positive }: { data: number[]; positive: boolean }) {
  if (!data || data.length < 2) return null;
  const pts = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width={70} height={28}>
      <LineChart data={pts}>
        <Line type="monotone" dataKey="v" stroke={positive ? "#22c55e" : "#ef4444"} strokeWidth={1.5} dot={false} />
        <Tooltip contentStyle={{ display: "none" }} cursor={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function fmt(n: number | null | undefined, d = 2) {
  if (n == null) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export default function GoldEtfPage() {
  const { data: etfs = [], isLoading } = useQuery<GoldEtf[]>({
    queryKey: ["market", "gold-etf"],
    queryFn: () => fetch(apiUrl("/market/gold-etf")).then(r => r.json()),
    refetchInterval: 60_000,
  });

  // Average price across ETFs for summary
  const avgPrice = etfs.length > 0
    ? etfs.reduce((s, e) => s + e.price, 0) / etfs.length
    : null;
  const avgChange = etfs.length > 0
    ? etfs.reduce((s, e) => s + e.changePct, 0) / etfs.length
    : null;
  const topGainer = [...etfs].sort((a, b) => b.changePct - a.changePct)[0];
  const topVolume = [...etfs].sort((a, b) => b.volume - a.volume)[0];

  return (
    <div className="space-y-5 max-w-screen-xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <span className="text-xl">🥇</span>
          Gold ETFs — NSE India
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          All NSE-listed Gold Exchange Traded Funds · live prices via Yahoo Finance
        </p>
      </div>

      {/* Summary cards */}
      {!isLoading && etfs.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">Avg ETF Price</div>
            <div className="text-xl font-bold tabular-nums">₹{fmt(avgPrice)}</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">Avg Day Change</div>
            <div className={`text-xl font-bold tabular-nums ${changeColor(avgChange)}`}>
              {avgChange != null ? `${avgChange >= 0 ? "+" : ""}${fmt(avgChange)}%` : "—"}
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">Top Gainer Today</div>
            <div className="text-sm font-bold text-green-400">{topGainer?.amc ?? "—"}</div>
            <div className="text-xs tabular-nums text-green-400">{topGainer ? `+${fmt(topGainer.changePct)}%` : ""}</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">Most Active</div>
            <div className="text-sm font-bold">{topVolume?.amc ?? "—"}</div>
            <div className="text-xs text-muted-foreground">{topVolume ? formatVolume(topVolume.volume) : ""}</div>
          </div>
        </div>
      )}

      {/* Gold ETF info card */}
      <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">ℹ️</span>
          <div className="text-sm">
            <p className="font-semibold text-yellow-400 mb-1">About NSE Gold ETFs</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Gold ETFs track domestic gold prices and are backed by physical gold of 99.5% purity.
              Each unit ≈ 1 gram of gold. They trade on NSE like stocks — no storage or making charges.
              Returns track <strong>domestic gold price</strong> (international gold + USD/INR rate).
            </p>
          </div>
        </div>
      </div>

      {/* ETF Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <span className="font-semibold text-sm">NSE Gold ETFs</span>
          <span className="ml-auto text-xs text-muted-foreground">{etfs.length} funds</span>
        </div>
        {isLoading ? (
          <div className="divide-y">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="px-4 py-4 flex gap-4">
                <div className="h-5 w-40 bg-accent/40 animate-pulse rounded" />
                <div className="ml-auto h-5 w-20 bg-accent/40 animate-pulse rounded" />
              </div>
            ))}
          </div>
        ) : etfs.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">No ETF data available</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  {["ETF","AMC","Price (₹)","Day Chg%","1M Return","52W High","52W Low","Volume","Trend"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap last:text-right">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {etfs.map(e => {
                  const sym = e.symbol.replace(".NS", "");
                  const pos = e.changePct >= 0;
                  const rangePct = e.week52High > e.week52Low
                    ? ((e.price - e.week52Low) / (e.week52High - e.week52Low)) * 100
                    : 50;
                  return (
                    <tr key={e.symbol} className="border-b hover:bg-accent/30 transition-colors">
                      <td className="px-3 py-3">
                        <Link href={`/stock/${encodeURIComponent(e.symbol)}`} className="group">
                          <div className="font-bold group-hover:text-primary transition-colors text-xs">{sym}</div>
                          <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">{e.name}</div>
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded bg-yellow-500/10 text-yellow-400 text-[10px] font-semibold px-1.5 py-0.5">{e.amc}</span>
                      </td>
                      <td className="px-3 py-3 tabular-nums font-bold text-sm">₹{fmt(e.price)}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${changeBg(e.changePct)}`}>
                          {formatChangePercent(e.changePct)}
                        </span>
                      </td>
                      <td className={`px-3 py-3 tabular-nums text-xs font-semibold ${changeColor(e.monthReturn)}`}>
                        {e.monthReturn != null ? `${e.monthReturn >= 0 ? "+" : ""}${fmt(e.monthReturn)}%` : "—"}
                      </td>
                      <td className="px-3 py-3 tabular-nums text-xs text-muted-foreground">₹{fmt(e.week52High)}</td>
                      <td className="px-3 py-3 tabular-nums text-xs text-muted-foreground">
                        <div>₹{fmt(e.week52Low)}</div>
                        <div className="mt-1 w-14 h-1 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-yellow-500" style={{ width: `${Math.max(2, Math.min(100, rangePct))}%` }} />
                        </div>
                      </td>
                      <td className="px-3 py-3 tabular-nums text-xs text-muted-foreground">{formatVolume(e.volume)}</td>
                      <td className="px-3 py-3 text-right">
                        <SparkLine data={e.sparkline} positive={pos} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground text-center">
        Data via Yahoo Finance · Updates every 60 seconds · 1 ETF unit ≈ 1 gram of gold (actual unit size may vary)
      </div>
    </div>
  );
}
