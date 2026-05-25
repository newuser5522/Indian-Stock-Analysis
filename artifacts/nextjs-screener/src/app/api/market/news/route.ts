import { NextResponse } from "next/server";
import { fetchMarketNews } from "@/lib/yahoo-finance";
import { cache } from "@/lib/cache";

export async function GET() {
  try {
    const news = await cache.getOrSet("market:news", () => fetchMarketNews(30), 5 * 60 * 1000);
    return NextResponse.json(news);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
