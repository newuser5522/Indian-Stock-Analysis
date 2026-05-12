"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiUrl } from "@/lib/api-url";
import {
  formatPrice,
  formatChangePercent,
  formatVolume,
  formatMarketCap,
  formatRatio,
  changeColor,
  displaySymbol,
} from "@/lib/format";

interface ScreenerStock {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  marketCap?: number;
  trailingPE?: number;
  priceToBook?: number;
  dividendYield?: number;
  returnOnEquity?: number;
}

interface Filters {
  exchange: string;
  sector: string;
  minPe: string;
  maxPe: string;
  minPb: string;
  maxPb: string;
  minMarketCapCr: string;
  sortBy: string;
  sortOrder: string;
}

const DEFAULT_FILTERS: Filters = {
  exchange: "NSE",
  sector: "",
  minPe: "",
  maxPe: "",
  minPb: "",
  maxPb: "",
  minMarketCapCr: "",
  sortBy: "marketCap",
  sortOrder: "desc",
};

const SORT_OPTIONS = [
  { value: "marketCap", label: "Market Cap" },
  { value: "regularMarketChangePercent", label: "Change %" },
  { value: "regularMarketVolume", label: "Volume" },
  { value: "trailingPE", label: "P/E" },
  { value: "priceToBook", label: "P/B" },
];

export default function ScreenerPage() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<Filters>(DEFAULT_FILTERS);

  const { data: sectors } = useQuery<string[]>({
    queryKey: ["screener", "sectors"],
    queryFn: () => fetch(apiUrl("/screener/sectors")).then((r) => r.json()),
  });

  const params = new URLSearchParams();
  if (applied.exchange) params.set("exchange", applied.exchange);
  if (applied.sector) params.set("sector", applied.sector);
  if (applied.minPe) params.set("minPe", applied.minPe);
  if (applied.maxPe) params.set("maxPe", applied.maxPe);
  if (applied.minPb) params.set("minPb", applied.minPb);
  if (applied.maxPb) params.set("maxPb", applied.maxPb);
  if (applied.minMarketCapCr) params.set("minMarketCapCr", applied.minMarketCapCr);
  params.set("sortBy", applied.sortBy);
  params.set("sortOrder", applied.sortOrder);

  const { data: results, isLoading } = useQuery<ScreenerStock[]>({
    queryKey: ["screener", "results", applied],
    queryFn: () => fetch(apiUrl(`/screener?${params}`)).then((r) => r.json()),
    staleTime: 60_000,
  });

  const set = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Search className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold">Stock Screener</h1>
      </div>

      {/* Filter panel */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2 mb-4">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold text-sm">Filters</span>
        </div>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {/* Exchange */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Exchange</label>
            <select
              value={filters.exchange}
              onChange={(e) => set("exchange", e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All</option>
              <option value="NSE">NSE</option>
              <option value="BSE">BSE</option>
            </select>
          </div>

          {/* Sector */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Sector</label>
            <select
              value={filters.sector}
              onChange={(e) => set("sector", e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All Sectors</option>
              {(sectors ?? []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Min P/E */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Min P/E</label>
            <Input
              type="number"
              placeholder="e.g. 5"
              value={filters.minPe}
              onChange={(e) => set("minPe", e.target.value)}
            />
          </div>

          {/* Max P/E */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Max P/E</label>
            <Input
              type="number"
              placeholder="e.g. 30"
              value={filters.maxPe}
              onChange={(e) => set("maxPe", e.target.value)}
            />
          </div>

          {/* Min Market Cap */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Min MCap (₹Cr)</label>
            <Input
              type="number"
              placeholder="e.g. 10000"
              value={filters.minMarketCapCr}
              onChange={(e) => set("minMarketCapCr", e.target.value)}
            />
          </div>

          {/* Sort by */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Sort By</label>
            <select
              value={filters.sortBy}
              onChange={(e) => set("sortBy", e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <Button onClick={() => setApplied(filters)} size="sm">
            Apply Filters
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFilters(DEFAULT_FILTERS);
              setApplied(DEFAULT_FILTERS);
            }}
          >
            Reset
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilters((f) => ({ ...f, sortOrder: f.sortOrder === "asc" ? "desc" : "asc" }))}
          >
            {filters.sortOrder === "asc" ? "↑ Asc" : "↓ Desc"}
          </Button>
        </div>
      </div>

      {/* Results table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm text-muted-foreground">
            {isLoading ? "Loading..." : `${(results ?? []).length} stocks`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground uppercase tracking-wide">
                <th className="text-left px-4 py-3">Stock</th>
                <th className="text-left px-4 py-3">Sector</th>
                <th className="text-right px-4 py-3">Price</th>
                <th className="text-right px-4 py-3">Chg%</th>
                <th className="text-right px-4 py-3">Volume</th>
                <th className="text-right px-4 py-3">MCap</th>
                <th className="text-right px-4 py-3">P/E</th>
                <th className="text-right px-4 py-3">P/B</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? [...Array(8)].map((_, i) => (
                    <tr key={i} className="border-b">
                      {[...Array(8)].map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 rounded bg-secondary/40 animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : (results ?? []).map((s) => (
                    <tr key={s.symbol} className="border-b hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/stock/${encodeURIComponent(s.symbol)}`} className="hover:text-primary">
                          <div className="font-medium">{displaySymbol(s.symbol)}</div>
                          <div className="text-xs text-muted-foreground">{s.name}</div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{s.sector}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {formatPrice(s.regularMarketPrice)}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums font-medium ${changeColor(s.regularMarketChangePercent)}`}>
                        {formatChangePercent(s.regularMarketChangePercent)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatVolume(s.regularMarketVolume)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {s.marketCap ? formatMarketCap((s.marketCap ?? 0) / 1e7) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatRatio(s.trailingPE)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatRatio(s.priceToBook)}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
          {!isLoading && (results ?? []).length === 0 && (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No stocks match the current filters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
