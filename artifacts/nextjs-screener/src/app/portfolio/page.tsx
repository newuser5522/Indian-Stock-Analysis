"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Briefcase,
  Plus,
  Trash2,
  Search,
  X,
  ShieldAlert,
  Pencil,
  Check,
} from "lucide-react";
import Link from "next/link";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiUrl } from "@/lib/api-url";
import type { PortfolioRiskResponse } from "@/lib/portfolio-risk";
import PortfolioRiskDashboard from "@/components/portfolio-risk-dashboard";
import {
  formatChangePercent,
  changeColor,
  changeBg,
  displaySymbol,
} from "@/lib/format";
import { toast } from "sonner";
import { calculatePortfolioCagr } from "@/lib/portfolio-cagr";

interface Holding {
  id: number;
  symbol: string;
  name: string;
  exchange: string;
  quantity: number;
  avgPrice: number;
  purchaseDate: string | null;
  notes: string | null;
  shortName: string;
  currentPrice: number | null;
  currentValue: number | null;
  invested: number;
  pnl: number | null;
  pnlPct: number | null;
  cagr: number | null;
  regularMarketChangePercent: number | null;
  quoteUnavailable: boolean;
}

interface SearchResult {
  symbol: string;
  shortname: string;
  exchDisp: string;
  assetType: "stock" | "mutual-fund";
}
interface PortfolioGroup {
  id: number;
  name: string;
}
interface PortfolioNewsItem {
  uuid: string;
  title: string;
  publisher: string;
  link: string;
  providerPublishTime: number;
  portfolioSymbol: string;
}
interface PortfolioNewsResponse {
  items: PortfolioNewsItem[];
  unavailableSymbols: string[];
  omittedSymbols: string[];
}

const PIE_COLORS = [
  "#22d3ee",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#a78bfa",
  "#f97316",
  "#ec4899",
  "#14b8a6",
  "#3b82f6",
  "#84cc16",
];

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null) return "—";
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
function fmtL(n: number | null | undefined): string {
  if (n == null) return "—";
  const lakh = n / 100000;
  if (Math.abs(lakh) >= 100) return `₹${(n / 10000000).toFixed(2)}Cr`;
  return `₹${lakh.toFixed(2)}L`;
}

type Tab = "holdings" | "risk" | "allocation" | "news";

export default function PortfolioPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [tab, setTab] = useState<Tab>("holdings");
  const [portfolioId, setPortfolioId] = useState(1);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [editing, setEditing] = useState<Holding | null>(null);
  const [editForm, setEditForm] = useState({
    quantity: "",
    avgPrice: "",
    purchaseDate: "",
    notes: "",
  });
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchType, setSearchType] = useState<"stock" | "mutual-fund">("stock");
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [form, setForm] = useState({
    quantity: "",
    avgPrice: "",
    purchaseDate: "",
    notes: "",
  });

  const { data: portfolios = [], isError: portfoliosError } = useQuery<
    PortfolioGroup[]
  >({
    queryKey: ["portfolio-collections"],
    queryFn: async () => {
      const response = await fetch(apiUrl("/portfolio/collections"));
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Could not load portfolios");
      return body as PortfolioGroup[];
    },
  });
  useEffect(() => {
    if (
      portfolios.length > 0 &&
      !portfolios.some((portfolio) => portfolio.id === portfolioId)
    ) {
      setPortfolioId(portfolios[0].id);
    }
  }, [portfolios, portfolioId]);

  const {
    data: holdingsData,
    isLoading,
    isError: holdingsError,
    error: holdingsQueryError,
  } = useQuery<Holding[]>({
    queryKey: ["portfolio", portfolioId],
    queryFn: async () => {
      const response = await fetch(
        apiUrl(`/portfolio?portfolioId=${portfolioId}`),
      );
      const body: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : `Portfolio service unavailable (HTTP ${response.status})`;
        if (response.status === 503 && message === "Database not configured") {
          throw new Error(
            "Database not configured. Set DATABASE_URL, run `pnpm --filter @workspace/db push`, and restart the app.",
          );
        }
        throw new Error(message);
      }
      if (!Array.isArray(body)) {
        throw new Error("Portfolio API returned invalid data");
      }
      return body as Holding[];
    },
    refetchInterval: 60_000,
  });
  const holdings = holdingsData ?? [];
  const {
    data: riskData,
    isLoading: isRiskLoading,
    error: riskError,
    refetch: refetchRisk,
  } = useQuery<PortfolioRiskResponse>({
    queryKey: ["portfolio-risk", portfolioId],
    queryFn: async () => {
      const response = await fetch(
        apiUrl(`/portfolio/risk?portfolioId=${portfolioId}`),
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "Risk analytics could not be loaded");
      }
      return body as PortfolioRiskResponse;
    },
    enabled: tab === "risk" && holdings.length > 0,
    staleTime: 5 * 60_000,
    refetchInterval: tab === "risk" ? 5 * 60_000 : false,
  });

  const {
    data: portfolioNews,
    isLoading: isNewsLoading,
    isError: isNewsError,
    error: portfolioNewsError,
  } = useQuery<PortfolioNewsResponse>({
    queryKey: ["portfolio-news", portfolioId],
    queryFn: async () => {
      const response = await fetch(
        apiUrl(`/portfolio/news?portfolioId=${portfolioId}`),
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Portfolio news could not be loaded");
      return body as PortfolioNewsResponse;
    },
    enabled: tab === "news" && holdings.length > 0,
    staleTime: 5 * 60_000,
  });

  const addMutation = useMutation({
    mutationFn: async (body: object) => {
      const response = await fetch(apiUrl("/portfolio"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, portfolioId }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error ?? `Failed to add holding (HTTP ${response.status})`,
        );
      }
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolio", portfolioId] });
      qc.invalidateQueries({ queryKey: ["portfolio-risk", portfolioId] });
      qc.invalidateQueries({ queryKey: ["portfolio-news", portfolioId] });
      setShowAdd(false);
      setSelected(null);
      setForm({ quantity: "", avgPrice: "", purchaseDate: "", notes: "" });
      toast.success("Holding added");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(apiUrl(`/portfolio/${id}`), {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(
          body.error ?? `Failed to remove holding (HTTP ${response.status})`,
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolio", portfolioId] });
      qc.invalidateQueries({ queryKey: ["portfolio-risk", portfolioId] });
      qc.invalidateQueries({ queryKey: ["portfolio-news", portfolioId] });
      toast.success("Removed");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: object }) => {
      const response = await fetch(apiUrl(`/portfolio/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ?? `Failed to update holding (HTTP ${response.status})`,
        );
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolio", portfolioId] });
      qc.invalidateQueries({ queryKey: ["portfolio-risk", portfolioId] });
      qc.invalidateQueries({ queryKey: ["portfolio-news", portfolioId] });
      setEditing(null);
      toast.success("Holding updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createPortfolioMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await fetch(apiUrl("/portfolio/collections"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not create portfolio");
      return result as PortfolioGroup;
    },
    onSuccess: (portfolio) => {
      qc.invalidateQueries({ queryKey: ["portfolio-collections"] });
      setPortfolioId(portfolio.id);
      setNewPortfolioName("");
      setTab("holdings");
      toast.success(`${portfolio.name} created`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleSearch = async () => {
    if (!searchQ.trim()) return;
    try {
      const r = await fetch(
        apiUrl(
          searchType === "stock"
            ? `/stocks/search?q=${encodeURIComponent(searchQ)}`
            : `/mutual-funds/search?q=${encodeURIComponent(searchQ)}`,
        ),
      );
      const body: unknown = await r.json();
      if (!r.ok) {
        const message =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : "Search is temporarily unavailable";
        throw new Error(message);
      }
      if (!Array.isArray(body)) throw new Error("Search returned invalid data");
      if (searchType === "stock") {
        setSearchResults(
          body.flatMap((item): SearchResult[] => {
            if (
              typeof item !== "object" ||
              item === null ||
              !("symbol" in item) ||
              typeof item.symbol !== "string" ||
              !("shortname" in item) ||
              typeof item.shortname !== "string" ||
              !("exchDisp" in item) ||
              typeof item.exchDisp !== "string"
            ) {
              return [];
            }
            return [{ ...item, assetType: "stock" }];
          }),
        );
      } else {
        setSearchResults(
          body.flatMap((item): SearchResult[] => {
            if (
              typeof item !== "object" ||
              item === null ||
              !("schemeCode" in item) ||
              typeof item.schemeCode !== "number" ||
              !Number.isSafeInteger(item.schemeCode) ||
              !("schemeName" in item) ||
              typeof item.schemeName !== "string"
            ) {
              return [];
            }
            return [
              {
                symbol: String(item.schemeCode),
                shortname: item.schemeName,
                exchDisp: "Mutual fund",
                assetType: "mutual-fund",
              },
            ];
          }),
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Search failed");
    }
  };

  const handleAdd = () => {
    if (!selected || !form.quantity || !form.avgPrice)
      return toast.error("Fill all required fields");
    addMutation.mutate({
      symbol: selected.symbol,
      name: selected.shortname,
      exchange:
        selected.assetType === "mutual-fund" ? "MF" : selected.exchDisp,
      quantity: parseFloat(form.quantity),
      avgPrice: parseFloat(form.avgPrice),
      purchaseDate: form.purchaseDate || null,
      notes: form.notes || null,
    });
  };

  const handleUpdate = () => {
    if (!editing) return;
    if (!editForm.quantity || !editForm.avgPrice)
      return toast.error("Quantity and average price are required");
    updateMutation.mutate({
      id: editing.id,
      body: {
        quantity: Number(editForm.quantity),
        avgPrice: Number(editForm.avgPrice),
        purchaseDate: editForm.purchaseDate || null,
        notes: editForm.notes || null,
      },
    });
  };

  // Portfolio calculations
  const totalInvested = holdings.reduce((s, h) => s + h.invested, 0);
  const quotesComplete = holdings.every((holding) => !holding.quoteUnavailable);
  const totalCurrent = quotesComplete
    ? holdings.reduce((sum, holding) => sum + (holding.currentValue ?? 0), 0)
    : null;
  const totalPnl = totalCurrent == null ? null : totalCurrent - totalInvested;
  const totalPnlPct =
    totalPnl != null && totalInvested > 0
      ? (totalPnl / totalInvested) * 100
      : null;
  const totalCagr = quotesComplete
    ? calculatePortfolioCagr(holdings, new Date())
    : null;

  // Allocation by exchange/sector
  const allocationTotal = holdings.reduce(
    (sum, holding) => sum + (holding.currentValue ?? holding.invested),
    0,
  );
  const sectorMap: Record<string, number> = {};
  for (const h of holdings) {
    const sector = h.exchange === "MF" ? "Mutual Funds" : h.exchange || "Other";
    sectorMap[sector] =
      (sectorMap[sector] ?? 0) + (h.currentValue ?? h.invested);
  }
  const pieData = Object.entries(sectorMap).map(([name, value]) => ({
    name,
    value,
  }));

  // PnL bar chart data
  const pnlBarData = holdings
    .map((h) => ({
      name: displaySymbol(h.symbol),
      pnlPct: h.pnlPct ?? 0,
    }))
    .sort((a, b) => b.pnlPct - a.pnlPct);

  const statCard = (
    label: string,
    value: string,
    sub?: string,
    subColor?: string,
  ) => (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs font-medium text-muted-foreground mb-1">
        {label}
      </div>
      <div className="text-xl font-bold">{value}</div>
      {sub && (
        <div
          className={`text-xs mt-0.5 font-medium ${subColor ?? "text-muted-foreground"}`}
        >
          {sub}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            Portfolio
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track holdings, P&L, and risk metrics in INR
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowAdd((v) => !v)}
          disabled={holdingsError}
        >
          {showAdd ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showAdd ? "Cancel" : "Add Holding"}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
        <div className="min-w-48 flex-1">
          <label
            htmlFor="portfolio-select"
            className="mb-1 block text-xs text-muted-foreground"
          >
            Portfolio section
          </label>
          <select
            id="portfolio-select"
            value={portfolioId}
            onChange={(event) => {
              setPortfolioId(Number(event.target.value));
              setShowAdd(false);
              setEditing(null);
            }}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            {portfolios.map((portfolio) => (
              <option key={portfolio.id} value={portfolio.id}>
                {portfolio.name}
              </option>
            ))}
          </select>
        </div>
        <Input
          aria-label="New portfolio name"
          placeholder="New portfolio name"
          value={newPortfolioName}
          maxLength={60}
          onChange={(event) => setNewPortfolioName(event.target.value)}
          className="max-w-xs"
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => createPortfolioMutation.mutate(newPortfolioName)}
          disabled={
            !newPortfolioName.trim() ||
            createPortfolioMutation.isPending ||
            portfoliosError
          }
        >
          <Plus className="h-4 w-4" />
          New portfolio
        </Button>
      </div>
      {portfoliosError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          Could not load portfolio sections. Refresh the page to retry.
        </div>
      )}

      {holdingsError && (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          {holdingsQueryError instanceof Error
            ? holdingsQueryError.message
            : "Portfolio data is unavailable."}
        </div>
      )}

      {!holdingsError &&
        holdings.some((holding) => holding.quoteUnavailable) && (
          <div
            className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground"
            role="status"
          >
            Some live quotes are unavailable. Saved holdings are shown, but
            portfolio value and P&amp;L are hidden until quotes return.
          </div>
        )}

      {/* Summary cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        {statCard("Total Invested", holdingsError ? "—" : fmtL(totalInvested))}
        {statCard("Current Value", holdingsError ? "—" : fmtL(totalCurrent))}
        {statCard(
          "Total P&L",
          holdingsError ? "—" : fmtL(totalPnl),
          holdingsError || totalPnlPct == null
            ? undefined
            : `${totalPnlPct >= 0 ? "+" : ""}${fmt(totalPnlPct)}%`,
          totalPnl == null
            ? undefined
            : totalPnl >= 0
              ? "text-green-500"
              : "text-red-500",
        )}
        {statCard(
          "Portfolio CAGR",
          holdingsError
            ? "—"
            : totalCagr == null
              ? "—"
              : `${totalCagr >= 0 ? "+" : ""}${fmt(totalCagr)}%`,
          "Cash-flow adjusted · requires purchase dates",
          totalCagr == null ? undefined : changeColor(totalCagr),
        )}
        {statCard("Holdings", holdingsError ? "—" : String(holdings.length))}
      </div>

      {/* Add holding */}
      {showAdd && (
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <h2 className="font-semibold text-sm">Add a Holding</h2>
          {!selected ? (
            <>
              <div className="flex gap-2">
                <select
                  aria-label="Instrument type"
                  value={searchType}
                  onChange={(event) => {
                    setSearchType(event.target.value as "stock" | "mutual-fund");
                    setSearchResults([]);
                  }}
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="stock">Stocks</option>
                  <option value="mutual-fund">Mutual funds</option>
                </select>
                <Input
                  placeholder={
                    searchType === "stock"
                      ? "Search stock symbol or name…"
                      : "Search mutual-fund name or AMC…"
                  }
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="max-w-sm"
                />
                <Button size="sm" onClick={handleSearch}>
                  <Search className="h-4 w-4" />
                  Search
                </Button>
              </div>
              {searchResults.length > 0 && (
                <div className="rounded-lg border divide-y overflow-hidden max-w-lg">
                  {searchResults.slice(0, 6).map((r) => (
                    <button
                      key={r.symbol}
                      onClick={() => {
                        setSelected(r);
                        setSearchResults([]);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-accent/30 transition-colors"
                    >
                      <div>
                        <span className="font-semibold text-sm">
                          {r.assetType === "mutual-fund"
                            ? r.shortname
                            : displaySymbol(r.symbol)}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {r.assetType === "mutual-fund"
                            ? `Scheme ${r.symbol}`
                            : r.shortname}
                        </span>
                      </div>
                      <span className="text-xs rounded bg-secondary/60 px-2 py-0.5 text-muted-foreground">
                        {r.exchDisp}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-primary">
                  {selected.assetType === "mutual-fund"
                    ? selected.shortname
                    : displaySymbol(selected.symbol)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {selected.assetType === "mutual-fund"
                    ? `Scheme ${selected.symbol}`
                    : selected.shortname}
                </span>
                <button
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setSelected(null)}
                >
                  Change selection
                </button>
              </div>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    {selected.assetType === "mutual-fund" ? "Units *" : "Quantity *"}
                  </label>
                  <Input
                    type="number"
                    min={selected.assetType === "mutual-fund" ? "0.0001" : "0.01"}
                    step={selected.assetType === "mutual-fund" ? "0.0001" : "0.01"}
                    placeholder={
                      selected.assetType === "mutual-fund" ? "e.g. 12.345" : "e.g. 10"
                    }
                    value={form.quantity}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, quantity: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    {selected.assetType === "mutual-fund"
                      ? "Avg Buy NAV (₹) *"
                      : "Avg Buy Price (₹) *"}
                  </label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder={selected.assetType === "mutual-fund" ? "e.g. 85.25" : "e.g. 2500"}
                    value={form.avgPrice}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, avgPrice: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Purchase Date
                  </label>
                  <Input
                    type="date"
                    value={form.purchaseDate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, purchaseDate: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Notes
                  </label>
                  <Input
                    placeholder="Optional"
                    value={form.notes}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, notes: e.target.value }))
                    }
                  />
                </div>
              </div>
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={addMutation.isPending}
              >
                <Plus className="h-4 w-4" />
                Add Holding
              </Button>
            </div>
          )}
        </div>
      )}

      {editing && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="font-semibold text-sm">
            Edit {displaySymbol(editing.symbol)}
          </div>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Quantity *
              </label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={editForm.quantity}
                onChange={(event) =>
                  setEditForm((formValue) => ({
                    ...formValue,
                    quantity: event.target.value,
                  }))
                }
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Average buy price (₹) *
              </label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={editForm.avgPrice}
                onChange={(event) =>
                  setEditForm((formValue) => ({
                    ...formValue,
                    avgPrice: event.target.value,
                  }))
                }
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Purchase date
              </label>
              <Input
                type="date"
                value={editForm.purchaseDate}
                onChange={(event) =>
                  setEditForm((formValue) => ({
                    ...formValue,
                    purchaseDate: event.target.value,
                  }))
                }
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Notes
              </label>
              <Input
                value={editForm.notes}
                onChange={(event) =>
                  setEditForm((formValue) => ({
                    ...formValue,
                    notes: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleUpdate}
              disabled={updateMutation.isPending}
            >
              <Check className="h-4 w-4" />
              Save changes
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(["holdings", "risk", "allocation", "news"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "risk"
              ? "Risk Analytics"
              : t === "news"
                ? "Portfolio News"
                : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Holdings tab */}
      {tab === "holdings" && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <span className="font-semibold text-sm">Holdings</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {holdings.length} holdings
            </span>
          </div>
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Loading…
            </div>
          ) : holdingsError ? (
            <div
              className="p-8 text-center text-sm text-destructive"
              role="alert"
            >
              {holdingsQueryError instanceof Error
                ? holdingsQueryError.message
                : "Portfolio data is unavailable."}
            </div>
          ) : holdings.length === 0 ? (
            <div className="py-20 text-center">
              <Briefcase className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
              <p className="font-medium text-muted-foreground">
                No holdings yet
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {[
                      "Instrument",
                      "Units",
                      "Avg Cost",
                      "NAV / Price",
                      "Invested",
                      "Cur Value",
                      "P&L",
                      "P&L%",
                      "CAGR",
                      "Day%",
                      "",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap last:text-right"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => (
                    <tr
                      key={h.id}
                      className="border-b hover:bg-accent/30 transition-colors"
                    >
                      <td className="px-3 py-2.5">
                        {h.exchange === "MF" ? (
                          <div>
                            <div className="font-semibold text-xs">
                              {h.shortName}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              Scheme {h.symbol}
                            </div>
                          </div>
                        ) : (
                          <Link
                            href={`/stock/${encodeURIComponent(h.symbol)}`}
                            className="group"
                          >
                            <div className="font-semibold group-hover:text-primary transition-colors text-xs">
                              {displaySymbol(h.symbol)}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate max-w-25">
                              {h.shortName}
                            </div>
                          </Link>
                        )}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-xs">
                        {fmt(h.quantity, 0)}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-xs">
                        ₹{fmt(h.avgPrice)}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-xs font-semibold">
                        {h.currentPrice ? `₹${fmt(h.currentPrice)}` : "—"}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-xs text-muted-foreground">
                        ₹{fmt(h.invested, 0)}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-xs">
                        {h.currentValue ? `₹${fmt(h.currentValue, 0)}` : "—"}
                      </td>
                      <td
                        className={`px-3 py-2.5 tabular-nums text-xs font-semibold ${changeColor(h.pnl)}`}
                      >
                        {h.pnl != null
                          ? `${h.pnl >= 0 ? "+" : ""}₹${fmt(Math.abs(h.pnl), 0)}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${changeBg(h.pnlPct)}`}
                        >
                          {h.pnlPct != null
                            ? `${h.pnlPct >= 0 ? "+" : ""}${fmt(h.pnlPct)}%`
                            : "—"}
                        </span>
                      </td>
                      <td
                        className={`px-3 py-2.5 text-xs tabular-nums ${changeColor(h.cagr)}`}
                      >
                        {h.cagr == null
                          ? "—"
                          : `${h.cagr >= 0 ? "+" : ""}${fmt(h.cagr)}%`}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-xs tabular-nums ${changeColor(h.regularMarketChangePercent)}`}
                      >
                        {formatChangePercent(h.regularMarketChangePercent)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-primary"
                          aria-label={`Edit ${displaySymbol(h.symbol)}`}
                          onClick={() => {
                            setEditing(h);
                            setEditForm({
                              quantity: String(h.quantity),
                              avgPrice: String(h.avgPrice),
                              purchaseDate: h.purchaseDate?.slice(0, 10) ?? "",
                              notes: h.notes ?? "",
                            });
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-red-500"
                          onClick={() => deleteMutation.mutate(h.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Risk Analytics tab */}
      {tab === "risk" && (
        <div className="space-y-4">
          {holdings.length === 0 ? (
            <div className="py-16 text-center rounded-lg border bg-card">
              <ShieldAlert className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-muted-foreground">
                Add holdings to see risk analytics
              </p>
            </div>
          ) : (
            <>
              <PortfolioRiskDashboard
                data={riskData}
                isLoading={isRiskLoading}
                error={
                  riskError instanceof Error
                    ? riskError.message
                    : riskError
                      ? "Risk analytics could not be loaded"
                      : null
                }
                onRetry={() => void refetchRisk()}
              />

              {/* P&L bar chart */}
              {pnlBarData.length > 0 && (
                <div className="rounded-lg border bg-card p-4">
                  <h3 className="font-semibold text-sm mb-4">
                    P&L by Holding (%)
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={pnlBarData}
                      margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(217,33%,17%)"
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10, fill: "hsl(215,20%,55%)" }}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "hsl(215,20%,55%)" }}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip
                        formatter={(v: number) => [`${v.toFixed(2)}%`, "P&L"]}
                        contentStyle={{
                          backgroundColor: "hsl(222,47%,10%)",
                          border: "1px solid hsl(217,33%,17%)",
                          borderRadius: 6,
                          fontSize: 11,
                        }}
                      />
                      <Bar
                        dataKey="pnlPct"
                        radius={[4, 4, 0, 0]}
                        fill="hsl(199,89%,48%)"
                        label={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Allocation tab */}
      {tab === "allocation" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border bg-card p-4">
            <h3 className="font-semibold text-sm mb-4">Asset Allocation</h3>
            {holdings.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-xs">
                No data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => [
                      `₹${(v / 100000).toFixed(2)}L`,
                      "",
                    ]}
                    contentStyle={{
                      backgroundColor: "hsl(222,47%,10%)",
                      border: "1px solid hsl(217,33%,17%)",
                      borderRadius: 6,
                      fontSize: 11,
                    }}
                  />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="rounded-lg border bg-card p-4">
            <h3 className="font-semibold text-sm mb-4">Holdings Breakdown</h3>
            <div className="space-y-2">
              {holdings.map((h) => {
                const weight =
                  allocationTotal > 0
                    ? ((h.currentValue ?? h.invested) / allocationTotal) * 100
                    : 0;
                return (
                  <div key={h.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold">
                          {displaySymbol(h.symbol)}
                        </span>
                        <span className="text-muted-foreground">
                          {weight.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${weight}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-3 border-t space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">P&L</span>
                <span
                  className={
                    totalPnl == null
                      ? "text-muted-foreground"
                      : changeColor(totalPnl)
                  }
                >
                  {totalPnl == null
                    ? "—"
                    : `${totalPnl >= 0 ? "+" : ""}₹${fmt(totalPnl, 0)}`}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Overall Return</span>
                <span
                  className={
                    totalPnlPct == null
                      ? "text-muted-foreground"
                      : changeColor(totalPnlPct)
                  }
                >
                  {totalPnlPct == null
                    ? "—"
                    : `${totalPnlPct >= 0 ? "+" : ""}${fmt(totalPnlPct)}%`}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "news" && (
        <section className="space-y-3">
          {holdings.length === 0 ? (
            <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
              Add stocks to this portfolio to see related news.
            </div>
          ) : isNewsLoading ? (
            <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
              Loading news for portfolio stocks…
            </div>
          ) : isNewsError ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
            >
              {portfolioNewsError instanceof Error
                ? portfolioNewsError.message
                : "Portfolio news could not be loaded."}
            </div>
          ) : (
            <>
              {portfolioNews?.unavailableSymbols.length ||
              portfolioNews?.omittedSymbols.length ? (
                <div
                  role="status"
                  className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground"
                >
                  {portfolioNews.unavailableSymbols.length > 0 &&
                    `News is unavailable for ${portfolioNews.unavailableSymbols.map(displaySymbol).join(", ")}. `}
                  {portfolioNews.omittedSymbols.length > 0 &&
                    `Showing up to 40 of ${new Set(holdings.map(({ symbol }) => symbol)).size} portfolio stocks; ${portfolioNews.omittedSymbols.length} were not queried.`}
                </div>
              ) : null}
              {portfolioNews?.items.length ? (
                <div className="divide-y rounded-lg border bg-card">
                  {portfolioNews.items.map((item) => (
                    <a
                      key={item.uuid}
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-4 transition-colors hover:bg-accent/30"
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                          {displaySymbol(item.portfolioSymbol)}
                        </span>
                        <span>{item.publisher}</span>
                        <span>
                          {new Date(
                            item.providerPublishTime * 1000,
                          ).toLocaleString("en-IN")}
                        </span>
                      </div>
                      <div className="text-sm font-semibold">{item.title}</div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
                  No recent news was returned for these holdings.
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
