import { NextRequest, NextResponse } from "next/server";
import { fetchStockNews } from "@/lib/yahoo-finance";
import { cache } from "@/lib/cache";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  try {
    const news = await cache.getOrSet(
      `stock:news:${symbol}`,
      () => fetchStockNews(symbol, 15),
      5 * 60 * 1000
    );
    return NextResponse.json(news);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
