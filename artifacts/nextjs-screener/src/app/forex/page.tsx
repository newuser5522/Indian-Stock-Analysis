"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { apiUrl } from "@/lib/api-url";
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";

interface ForexPair {
  symbol: string;
  base: string;
  quote: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  sparkline: number[];
  lastUpdated: string | null;
}

const FLAG: Record<string, string> = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵",
  AUD: "🇦🇺", CAD: "🇨🇦", CHF: "🇨🇭", CNH: "🇨🇳",
  SGD: "🇸🇬", AED: "🇦🇪", INR: "🇮🇳",
};

function SparkLine({ data, positive }: { data: number[]; positive: boolean }) {
  if (!data || data.length < 2) return null;
  const pts = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width={80} height={32}>
      <LineChart data={pts}>
        <Line type="monotone" dataKey="v" stroke={positive ? "#22c55e" : "#ef4444"}
          strokeWidth={1.5} dot={false} />
        <Tooltip contentStyle={{ display: "none" }} cursor={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function fmt(n: number, decimals = 4) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function CurrencyConverter({ pairs }: { pairs: ForexPair[] }) {
  const [amount, setAmount] = useState("1000");
  const [fromCcy, setFromCcy] = useState("USD");

  const selectedPair = pairs.find(p => p.base === fromCcy);
  const inrValue = selectedPair ? parseFloat(amount || "0") * selectedPair.price : null;
  const ccys = pairs.map(p => p.base);

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="font-semibold text-sm mb-3">Currency Converter → INR</h3>
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Amount</label>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="h-9 w-32 rounded-md border border-input bg-transparent px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            min="0"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Currency</label>
          <select
            value={fromCcy}
            onChange={e => setFromCcy(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {ccys.map(c => <option key={c} value={c}>{FLAG[c] ?? ""} {c}</option>)}
          </select>
        </div>
        <div className="text-2xl font-bold tabular-nums text-primary">
          = ₹{inrValue != null ? inrValue.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}
        </div>
        {selectedPair && (
          <div className="text-xs text-muted-foreground self-end pb-1">
            1 {fromCcy} = ₹{fmt(selectedPair.price, 2)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ForexPage() {
  const { data: pairs = [], isLoading, dataUpdatedAt, refetch } = useQuery<ForexPair[]>({
    queryKey: ["market", "forex"],
    queryFn: () => fetch(apiUrl("/market/forex")).then(r => r.json()),
    refetchInterval: 60_000,
  });

  const usdInr = pairs.find(p => p.base === "USD");

  return (
    <div className="space-y-5 max-w-screen-xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Forex — INR Rates
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live exchange rates against Indian Rupee (INR)
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {dataUpdatedAt ? `Updated ${new Date(dataUpdatedAt).toLocaleTimeString("en-IN")}` : "Refresh"}
        </button>
      </div>

      {/* USD/INR Hero card */}
      {isLoading ? (
        <div className="rounded-xl border bg-card p-6 h-32 animate-pulse bg-accent/40" />
      ) : usdInr ? (
        <div className="rounded-xl border bg-card p-6 flex items-center gap-8 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{FLAG.USD}</span>
              <span className="text-lg font-bold">USD / INR</span>
              <span className="text-sm text-muted-foreground">{FLAG.INR}</span>
            </div>
            <div className="text-4xl font-bold tabular-nums mt-1">₹{fmt(usdInr.price, 2)}</div>
            <div className={`flex items-center gap-2 mt-2 text-sm font-semibold ${usdInr.changePct >= 0 ? "text-green-500" : "text-red-500"}`}>
              {usdInr.changePct >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              <span className="tabular-nums">{usdInr.change >= 0 ? "+" : ""}{fmt(usdInr.change, 4)}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${usdInr.changePct >= 0 ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}`}>
                {usdInr.changePct >= 0 ? "+" : ""}{usdInr.changePct.toFixed(3)}%
              </span>
            </div>
          </div>
          <div className="flex gap-6 text-sm">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Day High</div>
              <div className="font-semibold tabular-nums">₹{fmt(usdInr.high, 2)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Day Low</div>
              <div className="font-semibold tabular-nums">₹{fmt(usdInr.low, 2)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Day Range</div>
              <div className="font-semibold tabular-nums">₹{fmt(usdInr.high - usdInr.low, 4)}</div>
            </div>
          </div>
          {usdInr.sparkline.length > 0 && (
            <div className="ml-auto">
              <div className="text-xs text-muted-foreground mb-1 text-right">30-day trend</div>
              <SparkLine data={usdInr.sparkline} positive={usdInr.changePct >= 0} />
            </div>
          )}
        </div>
      ) : null}

      {/* Currency converter */}
      {pairs.length > 0 && <CurrencyConverter pairs={pairs} />}

      {/* All pairs table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <span className="font-semibold text-sm">All INR Pairs</span>
          <span className="ml-auto text-xs text-muted-foreground">{pairs.length} currencies</span>
        </div>
        {isLoading ? (
          <div className="divide-y">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="px-4 py-3 flex gap-4">
                <div className="h-5 w-32 bg-accent/40 animate-pulse rounded" />
                <div className="ml-auto h-5 w-24 bg-accent/40 animate-pulse rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Currency</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rate (INR)</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Change</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Chg%</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Day High</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Day Low</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Trend</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map(p => {
                  const pos = p.changePct >= 0;
                  return (
                    <tr key={p.symbol} className="border-b hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{FLAG[p.base] ?? "🏳️"}</span>
                          <div>
                            <div className="font-bold text-sm">{p.base} / INR</div>
                            <div className="text-xs text-muted-foreground">{p.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums">
                        ₹{fmt(p.price, p.base === "JPY" ? 4 : 2)}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums text-sm font-medium ${pos ? "text-green-500" : "text-red-500"}`}>
                        {pos ? "+" : ""}{fmt(p.change, 4)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${pos ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}`}>
                          {pos ? "+" : ""}{p.changePct.toFixed(3)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">₹{fmt(p.high, 2)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">₹{fmt(p.low, 2)}</td>
                      <td className="px-4 py-3 text-right hidden md:table-cell">
                        <SparkLine data={p.sparkline} positive={pos} />
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
        Data via Yahoo Finance · Updates every 60 seconds · Rates are indicative, not for trading
      </div>
    </div>
  );
}
