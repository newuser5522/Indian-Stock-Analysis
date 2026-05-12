import { NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/yahoo-finance";
import { cache } from "@/lib/cache";
import { NSE_STOCKS } from "@/lib/stock-list";

export const dynamic = "force-dynamic";

const LIQUID_SYMBOLS = NSE_STOCKS.slice(0, 50).map((s) => s.symbol);

export async function GET() {
  return cache.getOrSet(
    "market:most-active",
    async () => {
      const quotes = await fetchQuotes(LIQUID_SYMBOLS);
      const active = quotes
        .filter((q) => (q.regularMarketVolume ?? 0) > 0)
        .sort((a, b) => (b.regularMarketVolume ?? 0) - (a.regularMarketVolume ?? 0))
        .slice(0, 10);
      return NextResponse.json(active);
    },
    120_000
  );
}
