import { NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/yahoo-finance";
import { cache } from "@/lib/cache";
import { INDEX_SYMBOLS } from "@/lib/stock-list";

export const dynamic = "force-dynamic";

export async function GET() {
  return cache.getOrSet(
    "market:overview",
    async () => {
      const symbols = INDEX_SYMBOLS.map((i) => i.symbol);
      const quotes = await fetchQuotes(symbols);
      const data = quotes.map((q) => ({
        ...q,
        name: INDEX_SYMBOLS.find((i) => i.symbol === q.symbol)?.name ?? q.shortName ?? q.symbol,
      }));
      return NextResponse.json(data);
    },
    60_000
  );
}
