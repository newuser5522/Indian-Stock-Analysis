import { NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/yahoo-finance";
import { cache } from "@/lib/cache";
import { NSE_STOCKS } from "@/lib/stock-list";

export const dynamic = "force-dynamic";

const LIQUID_SYMBOLS = NSE_STOCKS.slice(0, 50).map((s) => s.symbol);

export async function GET() {
  const losers = await cache.getOrSet(
    "market:top-losers",
    async () => {
      const quotes = await fetchQuotes(LIQUID_SYMBOLS);
      return quotes
        .filter((q) => (q.regularMarketChangePercent ?? 0) < 0)
        .sort((a, b) => (a.regularMarketChangePercent ?? 0) - (b.regularMarketChangePercent ?? 0))
        .slice(0, 10);
    },
    120_000
  );
  return NextResponse.json(losers);
}
