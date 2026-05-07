import { useState } from "react";
import { Link } from "wouter";
import { SlidersHorizontal, ChevronUp, ChevronDown, X } from "lucide-react";
import { useScreenStocks, useGetSectors } from "@workspace/api-client-react";
import { formatPrice, formatChangePercent, formatMarketCap, formatPercent, formatRatio, displaySymbol, changeBg } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface Filters {
  exchange: string;
  sector: string;
  minMarketCap?: number;
  maxMarketCap?: number;
  minPe?: number;
  maxPe?: number;
  minPb?: number;
  maxPb?: number;
  minDividendYield?: number;
  minRoe?: number;
  sortBy: string;
  sortOrder: string;
  limit: number;
}

const DEFAULT: Filters = { exchange: "NSE", sector: "", sortBy: "marketCap", sortOrder: "desc", limit: 50 };

const SORT_OPTIONS = [
  { value: "marketCap", label: "Market Cap" },
  { value: "pe", label: "P/E Ratio" },
  { value: "pb", label: "P/B Ratio" },
  { value: "dividendYield", label: "Dividend Yield" },
  { value: "roe", label: "ROE" },
  { value: "changePercent", label: "Change %" },
  { value: "volume", label: "Volume" },
];

function NumFilter({ label, value, onChange, placeholder }: { label: string; value?: number; onChange: (v?: number) => void; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        className="h-8 text-xs"
        placeholder={placeholder ?? "Any"}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      />
    </div>
  );
}

export default function Screener() {
  const [filters, setFilters] = useState<Filters>(DEFAULT);
  const [applied, setApplied] = useState<Filters>(DEFAULT);
  const [showFilters, setShowFilters] = useState(false);

  const params: Record<string, unknown> = {
    exchange: applied.exchange,
    sortBy: applied.sortBy,
    sortOrder: applied.sortOrder,
    limit: applied.limit,
  };
  if (applied.sector) params.sector = applied.sector;
  if (applied.minMarketCap != null) params.minMarketCap = applied.minMarketCap;
  if (applied.maxMarketCap != null) params.maxMarketCap = applied.maxMarketCap;
  if (applied.minPe != null) params.minPe = applied.minPe;
  if (applied.maxPe != null) params.maxPe = applied.maxPe;
  if (applied.minPb != null) params.minPb = applied.minPb;
  if (applied.maxPb != null) params.maxPb = applied.maxPb;
  if (applied.minDividendYield != null) params.minDividendYield = applied.minDividendYield;
  if (applied.minRoe != null) params.minRoe = applied.minRoe;

  const { data, isLoading } = useScreenStocks(params as Parameters<typeof useScreenStocks>[0]);
  const { data: sectorsData } = useGetSectors();

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const applyFilters = () => setApplied(filters);
  const resetFilters = () => { setFilters(DEFAULT); setApplied(DEFAULT); };

  const stocks = data?.stocks ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-6 lg:px-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Stock Screener</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isLoading ? "Loading..." : `${total} stocks match your criteria`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={applied.sortBy} onValueChange={(v) => { setFilters((f) => ({ ...f, sortBy: v })); setApplied((f) => ({ ...f, sortBy: v })); }}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => { setFilters((f) => ({ ...f, sortOrder: f.sortOrder === "desc" ? "asc" : "desc" })); setApplied((f) => ({ ...f, sortOrder: f.sortOrder === "desc" ? "asc" : "desc" })); }}
          >
            {applied.sortOrder === "desc" ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </Button>
          <Button variant={showFilters ? "default" : "outline"} size="sm" className="h-8 gap-1.5" onClick={() => setShowFilters((v) => !v)}>
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
          </Button>
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="mb-4 rounded-lg border bg-card p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Exchange</Label>
              <Select value={filters.exchange} onValueChange={(v) => set("exchange", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NSE">NSE</SelectItem>
                  <SelectItem value="BSE">BSE</SelectItem>
                  <SelectItem value="ALL">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Sector</Label>
              <Select value={filters.sector || "ALL"} onValueChange={(v) => set("sector", v === "ALL" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All Sectors" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Sectors</SelectItem>
                  {(sectorsData?.sectors ?? []).map((s) => (
                    <SelectItem key={s.sector} value={s.sector}>{s.sector}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <NumFilter label="Min Mkt Cap (Cr)" value={filters.minMarketCap} onChange={(v) => set("minMarketCap", v)} />
            <NumFilter label="Max Mkt Cap (Cr)" value={filters.maxMarketCap} onChange={(v) => set("maxMarketCap", v)} />
            <NumFilter label="Min P/E" value={filters.minPe} onChange={(v) => set("minPe", v)} />
            <NumFilter label="Max P/E" value={filters.maxPe} onChange={(v) => set("maxPe", v)} />
            <NumFilter label="Min P/B" value={filters.minPb} onChange={(v) => set("minPb", v)} />
            <NumFilter label="Max P/B" value={filters.maxPb} onChange={(v) => set("maxPb", v)} />
            <NumFilter label="Min Div Yield (%)" value={filters.minDividendYield} onChange={(v) => set("minDividendYield", v)} />
            <NumFilter label="Min ROE (%)" value={filters.minRoe} onChange={(v) => set("minRoe", v)} />
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={applyFilters}>Apply Filters</Button>
            <Button size="sm" variant="ghost" onClick={resetFilters} className="gap-1.5"><X className="h-3.5 w-3.5" />Reset</Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="hidden md:grid md:grid-cols-[1fr_6rem_5rem_7rem_4rem_4rem_4rem_5rem] items-center gap-2 border-b px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>STOCK</span>
          <span className="text-right">PRICE</span>
          <span className="text-right">CHANGE</span>
          <span className="text-right">MKT CAP</span>
          <span className="text-right">P/E</span>
          <span className="text-right">P/B</span>
          <span className="text-right">ROE</span>
          <span className="text-right">DIV YLD</span>
        </div>
        <div className="divide-y divide-border">
          {isLoading && Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse bg-muted/30 m-1 rounded" />
          ))}
          {!isLoading && stocks.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">No stocks match your filters. Try relaxing the criteria.</p>
          )}
          {stocks.map((s) => (
            <Link
              key={s.symbol}
              href={`/stock/${encodeURIComponent(s.symbol)}`}
              className="group flex flex-col gap-1 px-4 py-2.5 transition-colors hover:bg-muted/40 md:grid md:grid-cols-[1fr_6rem_5rem_7rem_4rem_4rem_4rem_5rem] md:items-center md:gap-2"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold group-hover:text-primary transition-colors">{displaySymbol(s.symbol)}</span>
                  <span className="text-xs text-muted-foreground hidden md:inline">{s.exchange}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{s.name}</p>
              </div>
              <p className="font-mono text-sm tabular-nums text-right">{formatPrice(s.price)}</p>
              <span className={cn("rounded px-1.5 py-0.5 font-mono text-xs tabular-nums text-right", changeBg(s.changePercent))}>{formatChangePercent(s.changePercent)}</span>
              <p className="font-mono text-xs tabular-nums text-right text-muted-foreground">{s.marketCap != null ? formatMarketCap(s.marketCap) : "—"}</p>
              <p className="font-mono text-xs tabular-nums text-right">{formatRatio(s.pe)}</p>
              <p className="font-mono text-xs tabular-nums text-right">{formatRatio(s.pb)}</p>
              <p className={cn("font-mono text-xs tabular-nums text-right", s.roe != null && s.roe > 15 ? "text-emerald-400" : "")}>{formatPercent(s.roe)}</p>
              <p className="font-mono text-xs tabular-nums text-right">{formatPercent(s.dividendYield)}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
