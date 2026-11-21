import { NextRequest, NextResponse } from "next/server";
import { db, isDatabaseConfigured, sql } from "@workspace/db";
import { portfolioTable } from "@workspace/db/schema";
import { cache } from "@/lib/cache";
import { fetchStockNews } from "@/lib/yahoo-finance";
import { getCurrentUserId } from "@/lib/current-user";

const NEWS_SYMBOL_LIMIT = 40;
const NEWS_CONCURRENCY = 4;

export async function GET(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  const ownerId = await getCurrentUserId();
  if (ownerId == null) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const rawPortfolioId = req.nextUrl.searchParams.get("portfolioId") ?? "1";
  const portfolioId = Number(rawPortfolioId);
  if (!/^[1-9]\d*$/.test(rawPortfolioId) || !Number.isSafeInteger(portfolioId)) {
    return NextResponse.json({ error: "Invalid portfolioId" }, { status: 400 });
  }

  try {
    const holdings = await db
      .select({
        symbol: portfolioTable.symbol,
        exchange: portfolioTable.exchange,
      })
      .from(portfolioTable)
      .where(sql`${portfolioTable.portfolioId} = ${portfolioId} AND ${portfolioTable.ownerId} = ${ownerId}`);
    const symbols = [
      ...new Set(
        holdings
          .filter(({ exchange }) => exchange !== "MF")
          .map(({ symbol }) => symbol),
      ),
    ].sort();
    const requestedSymbols = symbols.slice(0, NEWS_SYMBOL_LIMIT);
    const omittedSymbols = symbols.slice(NEWS_SYMBOL_LIMIT);
    let nextIndex = 0;
    const results = new Map<string, Awaited<ReturnType<typeof fetchStockNews>>>();
    const unavailableSymbols: string[] = [];

    await Promise.all(
      Array.from({ length: Math.min(NEWS_CONCURRENCY, requestedSymbols.length) }, async () => {
        while (nextIndex < requestedSymbols.length) {
          const symbol = requestedSymbols[nextIndex++];
          try {
            const news = await cache.getOrSet(
              `stock:news:${symbol}`,
              () => fetchStockNews(symbol, 10),
              5 * 60 * 1000,
            );
            results.set(symbol, news);
          } catch (error) {
            console.error(`Portfolio news fetch failed for ${symbol}`, error);
            unavailableSymbols.push(symbol);
          }
        }
      }),
    );

    const seen = new Set<string>();
    const items = [...results.entries()]
      .flatMap(([symbol, news]) =>
        news.map((item) => ({ ...item, portfolioSymbol: symbol })),
      )
      .filter((item) => {
        if (seen.has(item.uuid)) return false;
        seen.add(item.uuid);
        return true;
      })
      .sort((a, b) => b.providerPublishTime - a.providerPublishTime)
      .slice(0, 100);

    return NextResponse.json({ items, unavailableSymbols, omittedSymbols });
  } catch (error) {
    console.error("Portfolio news failed", error);
    return NextResponse.json({ error: "Failed to fetch portfolio news" }, { status: 500 });
  }
}
