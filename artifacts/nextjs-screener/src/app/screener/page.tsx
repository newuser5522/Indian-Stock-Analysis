"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpDown,
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  Columns3,
  Download,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiUrl } from "@/lib/api-url";
import {
  changeBg,
  displaySymbol,
  formatChangePercent,
  formatMarketCap,
  formatPercent,
  formatPrice,
  formatRatio,
  formatVolume,
} from "@/lib/format";
import { isFno } from "@/lib/fno-stocks";
import { addWatchlistItem } from "@/lib/watchlist-api";

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
  maxMarketCapCr: string;
  minPrice: string;
  maxPrice: string;
  minChangePct: string;
  maxChangePct: string;
  minVolume: string;
  minDividendYield: string;
  minRoePct: string;
  sortBy: string;
  sortOrder: string;
  fnoOnly: boolean;
}

interface SavedScreen {
  id: string;
  name: string;
  filters: Filters;
  searchTerm: string;
}

type ColumnId =
  | "sector"
  | "price"
  | "change"
  | "volume"
  | "marketCap"
  | "pe"
  | "pb"
  | "roe"
  | "dividend";

const STORAGE_KEY = "fintrack_saved_screener_views";
const PAGE_SIZE = 50;

const DEFAULT_FILTERS: Filters = {
  exchange: "NSE",
  sector: "",
  minPe: "",
  maxPe: "",
  minPb: "",
  maxPb: "",
  minMarketCapCr: "",
  maxMarketCapCr: "",
  minPrice: "",
  maxPrice: "",
  minChangePct: "",
  maxChangePct: "",
  minVolume: "",
  minDividendYield: "",
  minRoePct: "",
  sortBy: "marketCap",
  sortOrder: "desc",
  fnoOnly: false,
};

const SORT_OPTIONS = [
  { value: "marketCap", label: "Market Cap" },
  { value: "regularMarketChangePercent", label: "Change %" },
  { value: "regularMarketVolume", label: "Volume" },
  { value: "regularMarketPrice", label: "Price" },
  { value: "trailingPE", label: "P/E" },
  { value: "priceToBook", label: "P/B" },
  { value: "returnOnEquity", label: "ROE" },
  { value: "dividendYield", label: "Dividend Yield" },
];

const COLUMNS: { id: ColumnId; label: string }[] = [
  { id: "sector", label: "Sector" },
  { id: "price", label: "Price" },
  { id: "change", label: "Change %" },
  { id: "volume", label: "Volume" },
  { id: "marketCap", label: "Market Cap" },
  { id: "pe", label: "P/E" },
  { id: "pb", label: "P/B" },
  { id: "roe", label: "ROE" },
  { id: "dividend", label: "Dividend Yield" },
];

const DEFAULT_COLUMNS: ColumnId[] = [
  "sector",
  "price",
  "change",
  "volume",
  "marketCap",
  "pe",
  "pb",
];

const COMPARISON_METRICS: {
  label: string;
  value: (stock: ScreenerStock) => string;
}[] = [
  { label: "Price", value: (stock) => formatPrice(stock.regularMarketPrice) },
  {
    label: "Change %",
    value: (stock) => formatChangePercent(stock.regularMarketChangePercent),
  },
  {
    label: "Market Cap",
    value: (stock) =>
      stock.marketCap == null ? "—" : formatMarketCap(stock.marketCap / 1e7),
  },
  { label: "P/E", value: (stock) => formatRatio(stock.trailingPE) },
  { label: "P/B", value: (stock) => formatRatio(stock.priceToBook) },
  {
    label: "ROE",
    value: (stock) =>
      stock.returnOnEquity == null
        ? "—"
        : formatPercent(stock.returnOnEquity * 100),
  },
  {
    label: "Dividend Yield",
    value: (stock) =>
      stock.dividendYield == null
        ? "—"
        : formatPercent(stock.dividendYield * 100),
  },
  {
    label: "Volume",
    value: (stock) => formatVolume(stock.regularMarketVolume),
  },
];

const FILTER_KEYS = [
  "exchange",
  "sector",
  "minPe",
  "maxPe",
  "minPb",
  "maxPb",
  "minMarketCapCr",
  "maxMarketCapCr",
  "minPrice",
  "maxPrice",
  "minChangePct",
  "maxChangePct",
  "minVolume",
  "minDividendYield",
  "minRoePct",
  "fnoOnly",
] as const satisfies readonly (keyof Filters)[];

const FILTER_LABELS: Record<(typeof FILTER_KEYS)[number], string> = {
  exchange: "Exchange",
  sector: "Sector",
  minPe: "Min P/E",
  maxPe: "Max P/E",
  minPb: "Min P/B",
  maxPb: "Max P/B",
  minMarketCapCr: "Min MCap",
  maxMarketCapCr: "Max MCap",
  minPrice: "Min Price",
  maxPrice: "Max Price",
  minChangePct: "Min Change",
  maxChangePct: "Max Change",
  minVolume: "Min Volume",
  minDividendYield: "Min Dividend",
  minRoePct: "Min ROE",
  fnoOnly: "F&O only",
};

function isFilters(value: unknown): value is Filters {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Filters>;
  return (
    FILTER_KEYS.every((key) =>
      key === "fnoOnly"
        ? typeof candidate[key] === "boolean"
        : typeof candidate[key] === "string",
    ) &&
    typeof candidate.sortBy === "string" &&
    typeof candidate.sortOrder === "string"
  );
}

function isSavedScreen(value: unknown): value is SavedScreen {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<SavedScreen>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.searchTerm === "string" &&
    isFilters(candidate.filters)
  );
}

function csvCell(value: string | number | undefined): string {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function renderCell(stock: ScreenerStock, column: ColumnId) {
  switch (column) {
    case "sector":
      return (
        <span className="inline-block rounded-md bg-secondary/60 px-2 py-0.5 text-xs text-muted-foreground">
          {stock.sector || "Unclassified"}
        </span>
      );
    case "price":
      return formatPrice(stock.regularMarketPrice);
    case "change":
      return (
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${changeBg(stock.regularMarketChangePercent)}`}
        >
          {formatChangePercent(stock.regularMarketChangePercent)}
        </span>
      );
    case "volume":
      return formatVolume(stock.regularMarketVolume);
    case "marketCap":
      return stock.marketCap == null
        ? "—"
        : formatMarketCap(stock.marketCap / 1e7);
    case "pe":
      return formatRatio(stock.trailingPE);
    case "pb":
      return formatRatio(stock.priceToBook);
    case "roe":
      return stock.returnOnEquity == null
        ? "—"
        : formatPercent(stock.returnOnEquity * 100);
    case "dividend":
      return stock.dividendYield == null
        ? "—"
        : formatPercent(stock.dividendYield * 100);
  }
}

export default function ScreenerPage() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<Filters>(DEFAULT_FILTERS);
  const [searchTerm, setSearchTerm] = useState("");
  const [savedScreens, setSavedScreens] = useState<SavedScreen[]>([]);
  const [screenName, setScreenName] = useState("");
  const [selectedScreenId, setSelectedScreenId] = useState("");
  const [visibleColumns, setVisibleColumns] =
    useState<ColumnId[]>(DEFAULT_COLUMNS);
  const [selectedForCompare, setSelectedForCompare] = useState<ScreenerStock[]>(
    [],
  );
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const parsed: unknown = JSON.parse(saved);
      if (!Array.isArray(parsed) || !parsed.every(isSavedScreen)) {
        throw new Error("Saved screener views have an invalid format.");
      }
      setSavedScreens(parsed);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not load saved screener views.",
      );
    }
  }, []);

  const { data: sectors = [] } = useQuery<string[]>({
    queryKey: ["screener", "sectors"],
    queryFn: async () => {
      const response = await fetch(apiUrl("/screener/sectors"));
      if (!response.ok) throw new Error("Screener sectors request failed");
      return response.json();
    },
  });

  const params = new URLSearchParams();
  const numericFilters = [
    "minPe",
    "maxPe",
    "minPb",
    "maxPb",
    "minMarketCapCr",
    "maxMarketCapCr",
    "minPrice",
    "maxPrice",
    "minChangePct",
    "maxChangePct",
    "minVolume",
    "minDividendYield",
    "minRoePct",
  ] as const;
  if (applied.exchange) params.set("exchange", applied.exchange);
  if (applied.sector) params.set("sector", applied.sector);
  for (const key of numericFilters) {
    if (applied[key]) params.set(key, applied[key]);
  }
  params.set("sortBy", applied.sortBy);
  params.set("sortOrder", applied.sortOrder);
  const searchQuery = searchTerm.trim();
  if (searchQuery) params.set("search", searchQuery);

  const {
    data: screenerData,
    isLoading,
    isFetching,
    isError,
    error,
    dataUpdatedAt,
    refetch,
  } = useQuery<{ stocks: ScreenerStock[]; warning: string | null }>({
    queryKey: ["screener", "results", applied, searchQuery],
    queryFn: async () => {
      const response = await fetch(apiUrl(`/screener?${params}`));
      if (!response.ok) {
        throw new Error(
          `Screener data request failed (HTTP ${response.status})`,
        );
      }
      const data: unknown = await response.json();
      if (!Array.isArray(data)) {
        throw new Error("Screener API returned invalid data");
      }
      return {
        stocks: data as ScreenerStock[],
        warning: response.headers.get("X-Data-Warning"),
      };
    },
    staleTime: 60_000,
  });

  const results = (screenerData?.stocks ?? []).filter(
    (stock) => !applied.fnoOnly || isFno(stock.symbol),
  );
  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageResults = results.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const incompleteFundamentals = results.filter(
    (stock) =>
      stock.marketCap == null ||
      stock.trailingPE == null ||
      stock.priceToBook == null ||
      stock.returnOnEquity == null ||
      stock.dividendYield == null,
  ).length;
  const invalidRanges = (
    [
      [filters.minPe, filters.maxPe, "P/E"],
      [filters.minPb, filters.maxPb, "P/B"],
      [filters.minMarketCapCr, filters.maxMarketCapCr, "market cap"],
      [filters.minPrice, filters.maxPrice, "price"],
      [filters.minChangePct, filters.maxChangePct, "change"],
    ] as const
  ).filter(
    ([min, max]) =>
      min !== "" && max !== "" && Number.isFinite(Number(min)) &&
      Number.isFinite(Number(max)) && Number(min) > Number(max),
  );

  const addWatchlistMutation = useMutation({
    mutationFn: addWatchlistItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      toast.success("Added to watchlist");
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  const set = (key: keyof Filters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));

  const applyFilters = () => {
    if (invalidRanges.length > 0) return;
    setApplied(filters);
    setSelectedScreenId("");
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
    setSearchTerm("");
    setSelectedScreenId("");
  };

  const clearFilter = (key: (typeof FILTER_KEYS)[number]) => {
    const next = { ...applied, [key]: DEFAULT_FILTERS[key] };
    setApplied(next);
    setFilters(next);
  };

  const activeFilters = FILTER_KEYS.filter((key) => {
    const value = applied[key];
    return value !== "" && value !== false;
  });

  useEffect(() => {
    setPage(1);
  }, [applied, searchQuery]);

  const toggleSortOrder = () => {
    const next = {
      ...filters,
      sortOrder: filters.sortOrder === "asc" ? "desc" : "asc",
    };
    setFilters(next);
    setApplied(next);
  };

  const saveScreen = () => {
    const name = screenName.trim();
    if (!name) {
      toast.error("Enter a name for this saved screen.");
      return;
    }
    const saved: SavedScreen = {
      id: `${Date.now()}`,
      name,
      filters: applied,
      searchTerm,
    };
    const next = [saved, ...savedScreens];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSavedScreens(next);
      setSelectedScreenId(saved.id);
      setScreenName("");
      toast.success("Screen saved in this browser");
    } catch {
      toast.error("Could not save this screen in browser storage.");
    }
  };

  const applySavedScreen = (id: string) => {
    setSelectedScreenId(id);
    const selected = savedScreens.find((screen) => screen.id === id);
    if (!selected) return;
    setFilters(selected.filters);
    setApplied(selected.filters);
    setSearchTerm(selected.searchTerm);
  };

  const deleteSavedScreen = () => {
    if (!selectedScreenId) return;
    const next = savedScreens.filter(
      (screen) => screen.id !== selectedScreenId,
    );
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSavedScreens(next);
      setSelectedScreenId("");
      toast.success("Saved screen removed");
    } catch {
      toast.error("Could not update saved screens in browser storage.");
    }
  };

  const exportCsv = () => {
    if (results.length === 0) {
      toast.error("There are no results to export.");
      return;
    }
    const headers = [
      "Symbol",
      "Name",
      "Exchange",
      "Sector",
      "Price",
      "Change %",
      "Volume",
      "Market Cap (₹ Cr)",
      "P/E",
      "P/B",
      "ROE %",
      "Dividend Yield %",
    ];
    const rows = results.map((stock) =>
      [
        stock.symbol,
        stock.name,
        stock.exchange,
        stock.sector,
        stock.regularMarketPrice,
        stock.regularMarketChangePercent,
        stock.regularMarketVolume,
        stock.marketCap == null ? undefined : stock.marketCap / 1e7,
        stock.trailingPE,
        stock.priceToBook,
        stock.returnOnEquity == null
          ? undefined
          : stock.returnOnEquity * 100,
        stock.dividendYield == null ? undefined : stock.dividendYield * 100,
      ]
        .map(csvCell)
        .join(","),
    );
    const csv = [headers.map(csvCell).join(","), ...rows].join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `stock-screener-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const toggleColumn = (column: ColumnId) => {
    setVisibleColumns((current) =>
      current.includes(column)
        ? current.filter((item) => item !== column)
        : [...current, column],
    );
  };

  const toggleCompare = (stock: ScreenerStock) => {
    setSelectedForCompare((current) => {
      if (current.some((item) => item.symbol === stock.symbol)) {
        return current.filter((item) => item.symbol !== stock.symbol);
      }
      if (current.length >= 4) {
        toast.error("Compare up to four stocks at a time.");
        return current;
      }
      return [...current, stock];
    });
  };

  const moveColumn = (column: ColumnId, direction: -1 | 1) => {
    setVisibleColumns((current) => {
      const index = current.indexOf(column);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const labelClass = "text-xs font-medium text-muted-foreground mb-1 block";
  const selectClass =
    "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="space-y-5 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Search className="h-5 w-5 text-primary" />
          Stock Screener
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Search listed companies and combine market, valuation and quality filters.
        </p>
      </div>

      {screenerData?.warning && (
        <div
          role="status"
          className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-600 dark:text-amber-400"
        >
          {screenerData.warning}
        </div>
      )}

      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Filters</span>
        </div>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <label className={labelClass}>Exchange</label>
            <select
              value={filters.exchange}
              onChange={(event) => set("exchange", event.target.value)}
              className={selectClass}
            >
              <option value="">All</option>
              <option value="NSE">NSE</option>
              <option value="BSE">BSE</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Sector</label>
            <select
              value={filters.sector}
              onChange={(event) => set("sector", event.target.value)}
              className={selectClass}
            >
              <option value="">All Sectors</option>
              {sectors.map((sector) => (
                <option key={sector} value={sector}>
                  {sector}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Min P/E</label>
            <Input
              type="number"
              min="0"
              step="any"
              placeholder="e.g. 5"
              value={filters.minPe}
              onChange={(event) => set("minPe", event.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Max P/E</label>
            <Input
              type="number"
              min="0"
              step="any"
              placeholder="e.g. 30"
              value={filters.maxPe}
              onChange={(event) => set("maxPe", event.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Min MCap (₹Cr)</label>
            <Input
              type="number"
              min="0"
              step="any"
              placeholder="e.g. 10000"
              value={filters.minMarketCapCr}
              onChange={(event) => set("minMarketCapCr", event.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Max MCap (₹Cr)</label>
            <Input
              type="number"
              min="0"
              step="any"
              placeholder="Optional"
              value={filters.maxMarketCapCr}
              onChange={(event) => set("maxMarketCapCr", event.target.value)}
            />
          </div>
        </div>

        <details className="group rounded-md border border-border/70 px-3 py-2">
          <summary className="cursor-pointer select-none text-sm font-medium text-muted-foreground hover:text-foreground">
            More filters: price, movement, liquidity and fundamentals
          </summary>
          <div className="mt-3 grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {(
              [
                ["minPb", "Min P/B"],
                ["maxPb", "Max P/B"],
                ["minPrice", "Min Price (₹)"],
                ["maxPrice", "Max Price (₹)"],
                ["minChangePct", "Min Change (%)"],
                ["maxChangePct", "Max Change (%)"],
                ["minVolume", "Min Volume"],
                ["minDividendYield", "Min Dividend (%)"],
                ["minRoePct", "Min ROE (%)"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className={labelClass}>{label}</label>
                <Input
                  type="number"
                  step="any"
                  min={key === "minChangePct" || key === "maxChangePct" ? undefined : "0"}
                  placeholder="Optional"
                  value={filters[key]}
                  onChange={(event) => set(key, event.target.value)}
                />
              </div>
            ))}
          </div>
        </details>

        <div className="flex flex-wrap gap-2 items-end">
          <div className="w-full sm:w-44">
            <label className={labelClass}>Sort By</label>
            <select
              value={filters.sortBy}
              onChange={(event) => set("sortBy", event.target.value)}
              className={selectClass}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <Button variant="outline" size="sm" onClick={toggleSortOrder}>
            <ArrowUpDown className="h-3.5 w-3.5" />
            {applied.sortOrder === "asc" ? "Ascending" : "Descending"}
          </Button>
          <label className="flex h-9 items-center gap-2 px-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filters.fnoOnly}
              onChange={(event) => {
                const next = { ...filters, fnoOnly: event.target.checked };
                setFilters(next);
                setApplied(next);
              }}
              className="h-3.5 w-3.5 accent-cyan-400"
            />
            <span className="text-xs font-semibold text-cyan-400">
              F&amp;O Only
            </span>
          </label>
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={applyFilters} disabled={invalidRanges.length > 0}>
              Apply Filters
            </Button>
            <Button variant="outline" size="sm" onClick={resetFilters}>
              Reset
            </Button>
          </div>
        </div>
        {invalidRanges.length > 0 && (
          <p role="alert" className="text-xs text-destructive">
            Minimum {invalidRanges[0][2]} cannot be greater than its maximum.
          </p>
        )}
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1">
            <label className={labelClass}>Saved screens (stored in this browser)</label>
            <div className="flex gap-2">
              <select
                value={selectedScreenId}
                onChange={(event) => applySavedScreen(event.target.value)}
                className={selectClass}
                aria-label="Saved screens"
              >
                <option value="">Choose a saved screen</option>
                {savedScreens.map((screen) => (
                  <option key={screen.id} value={screen.id}>
                    {screen.name}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                size="icon"
                onClick={deleteSavedScreen}
                disabled={!selectedScreenId}
                aria-label="Delete saved screen"
                title="Delete saved screen"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex-1">
            <label className={labelClass}>Save current filters</label>
            <div className="flex gap-2">
              <Input
                value={screenName}
                onChange={(event) => setScreenName(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && saveScreen()}
                placeholder="e.g. Large-cap value"
                aria-label="Saved screen name"
              />
              <Button size="sm" onClick={saveScreen}>
                <BookmarkPlus className="h-4 w-4" />
                Save
              </Button>
            </div>
          </div>
        </div>
      </div>

      {selectedForCompare.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Stock comparison</h2>
              <p className="text-xs text-muted-foreground">
                Comparing selected screener values; unavailable data is shown as —.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedForCompare([])}
            >
              Clear comparison
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-150 text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-3 py-2 text-left text-xs text-muted-foreground">
                    Metric
                  </th>
                  {selectedForCompare.map((stock) => (
                    <th
                      key={stock.symbol}
                      className="px-3 py-2 text-right text-xs font-semibold"
                    >
                      <button
                        type="button"
                        onClick={() => toggleCompare(stock)}
                        className="text-primary hover:underline"
                        aria-label={`Remove ${displaySymbol(stock.symbol)} from comparison`}
                      >
                        {displaySymbol(stock.symbol)} ×
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON_METRICS.map((metric) => (
                  <tr key={metric.label} className="border-b last:border-0">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      {metric.label}
                    </th>
                    {selectedForCompare.map((stock) => (
                      <td
                        key={stock.symbol}
                        className="px-3 py-2 text-right text-xs tabular-nums"
                      >
                        {metric.value(stock)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="flex flex-col gap-3 px-4 py-3 border-b bg-card lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="text-sm font-medium">
              {isError
                ? "Screener data unavailable"
                : isLoading
                  ? "Loading stocks…"
                  : `${results.length} stocks found`}
              {isFetching && !isLoading && (
                <span className="ml-2 text-xs text-muted-foreground">
                  Updating…
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {dataUpdatedAt
                ? `Yahoo Finance · retrieved ${new Date(dataUpdatedAt).toLocaleString("en-IN")} · fetch time, not an exchange timestamp`
                : "Market data timing may vary by source"}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1 lg:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search listed stocks"
                className="h-9 pl-9"
                aria-label="Search stocks"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              title="Refresh results"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={results.length === 0}
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
            <details className="relative">
              <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-accent">
                <Columns3 className="h-3.5 w-3.5" />
                Columns
              </summary>
              <div className="absolute right-0 z-20 mt-2 w-52 rounded-md border bg-popover p-3 shadow-md">
                {COLUMNS.map((column) => (
                  <div
                    key={column.id}
                    className="flex items-center gap-2 py-1"
                  >
                    <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={visibleColumns.includes(column.id)}
                        onChange={() => toggleColumn(column.id)}
                      />
                      {column.label}
                    </label>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => moveColumn(column.id, -1)}
                      disabled={
                        !visibleColumns.includes(column.id) ||
                        visibleColumns.indexOf(column.id) === 0
                      }
                      aria-label={`Move ${column.label} column left`}
                    >
                      <ArrowLeft className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => moveColumn(column.id, 1)}
                      disabled={
                        !visibleColumns.includes(column.id) ||
                        visibleColumns.indexOf(column.id) ===
                          visibleColumns.length - 1
                      }
                      aria-label={`Move ${column.label} column right`}
                    >
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </details>
          </div>
        </div>

        {(activeFilters.length > 0 || searchQuery) && (
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
            <span className="text-xs text-muted-foreground">Active:</span>
            {activeFilters.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => clearFilter(key)}
                className="inline-flex items-center gap-1 rounded-full bg-secondary/70 px-2 py-1 text-xs hover:bg-secondary"
                aria-label={`Remove ${FILTER_LABELS[key]} filter`}
              >
                {FILTER_LABELS[key]}: {String(applied[key])}
                <X className="h-3 w-3" />
              </button>
            ))}
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="inline-flex items-center gap-1 rounded-full bg-secondary/70 px-2 py-1 text-xs hover:bg-secondary"
              >
                Search: {searchQuery} <X className="h-3 w-3" />
              </button>
            )}
            <button
              type="button"
              onClick={resetFilters}
              className="ml-auto text-xs text-primary hover:underline"
            >
              Clear all
            </button>
          </div>
        )}

        {incompleteFundamentals > 0 && !isError && !isLoading && (
          <div
            role="status"
            className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs text-amber-700 dark:text-amber-300"
          >
            {incompleteFundamentals} result
            {incompleteFundamentals === 1 ? " has" : "s have"} one or more
            unavailable fundamental fields. Missing values appear as — and are
            only excluded when you filter on that metric.
          </div>
        )}

        {isError ? (
          <div role="alert" className="py-16 text-center">
            <p className="text-amber-500 text-sm">
              {error instanceof Error
                ? error.message
                : "Screener data is unavailable."}
            </p>
            <Button
              className="mt-3"
              variant="outline"
              size="sm"
              onClick={() => refetch()}
            >
              Retry
            </Button>
          </div>
        ) : results.length === 0 && !isLoading ? (
          <div className="py-16 text-center text-sm">
            <p className="font-medium text-muted-foreground">
              No stocks match the current filters.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Remove a filter or search for a different company.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-225 text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="sticky left-0 z-20 w-12 bg-muted/30 px-2 py-2.5 text-center text-xs font-semibold text-muted-foreground">
                    Compare
                  </th>
                  <th className="sticky left-12 z-10 bg-muted/30 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Stock
                  </th>
                  {visibleColumns.map((columnId) => {
                    const column = COLUMNS.find((item) => item.id === columnId);
                    return (
                      <th
                        key={columnId}
                        className="whitespace-nowrap px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        {column?.label}
                      </th>
                    );
                  })}
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? [...Array(8)].map((_, row) => (
                      <tr key={row} className="border-b">
                        {[...Array(visibleColumns.length + 3)].map((__, cell) => (
                          <td key={cell} className="px-4 py-3">
                            <div className="h-4 animate-pulse rounded bg-accent/40" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : pageResults.map((stock) => (
                      <tr
                        key={stock.symbol}
                        className="border-b transition-colors hover:bg-accent/30"
                      >
                        <td className="sticky left-0 z-10 bg-card px-2 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedForCompare.some(
                              (item) => item.symbol === stock.symbol,
                            )}
                            onChange={() => toggleCompare(stock)}
                            aria-label={`Compare ${displaySymbol(stock.symbol)}`}
                          />
                        </td>
                        <td className="sticky left-12 z-10 bg-card px-4 py-3">
                          <Link
                            href={`/stock/${encodeURIComponent(stock.symbol)}`}
                            className="group"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold group-hover:text-primary">
                                {displaySymbol(stock.symbol)}
                              </span>
                              {isFno(stock.symbol) && (
                                <span className="rounded border border-cyan-500/30 bg-cyan-500/15 px-1 py-0.5 text-[9px] font-bold leading-none text-cyan-400">
                                  F&amp;O
                                </span>
                              )}
                            </div>
                            <div className="max-w-40 truncate text-xs text-muted-foreground">
                              {stock.name}
                            </div>
                          </Link>
                        </td>
                        {visibleColumns.map((column) => (
                          <td
                            key={column}
                            className="whitespace-nowrap px-4 py-3 text-right text-xs tabular-nums text-muted-foreground"
                          >
                            {renderCell(stock, column)}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              addWatchlistMutation.mutate(stock.symbol)
                            }
                            disabled={addWatchlistMutation.isPending}
                            title={`Add ${displaySymbol(stock.symbol)} to watchlist`}
                            aria-label={`Add ${displaySymbol(stock.symbol)} to watchlist`}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Watch
                          </Button>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}
        {!isError && results.length > PAGE_SIZE && (
          <div className="flex flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-muted-foreground">
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–
              {Math.min(currentPage * PAGE_SIZE, results.length)} of{" "}
              {results.length} stocks
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="flex items-center px-2 text-xs text-muted-foreground">
                Page {currentPage} of {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setPage((current) => Math.min(pageCount, current + 1))
                }
                disabled={currentPage === pageCount}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
