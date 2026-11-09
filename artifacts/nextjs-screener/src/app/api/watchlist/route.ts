import { NextRequest, NextResponse } from "next/server";
import { count, db, eq, isDatabaseConfigured, sql } from "@workspace/db";
import { watchlistTable } from "@workspace/db";
import { fetchQuotes } from "@/lib/yahoo-finance";
import { getWatchlistDatabaseError } from "@/lib/watchlist-db-error";
import { readJsonBody, RequestBodyError } from "@/lib/request-body";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const rows = await db.select().from(watchlistTable).orderBy(watchlistTable.addedAt);
    const symbols = rows.map((r) => r.symbol);
    if (symbols.length === 0) return NextResponse.json([]);

    let quotes: Awaited<ReturnType<typeof fetchQuotes>> = [];
    try {
      quotes = await fetchQuotes(symbols);
    } catch (err) {
      console.error("watchlist quote fetch failed; returning saved items without quotes", err);
    }
    const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));
    const backfilledPrices = new Map<string, number>();
    await Promise.all(rows.map(async (row) => {
      if (row.addedPrice != null) return;
      const currentPrice = quoteMap.get(row.symbol)?.regularMarketPrice;
      if (currentPrice == null || !Number.isFinite(currentPrice) || currentPrice <= 0) return;
      const [updated] = await db
        .update(watchlistTable)
        .set({ addedPrice: currentPrice })
        .where(eq(watchlistTable.symbol, row.symbol))
        .returning({ addedPrice: watchlistTable.addedPrice });
      if (updated?.addedPrice != null) {
        backfilledPrices.set(row.symbol, updated.addedPrice);
      }
    }));

    const data = rows.map((r) => {
      const q = quoteMap.get(r.symbol);
      const currentPrice = q?.regularMarketPrice;
      const addedPrice = backfilledPrices.get(r.symbol) ?? r.addedPrice ?? undefined;
      const priceDiff = currentPrice != null && addedPrice != null ? currentPrice - addedPrice : undefined;
      const pricePct = priceDiff != null && addedPrice != null && addedPrice > 0
        ? (priceDiff / addedPrice) * 100
        : undefined;
      return {
        symbol: r.symbol,
        addedAt: r.addedAt,
        addedPrice,
        currentPrice,
        priceDiff,
        pricePct,
        regularMarketPrice: currentPrice,
        regularMarketChange: q?.regularMarketChange,
        regularMarketChangePercent: q?.regularMarketChangePercent,
        shortName: q?.shortName,
        quoteUnavailable: currentPrice == null,
      };
    });

    return NextResponse.json(data);
  } catch (err) {
    console.error("watchlist GET error", err);
    const failure = getWatchlistDatabaseError(err);
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      const status = error instanceof RequestBodyError ? error.status : 400;
      const message = error instanceof Error ? error.message : "Request body is invalid";
      return NextResponse.json({ error: message }, { status });
    }
    const rawSymbol =
      typeof body === "object" && body !== null && !Array.isArray(body) && "symbol" in body
        ? body.symbol
        : undefined;
    if (
      typeof rawSymbol !== "string" ||
      !/^[A-Za-z0-9.^&=_-]{1,50}$/.test(rawSymbol.trim())
    ) {
      return NextResponse.json({ error: "A valid stock symbol is required" }, { status: 400 });
    }
    const symbol = rawSymbol.trim().toUpperCase();

    let addedPrice: number | undefined;
    try {
      const quotes = await fetchQuotes([symbol]);
      addedPrice = quotes[0]?.regularMarketPrice ?? undefined;
    } catch (err) {
      console.error("watchlist add quote fetch failed; saving without an added price", err);
    }

    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(73641201)`);
      const [existing] = await tx
        .select({ id: watchlistTable.id })
        .from(watchlistTable)
        .where(eq(watchlistTable.symbol, symbol))
        .limit(1);
      if (existing) return "duplicate" as const;
      const [{ total }] = await tx.select({ total: count() }).from(watchlistTable);
      if (total >= 200) return "limit" as const;
      const [inserted] = await tx
        .insert(watchlistTable)
        .values({ symbol, name: symbol, exchange: "NSE", addedPrice })
        .onConflictDoNothing()
        .returning({ symbol: watchlistTable.symbol });
      return inserted ? "inserted" as const : "duplicate" as const;
    });
    if (outcome === "duplicate") {
      return NextResponse.json({ error: "Symbol is already in the watchlist" }, { status: 409 });
    }
    if (outcome === "limit") {
      return NextResponse.json({ error: "Watchlist limit of 200 symbols reached" }, { status: 409 });
    }
    return NextResponse.json({ symbol, quoteUnavailable: addedPrice == null }, { status: 201 });
  } catch (err) {
    console.error("watchlist POST error", err);
    const failure = getWatchlistDatabaseError(err);
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}
