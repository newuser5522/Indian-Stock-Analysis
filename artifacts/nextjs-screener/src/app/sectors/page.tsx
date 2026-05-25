"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { Globe2, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { apiUrl } from "@/lib/api-url";
import { formatPrice, formatChangePercent, changeColor, changeBg } from "@/lib/format";

interface SectorIndex {
  symbol: string;
  shortName: string;
  sectorName: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
}

interface SectorPerf {
  sector: string;
  symbol: string;
  name: string;
  change1d: number;
  change1w: number;
  change1m: number;
  change3m: number;
  rsRatio: number;
  rsMomentum: number;
  quadrant: "Leading" | "Weakening" | "Lagging" | "Improving";
}

interface HeatmapItem {
  sector: string;
  indexName: string;
  change1d: number;
  stockCount?: number;
  topStocks: string[];
}

const QUADRANT_COLOR: Record<string, string> = {
  Leading: "#22c55e",
  Weakening: "#f59e0b",
  Lagging: "#ef4444",
  Improving: "#22d3ee",
};

const QUADRANT_BG: Record<string, string> = {
  Leading: "bg-green-500/10 text-green-500",
  Weakening: "bg-amber-500/10 text-amber-500",
  Lagging: "bg-red-500/10 text-red-500",
  Improving: "bg-cyan-500/10 text-cyan-500",
};

const TABS = ["Heatmap", "RRG Chart", "Sector Performance", "Indices"] as const;
type Tab = (typeof TABS)[number];

function heatColor(chg: number): string {
  if (chg >= 2) return "bg-green-600/80";
  if (chg >= 1) return "bg-green-500/60";
  if (chg >= 0.3) return "bg-green-500/40";
  if (chg >= 0) return "bg-green-500/20";
  if (chg >= -0.3) return "bg-red-500/20";
  if (chg >= -1) return "bg-red-500/40";
  if (chg >= -2) return "bg-red-500/60";
  return "bg-red-700/80";
}

function HeatmapCell({ item }: { item: HeatmapItem }) {
  const chg = item.change1d;
  return (
    <div className={`rounded-lg p-3 border border-white/5 ${heatColor(chg)} flex flex-col gap-1.5 min-h-[110px]`}>
      <div className="flex items-center justify-between">
        <span className="font-bold text-sm text-white">{item.sector}</span>
      </div>
      <div className={`text-xl font-bold tabular-nums ${chg >= 0 ? "text-green-300" : "text-red-300"}`}>
        {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
      </div>
      {item.stockCount && (
        <div className="text-[10px] text-white/60">{item.stockCount} stocks</div>
      )}
      <div className="flex flex-wrap gap-1 mt-auto">
        {item.topStocks.slice(0, 3).map(s => (
          <span key={s} className="text-[9px] font-bold text-white/80 bg-white/10 rounded px-1 py-0.5">{s}</span>
        ))}
      </div>
    </div>
  );
}

// Custom RRG label dot
function RRGDot(props: { cx?: number; cy?: number; payload?: SectorPerf }) {
  const { cx = 0, cy = 0, payload } = props;
  if (!payload) return null;
  const color = QUADRANT_COLOR[payload.quadrant] ?? "#888";
  return (
    <g>
      <circle cx={cx} cy={cy} r={12} fill={color} fillOpacity={0.25} stroke={color} strokeWidth={1.5} />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={8} fill={color} fontWeight={600}>
        {payload.sector.slice(0, 5)}
      </text>
    </g>
  );
}

export default function SectorsPage() {
  const [tab, setTab] = useState<Tab>("Heatmap");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: indices = [], isLoading: indicesLoading } = useQuery<SectorIndex[]>({
    queryKey: ["market", "sector-indices"],
    queryFn: () => fetch(apiUrl("/market/sector-indices")).then(r => r.json()),
    refetchInterval: 60_000,
  });

  const { data: performance = [], isLoading: perfLoading } = useQuery<SectorPerf[]>({
    queryKey: ["market", "sector-performance"],
    queryFn: () => fetch(apiUrl("/market/sector-performance")).then(r => r.json()),
    staleTime: 10 * 60 * 1000,
  });

  const { data: heatmap = [], isLoading: heatLoading } = useQuery<HeatmapItem[]>({
    queryKey: ["market", "heatmap"],
    queryFn: () => fetch(apiUrl("/market/heatmap")).then(r => r.json()),
    staleTime: 3 * 60 * 1000,
  });

  const quadrantShifts = performance.filter(s =>
    s.quadrant === "Weakening" || s.quadrant === "Improving"
  );

  const toggleExpand = (s: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });

  return (
    <div className="space-y-5 max-w-screen-xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Globe2 className="h-5 w-5 text-primary" />
          Sectors
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Sector indices, heatmap, and rotation analysis</p>
      </div>

      {/* Quadrant shifts alert */}
      {quadrantShifts.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <span className="text-sm text-amber-400 font-medium">{quadrantShifts.length} sector quadrant shifts detected</span>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >{t}</button>
        ))}
      </div>

      {/* Heatmap tab */}
      {tab === "Heatmap" && (
        <div className="space-y-4">
          {heatLoading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {[...Array(9)].map((_, i) => <div key={i} className="h-28 rounded-lg bg-accent/40 animate-pulse" />)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {heatmap.map(item => <HeatmapCell key={item.sector} item={item} />)}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                <span className="font-medium">Color scale:</span>
                {[">+2%", "+1-2%", "0-1%", "-1-0%", "-2--1%", "<-2%"].map((l, i) => (
                  <span key={l} className="flex items-center gap-1">
                    <span className={`inline-block w-3 h-3 rounded ${["bg-green-600/80","bg-green-500/60","bg-green-500/30","bg-red-500/30","bg-red-500/60","bg-red-700/80"][i]}`} />
                    {l}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* RRG Chart tab */}
      {tab === "RRG Chart" && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
              <div>
                <h2 className="font-semibold">Relative Rotation Graph</h2>
                <p className="text-xs text-muted-foreground">Sector performance vs NIFTY 50 benchmark</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                {Object.entries(QUADRANT_COLOR).map(([q, c]) => (
                  <span key={q} className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />
                    {q}
                  </span>
                ))}
              </div>
            </div>
            {perfLoading ? (
              <div className="h-80 animate-pulse bg-accent/40 rounded-lg mt-4" />
            ) : (
              <ResponsiveContainer width="100%" height={380}>
                <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(217,33%,17%)" opacity={0.5} />
                  <XAxis type="number" dataKey="rsRatio" name="RS-Ratio" domain={["auto", "auto"]}
                    tick={{ fontSize: 10, fill: "hsl(215,20%,55%)" }} tickLine={false} label={{ value: "RS-Ratio", position: "insideBottom", offset: -10, fontSize: 11, fill: "hsl(215,20%,55%)" }} />
                  <YAxis type="number" dataKey="rsMomentum" name="RS-Momentum" domain={["auto", "auto"]}
                    tick={{ fontSize: 10, fill: "hsl(215,20%,55%)" }} tickLine={false} label={{ value: "RS-Momentum", angle: -90, position: "insideLeft", offset: 15, fontSize: 11, fill: "hsl(215,20%,55%)" }} />
                  <ReferenceLine x={100} stroke="hsl(217,33%,25%)" strokeDasharray="4 4" strokeWidth={1.5} />
                  <ReferenceLine y={100} stroke="hsl(217,33%,25%)" strokeDasharray="4 4" strokeWidth={1.5} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(222,47%,10%)", border: "1px solid hsl(217,33%,17%)", borderRadius: 6, fontSize: 11 }}
                    cursor={{ strokeDasharray: "3 3" }}
                    content={({ payload }) => {
                      if (!payload?.length) return null;
                      const d = payload[0].payload as SectorPerf;
                      return (
                        <div className="bg-card border border-border rounded-lg p-3 text-xs space-y-1">
                          <div className="font-bold" style={{ color: QUADRANT_COLOR[d.quadrant] }}>{d.sector}</div>
                          <div className="text-muted-foreground">{d.quadrant}</div>
                          <div>RS-Ratio: <span className="font-semibold">{d.rsRatio.toFixed(2)}</span></div>
                          <div>RS-Momentum: <span className="font-semibold">{d.rsMomentum.toFixed(2)}</span></div>
                          <div>1D: <span className={changeColor(d.change1d)}>{d.change1d >= 0 ? "+" : ""}{d.change1d.toFixed(2)}%</span></div>
                          <div>1M: <span className={changeColor(d.change1m)}>{d.change1m >= 0 ? "+" : ""}{d.change1m.toFixed(2)}%</span></div>
                          <div>3M: <span className={changeColor(d.change3m)}>{d.change3m >= 0 ? "+" : ""}{d.change3m.toFixed(2)}%</span></div>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={performance} shape={<RRGDot />}>
                    {performance.map((entry) => (
                      <Cell key={entry.sector} fill={QUADRANT_COLOR[entry.quadrant] ?? "#888"} />
                    ))}
                  </Scatter>
                  {/* Quadrant labels */}
                </ScatterChart>
              </ResponsiveContainer>
            )}
            {/* Quadrant labels overlay */}
            <div className="grid grid-cols-2 gap-2 mt-3">
              {(["Leading","Weakening","Improving","Lagging"] as const).map(q => (
                <div key={q} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${QUADRANT_BG[q]}`}>
                  {q}: {performance.filter(p => p.quadrant === q).map(p => p.sector).join(", ") || "None"}
                </div>
              ))}
            </div>
          </div>

          {/* Quadrant shifts */}
          {quadrantShifts.length > 0 && (
            <div className="rounded-lg border bg-card p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Quadrant Shifts
              </h3>
              <div className="space-y-2">
                {quadrantShifts.map(s => (
                  <div key={s.sector} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <div className="font-semibold text-sm">{s.sector}</div>
                      <div className="text-xs text-muted-foreground">Sector shifted quadrant this period</div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${QUADRANT_BG[s.quadrant]}`}>
                      {s.quadrant}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sector Performance tab */}
      {tab === "Sector Performance" && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <span className="font-semibold text-sm">SECTOR PERFORMANCE</span>
            <span className="text-xs text-muted-foreground">Click to expand</span>
          </div>
          {perfLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
          ) : (
            <div className="divide-y">
              {[...performance].sort((a, b) => b.change1d - a.change1d).map(s => (
                <div key={s.sector}>
                  <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors text-left"
                    onClick={() => toggleExpand(s.sector)}>
                    {expanded.has(s.sector)
                      ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">{s.sector}</div>
                      <div className="text-[10px] text-muted-foreground">{s.name}</div>
                    </div>
                    <span className={`font-bold tabular-nums text-sm ${changeColor(s.change1d)}`}>
                      {s.change1d >= 0 ? "+" : ""}{s.change1d.toFixed(2)}%
                    </span>
                  </button>
                  {expanded.has(s.sector) && (
                    <div className="px-10 py-3 bg-muted/20 grid grid-cols-3 gap-3">
                      {[["1D", s.change1d], ["1W", s.change1w], ["1M", s.change1m], ["3M", s.change3m],
                        ["RS-Ratio", s.rsRatio - 100], ["RS-Momentum", s.rsMomentum - 100]].map(([label, val]) => (
                        <div key={String(label)}>
                          <div className="text-[10px] text-muted-foreground">{label}</div>
                          <div className={`font-semibold text-sm tabular-nums ${changeColor(Number(val))}`}>
                            {Number(val) >= 0 ? "+" : ""}{Number(val).toFixed(2)}{String(label).includes("RS") ? "" : "%"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Indices tab */}
      {tab === "Indices" && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b">
            <span className="font-semibold text-sm tracking-wider uppercase">Sector Indices</span>
          </div>
          {indicesLoading ? (
            <div className="grid grid-cols-2 gap-3 p-4">
              {[...Array(10)].map((_, i) => <div key={i} className="h-20 rounded-lg bg-accent/40 animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-0 divide-x divide-y">
              {indices.map(idx => {
                const chg = idx.regularMarketChangePercent ?? 0;
                return (
                  <div key={idx.symbol} className="p-4">
                    <div className="text-xs font-medium text-muted-foreground">{idx.shortName ?? idx.sectorName}</div>
                    <div className="text-lg font-bold tabular-nums mt-1">{formatPrice(idx.regularMarketPrice)}</div>
                    <div className={`text-sm font-semibold tabular-nums ${changeColor(chg)}`}>
                      {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
