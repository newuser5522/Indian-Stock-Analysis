import { NextRequest, NextResponse } from "next/server";
import { count, db, isDatabaseConfigured, sql } from "@workspace/db";
import { portfolioGroupTable, portfolioTable } from "@workspace/db/schema";
import { fetchQuotes } from "@/lib/yahoo-finance";
import { fetchMutualFundLatestNav } from "@/lib/mutual-funds";
import { validatePortfolioInput } from "@/lib/portfolio-validation";
import { readJsonBody, RequestBodyError } from "@/lib/request-body";
import { getCurrentUserId } from "@/lib/current-user";

export async function GET(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  const ownerId = await getCurrentUserId();
  if (ownerId == null) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const rawPortfolioId = req.nextUrl.searchParams.get("portfolioId") ?? "1";
    const portfolioId = Number(rawPortfolioId);
    if (!/^[1-9]\d*$/.test(rawPortfolioId) || !Number.isSafeInteger(portfolioId)) {
      return NextResponse.json({ error: "Invalid portfolioId" }, { status: 400 });
    }
    const holdings = await db
      .select()
      .from(portfolioTable)
      .where(sql`${portfolioTable.portfolioId} = ${portfolioId} AND ${portfolioTable.ownerId} = ${ownerId}`);
    if (holdings.length === 0) return NextResponse.json([]);
    const symbols = [...new Set(
      holdings
        .filter((holding) => holding.exchange !== "MF")
        .map((holding) => holding.symbol),
    )];
    let quotes: Awaited<ReturnType<typeof fetchQuotes>> = [];
    if (symbols.length > 0) {
      try {
        quotes = await fetchQuotes(symbols);
      } catch (err) {
        console.error("Portfolio stock quotes failed; returning saved holdings without quotes", err);
      }
    }
    const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));
    const mutualFundCodes = [...new Set(
      holdings
        .filter((holding) => holding.exchange === "MF")
        .map((holding) => Number(holding.symbol))
        .filter((schemeCode) => Number.isSafeInteger(schemeCode) && schemeCode > 0),
    )];
    const mutualFundNavs = new Map(
      (await Promise.all(
        mutualFundCodes.map(async (schemeCode) => {
          try {
            return [schemeCode, await fetchMutualFundLatestNav(schemeCode)] as const;
          } catch (error) {
            console.error(`Portfolio NAV fetch failed for mutual-fund scheme ${schemeCode}`, error);
            return null;
          }
        }),
      )).filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    );
    const result = holdings.map((h) => {
      const schemeCode = h.exchange === "MF" ? Number(h.symbol) : null;
      const fund = schemeCode != null ? mutualFundNavs.get(schemeCode) : undefined;
      const q = quoteMap.get(h.symbol);
      const currentPrice =
        h.exchange === "MF"
          ? fund?.latest.nav ?? null
          : q?.regularMarketPrice ?? null;
      const currentValue = currentPrice != null ? currentPrice * h.quantity : null;
      const invested = h.avgPrice * h.quantity;
      const pnl = currentValue != null ? currentValue - invested : null;
      const pnlPct = pnl != null && invested > 0 ? (pnl / invested) * 100 : null;
      let cagr: number | null = null;
      if (h.purchaseDate && currentValue != null && invested > 0) {
        const years = (Date.now() - new Date(h.purchaseDate).getTime()) / (365.25 * 24 * 3600 * 1000);
        if (years > 0.01) cagr = (Math.pow(currentValue / invested, 1 / years) - 1) * 100;
      }
      return {
        ...h,
        shortName: fund?.schemeName ?? q?.shortName ?? h.name,
        currentPrice,
        currentValue,
        invested,
        pnl,
        pnlPct,
        cagr,
        regularMarketChangePercent:
          h.exchange === "MF" ? undefined : q?.regularMarketChangePercent,
        quoteUnavailable: currentPrice == null,
      };
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch portfolio" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  const ownerId = await getCurrentUserId();
  if (ownerId == null) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      const status = error instanceof RequestBodyError ? error.status : 400;
      const message = error instanceof Error ? error.message : "Request body is invalid";
      return NextResponse.json({ error: message }, { status });
    }
    const validation = validatePortfolioInput(body);
    if ("error" in validation) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const [portfolio] = await db
      .select({ id: portfolioGroupTable.id })
      .from(portfolioGroupTable)
      .where(sql`${portfolioGroupTable.id} = ${validation.value.portfolioId} AND ${portfolioGroupTable.ownerId} = ${ownerId}`);
    if (!portfolio) {
      return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });
    }
    const inserted = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(73641202)`);
      const [{ total }] = await tx
        .select({ total: count() })
        .from(portfolioTable)
        .where(sql`${portfolioTable.portfolioId} = ${validation.value.portfolioId} AND ${portfolioTable.ownerId} = ${ownerId}`);
      if (total >= 100) return null;
      const [row] = await tx
        .insert(portfolioTable)
        .values({ ...validation.value, ownerId })
        .returning();
      return row;
    });
    if (!inserted) {
      return NextResponse.json({ error: "Portfolio limit of 100 holdings reached" }, { status: 409 });
    }
    return NextResponse.json(inserted, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to add holding" }, { status: 500 });
  }
}
