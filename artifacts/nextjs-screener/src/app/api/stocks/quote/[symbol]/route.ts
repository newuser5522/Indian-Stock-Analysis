import { NextRequest, NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/yahoo-finance";
import { cache } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const cacheKey = `stock:quote:${symbol}`;
  const quote = await cache.getOrSet(
    cacheKey,
    async () => {
      const quotes = await fetchQuotes([symbol]);
      return quotes[0] ?? null;
    },
    60_000
  );
  if (!quote) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(quote);
}
