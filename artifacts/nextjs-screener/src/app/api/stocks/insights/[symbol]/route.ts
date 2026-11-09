import { NextRequest, NextResponse } from "next/server";
import { cache } from "@/lib/cache";
import { fetchStockInsights } from "@/lib/yahoo-finance";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  try {
    const data = await cache.getOrSet(
      `stock:insights:v2:${symbol}`,
      () => fetchStockInsights(symbol),
      300_000,
    );
    return NextResponse.json(data);
  } catch (error) {
    console.error(`Stock insights are unavailable for ${symbol}`, error);
    return NextResponse.json(
      { error: "Stock insights are temporarily unavailable" },
      { status: 502 },
    );
  }
}