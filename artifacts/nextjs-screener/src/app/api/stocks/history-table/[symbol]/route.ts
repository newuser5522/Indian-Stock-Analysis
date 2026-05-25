import { NextRequest, NextResponse } from "next/server";
import { fetchHistoryTable } from "@/lib/yahoo-finance";
import { cache } from "@/lib/cache";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  try {
    const data = await cache.getOrSet(
      `stock:history-table:${symbol}`,
      () => fetchHistoryTable(symbol),
      10 * 60 * 1000
    );
    return NextResponse.json(data);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
