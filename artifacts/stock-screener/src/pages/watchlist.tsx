import { useState } from "react";
import { Link } from "wouter";
import { Plus, Trash2, Eye, Search, X } from "lucide-react";
import {
  useGetWatchlist,
  useAddToWatchlist,
  useRemoveFromWatchlist,
  useSearchStocks,
  getGetWatchlistQueryKey,
  getSearchStocksQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  formatPrice,
  formatChangePercent,
  displaySymbol,
  changeBg,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

function AddStockPanel({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useSearchStocks(
    { q: query },
    {
      query: {
        queryKey: getSearchStocksQueryKey({ q: query }),
        enabled: query.length >= 2,
      },
    },
  );
  const addMutation = useAddToWatchlist({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries();
        toast({ title: "Added to watchlist" });
      },
    },
  });

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-sm">Add Stock</h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or symbol..."
          className="pl-9 text-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>
      {query.length >= 2 && (
        <div className="mt-2 max-h-60 overflow-y-auto rounded-md border divide-y divide-border">
          {isLoading && (
            <p className="p-3 text-xs text-muted-foreground">Searching...</p>
          )}
          {!isLoading && (data?.results ?? []).length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">
              No results found
            </p>
          )}
          {(data?.results ?? []).map((r) => (
            <button
              key={r.symbol}
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/60 transition-colors"
              onClick={() =>
                addMutation.mutate({
                  data: {
                    symbol: r.symbol,
                    name: r.name,
                    exchange: r.exchange,
                  },
                })
              }
            >
              <div>
                <p className="font-mono text-sm font-bold">
                  {displaySymbol(r.symbol)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.name} · {r.exchange}
                </p>
              </div>
              <Plus className="h-3.5 w-3.5 text-primary flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Watchlist() {
  const [showAdd, setShowAdd] = useState(false);
  const { data, isLoading } = useGetWatchlist({
    query: { queryKey: getGetWatchlistQueryKey(), refetchInterval: 30_000 },
  });
  const qc = useQueryClient();
  const { toast } = useToast();
  const removeMutation = useRemoveFromWatchlist({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries();
        toast({ title: "Removed from watchlist" });
      },
    },
  });

  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-screen-lg px-4 py-6 lg:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Watchlist</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {items.length} stock{items.length !== 1 ? "s" : ""} tracked
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAdd((v) => !v)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Stock
        </Button>
      </div>

      {showAdd && (
        <div className="mb-4">
          <AddStockPanel onClose={() => setShowAdd(false)} />
        </div>
      )}

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {!isLoading && items.length === 0 && !showAdd && (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <div className="rounded-full bg-muted p-5">
            <Eye className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold">Your watchlist is empty</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add stocks to monitor their prices and changes.
            </p>
          </div>
          <Button variant="outline" onClick={() => setShowAdd(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add your first stock
          </Button>
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b px-4 py-2 text-xs font-medium text-muted-foreground">
            <span>STOCK</span>
            <span className="text-right w-24">PRICE</span>
            <span className="text-right w-20">CHANGE</span>
            <span className="w-8" />
          </div>
          <div className="divide-y divide-border">
            {items.map((item) => (
              <div
                key={item.symbol}
                className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-3"
              >
                <Link
                  href={`/stock/${encodeURIComponent(item.symbol)}`}
                  className="group min-w-0"
                >
                  <p className="font-mono text-sm font-bold group-hover:text-primary transition-colors">
                    {displaySymbol(item.symbol)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.name} · {item.exchange}
                  </p>
                </Link>
                <p className="w-24 text-right font-mono text-sm tabular-nums">
                  {formatPrice(item.price)}
                </p>
                <span
                  className={cn(
                    "w-20 rounded px-1.5 py-0.5 text-right font-mono text-xs tabular-nums",
                    changeBg(item.changePercent ?? 0),
                  )}
                >
                  {formatChangePercent(item.changePercent)}
                </span>
                <button
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  onClick={() =>
                    removeMutation.mutate({
                      symbol: encodeURIComponent(item.symbol),
                    })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
