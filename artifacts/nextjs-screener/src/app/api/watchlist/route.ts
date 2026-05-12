import { NextRequest, NextResponse } from "next/server";
import { db } from "@workspace/db";
import { watchlistTable } from "@workspace/db";
import { fetchQuotes } from "@/lib/yahoo-finance";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db.select().from(watchlistTable).orderBy(watchlistTable.addedAt);
    const symbols = rows.map((r) => r.symbol);
    if (symbols.length === 0) return NextResponse.json([]);

    const quotes = await fetchQuotes(symbols);
    const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

    const data = rows.map((r) => {
      const q = quoteMap.get(r.symbol);
      return {
        symbol: r.symbol,
        addedAt: r.addedAt,
        regularMarketPrice: q?.regularMarketPrice,
        regularMarketChange: q?.regularMarketChange,
        regularMarketChangePercent: q?.regularMarketChangePercent,
        shortName: q?.shortName,
      };
    });

    return NextResponse.json(data);
  } catch (err) {
    console.error("watchlist GET error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { symbol?: string };
    const symbol = body.symbol?.trim();
    if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

    await db.insert(watchlistTable).values({ symbol }).onConflictDoNothing();
    return NextResponse.json({ symbol }, { status: 201 });
  } catch (err) {
    console.error("watchlist POST error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
