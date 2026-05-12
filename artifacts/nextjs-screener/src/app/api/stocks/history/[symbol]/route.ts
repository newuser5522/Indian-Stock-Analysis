import { NextRequest, NextResponse } from "next/server";
import { fetchHistory } from "@/lib/yahoo-finance";
import { cache } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const period = req.nextUrl.searchParams.get("period") ?? "1mo";
  const interval = req.nextUrl.searchParams.get("interval") ?? "1d";

  const cacheKey = `stock:history:${symbol}:${period}:${interval}`;
  return cache.getOrSet(
    cacheKey,
    async () => {
      const data = await fetchHistory(symbol, period, interval);
      return NextResponse.json(data);
    },
    60_000
  );
}
