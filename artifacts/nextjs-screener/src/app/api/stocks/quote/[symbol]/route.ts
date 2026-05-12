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
  return cache.getOrSet(
    cacheKey,
    async () => {
      const quotes = await fetchQuotes([symbol]);
      if (!quotes[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json(quotes[0]);
    },
    60_000
  );
}
