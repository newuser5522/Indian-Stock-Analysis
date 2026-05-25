"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Star, Plus, Trash2, Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiUrl } from "@/lib/api-url";
import { formatPrice, formatChangePercent, changeColor, changeBg, displaySymbol } from "@/lib/format";
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
  const [searchResults, setSearchResults] = useState<{ symbol: string; shortname: string; exchDisp: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const queryClient = useQueryClient();

  const { data: watchlist, isLoading } = useQuery<WatchlistItem[]>({
    queryKey: ["watchlist"],
    queryFn: () => fetch(apiUrl("/watchlist")).then((r) => r.json()),
  });

  const addMutation = useMutation({
    mutationFn: (symbol: string) =>
      fetch(apiUrl("/watchlist"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol }) }).then((r) => {
        if (!r.ok) return r.json().then((d) => Promise.reject(d));
        return r.json();
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["watchlist"] }); setSearchQuery(""); setSearchResults([]); toast.success("Added to watchlist"); },
    onError: (err: unknown) => {
      const msg = err && typeof err === "object" && "error" in err ? String((err as Record<string, unknown>).error) : "Failed to add";
      toast.error(msg);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (symbol: string) => fetch(apiUrl(`/watchlist/${encodeURIComponent(symbol)}`), { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["watchlist"] }); toast.success("Removed"); },
  });

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(apiUrl(`/stocks/search?q=${encodeURIComponent(searchQuery)}`));
      setSearchResults(await res.json());
    } catch { toast.error("Search failed"); }
    finally { setIsSearching(false); }
  };

  return (
    <div className="space-y-5 max-w-screen-xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Star className="h-5 w-5 text-primary" />
          Watchlist
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Track your favourite stocks</p>
      </div>

      {/* Add stock */}
      <div className="rounded-lg border bg-card p-4">
        <h2 className="font-semibold text-sm mb-3">Add a Stock</h2>
        <div className="flex gap-2">
          <Input
            placeholder="Search by name or symbol…"
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
          <div className="mt-3 rounded-lg border divide-y overflow-hidden">
            {searchResults.slice(0, 8).map((r) => (
              <div key={r.symbol} className="flex items-center justify-between px-3 py-2.5 bg-card hover:bg-accent/30 transition-colors">
                <div>
                  <span className="font-semibold text-sm">{displaySymbol(r.symbol)}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{r.shortname}</span>
                  <span className="ml-1.5 rounded bg-secondary/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">{r.exchDisp}</span>
                </div>
                <Button size="sm" variant="secondary" onClick={() => addMutation.mutate(r.symbol)} disabled={addMutation.isPending}>
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Watchlist */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
        ) : (watchlist ?? []).length === 0 ? (
          <div className="py-20 text-center">
            <Star className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
            <p className="font-medium text-muted-foreground">Your watchlist is empty</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Search for stocks above to add them</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stock</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Price</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Change</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Chg%</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {(watchlist ?? []).map((item) => {
                const chg = item.regularMarketChangePercent;
                return (
                  <tr key={item.symbol} className="border-b hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/stock/${encodeURIComponent(item.symbol)}`} className="group">
                        <div className="font-semibold group-hover:text-primary transition-colors">{displaySymbol(item.symbol)}</div>
                        <div className="text-xs text-muted-foreground">{item.shortName ?? ""}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold">{formatPrice(item.regularMarketPrice)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums text-sm font-medium ${changeColor(item.regularMarketChange)}`}>
                      {item.regularMarketChange != null ? `${item.regularMarketChange >= 0 ? "+" : ""}${item.regularMarketChange.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${changeBg(chg)}`}>
                        {formatChangePercent(chg)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-500 transition-colors" onClick={() => removeMutation.mutate(item.symbol)} disabled={removeMutation.isPending}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
