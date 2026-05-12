"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Star, Plus, Trash2, Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiUrl } from "@/lib/api-url";
import { formatPrice, formatChangePercent, changeColor, displaySymbol } from "@/lib/format";
import { toast } from "sonner";

interface WatchlistItem {
  symbol: string;
  addedAt: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  shortName?: string;
}

export default function WatchlistPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    { symbol: string; shortname: string; exchDisp: string }[]
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const queryClient = useQueryClient();

  const { data: watchlist, isLoading } = useQuery<WatchlistItem[]>({
    queryKey: ["watchlist"],
    queryFn: () => fetch(apiUrl("/watchlist")).then((r) => r.json()),
  });

  const addMutation = useMutation({
    mutationFn: (symbol: string) =>
      fetch(apiUrl("/watchlist"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      }).then((r) => {
        if (!r.ok) return r.json().then((d) => Promise.reject(d));
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      setSearchQuery("");
      setSearchResults([]);
      toast.success("Added to watchlist");
    },
    onError: (err: unknown) => {
      const msg = err && typeof err === "object" && "error" in err
        ? String((err as Record<string, unknown>).error)
        : "Failed to add";
      toast.error(msg);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (symbol: string) =>
      fetch(apiUrl(`/watchlist/${encodeURIComponent(symbol)}`), { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      toast.success("Removed from watchlist");
    },
  });

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(apiUrl(`/stocks/search?q=${encodeURIComponent(searchQuery)}`));
      const data = await res.json();
      setSearchResults(data);
    } catch {
      toast.error("Search failed");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Star className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold">Watchlist</h1>
      </div>

      {/* Add stock */}
      <div className="rounded-xl border bg-card p-4">
        <h2 className="font-semibold text-sm mb-3">Add Stock</h2>
        <div className="flex gap-2">
          <Input
            placeholder="Search by name or symbol..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="max-w-sm"
          />
          <Button size="sm" onClick={handleSearch} disabled={isSearching}>
            <Search className="h-4 w-4" />
            Search
          </Button>
        </div>

        {searchResults.length > 0 && (
          <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
            {searchResults.map((r) => (
              <div
                key={r.symbol}
                className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-secondary/50"
              >
                <div>
                  <span className="font-medium text-sm">{displaySymbol(r.symbol)}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{r.shortname}</span>
                  <span className="ml-2 text-xs text-muted-foreground">({r.exchDisp})</span>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => addMutation.mutate(r.symbol)}
                  disabled={addMutation.isPending}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Watchlist table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading watchlist...</div>
        ) : (watchlist ?? []).length === 0 ? (
          <div className="py-16 text-center">
            <Star className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">Your watchlist is empty.</p>
            <p className="text-xs text-muted-foreground mt-1">Search for stocks above to add them.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground uppercase tracking-wide">
                <th className="text-left px-4 py-3">Stock</th>
                <th className="text-right px-4 py-3">Price</th>
                <th className="text-right px-4 py-3">Change</th>
                <th className="text-right px-4 py-3">Chg%</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {(watchlist ?? []).map((item) => (
                <tr key={item.symbol} className="border-b hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/stock/${encodeURIComponent(item.symbol)}`} className="hover:text-primary">
                      <div className="font-medium">{displaySymbol(item.symbol)}</div>
                      <div className="text-xs text-muted-foreground">{item.shortName ?? ""}</div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {formatPrice(item.regularMarketPrice)}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums font-medium ${changeColor(item.regularMarketChange)}`}>
                    {item.regularMarketChange != null
                      ? `${item.regularMarketChange >= 0 ? "+" : ""}${item.regularMarketChange.toFixed(2)}`
                      : "—"}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums font-medium ${changeColor(item.regularMarketChangePercent)}`}>
                    {formatChangePercent(item.regularMarketChangePercent)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeMutation.mutate(item.symbol)}
                      disabled={removeMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
