import { NextRequest, NextResponse } from "next/server";
import { db, isDatabaseConfigured, sql } from "@workspace/db";
import { portfolioTable } from "@workspace/db/schema";
import { cache } from "@/lib/cache";
import {
  fetchHistory,
  fetchIndianEquityScreenerQuotes,
  fetchQuotes,
} from "@/lib/yahoo-finance";
import { fetchMutualFundHistory, fetchMutualFundLatestNav } from "@/lib/mutual-funds";
import { buildPortfolioRisk } from "@/lib/portfolio-risk";
import { getCurrentUserId } from "@/lib/current-user";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 5 * 60 * 1000;
const HISTORY_CONCURRENCY = 5;

interface PortfolioRiskHolding {
  symbol: string;
  exchange: string;
}

function positionKey(position: PortfolioRiskHolding): string {
  return `${position.exchange}:${position.symbol.toUpperCase()}`;
}

async function fetchPositionHistories(positions: PortfolioRiskHolding[]) {
  const histories = new Map<string, Awaited<ReturnType<typeof fetchHistory>>>();
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(HISTORY_CONCURRENCY, positions.length) },
    async () => {
      while (nextIndex < positions.length) {
        const index = nextIndex++;
        const position = positions[index];
        const key = positionKey(position);
        try {
          const history =
            position.exchange === "MF"
              ? (await fetchMutualFundHistory(Number(position.symbol))).history.map(
                  (point) => ({
                    timestamp: point.timestamp,
                    open: point.nav,
                    high: point.nav,
                    low: point.nav,
                    close: point.nav,
                    volume: 0,
                  }),
                )
              : await fetchHistory(position.symbol, "1y", "1d");
          const oneYearAgo = Date.now() / 1000 - 365.25 * 24 * 60 * 60;
          histories.set(
            key,
            position.exchange === "MF"
              ? history.filter((point) => point.timestamp >= oneYearAgo)
              : history,
          );
        } catch {
          histories.set(key, []);
        }
      }
    },
  );
  await Promise.all(workers);
  return histories;
}

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
    const signature = holdings
      .map((holding) =>
        [
          holding.id,
          holding.exchange,
          holding.symbol.toUpperCase(),
          holding.quantity,
          holding.avgPrice,
        ].join(":"),
      )
      .sort()
      .join("|");

    const response = await cache.getOrSet(
      `portfolio:risk:v1:${ownerId}:${signature || "empty"}`,
      async () => {
        if (holdings.length === 0) {
          return buildPortfolioRisk([], [], new Map());
        }

        const aggregated = new Map<
          string,
          { symbol: string; name: string; exchange: string; quantity: number; invested: number }
        >();
        for (const holding of holdings) {
          const symbol = holding.symbol.toUpperCase();
          const key = positionKey(holding);
          const current = aggregated.get(key);
          const quantity = Number(holding.quantity) || 0;
          const invested = quantity * (Number(holding.avgPrice) || 0);
          if (current) {
            current.quantity += quantity;
            current.invested += invested;
          } else {
            aggregated.set(key, {
              symbol,
              name: holding.name || symbol,
              exchange: holding.exchange,
              quantity,
              invested,
            });
          }
        }

        const positions = [...aggregated.values()];
        const stockSymbols = [...new Set(
          positions
            .filter((position) => position.exchange !== "MF")
            .map((position) => position.symbol),
        )];
        const fundCodes = [...new Set(
          positions
            .filter((position) => position.exchange === "MF")
            .map((position) => Number(position.symbol))
            .filter((schemeCode) => Number.isSafeInteger(schemeCode) && schemeCode > 0),
        )];
        const [quotes, historyBySymbol, fundNavEntries, niftyHistory, allEquityQuotes] = await Promise.all([
          stockSymbols.length > 0 ? fetchQuotes(stockSymbols).catch(() => []) : Promise.resolve([]),
          fetchPositionHistories(positions),
          Promise.all(
            fundCodes.map(async (schemeCode) => {
              try {
                return [schemeCode, await fetchMutualFundLatestNav(schemeCode)] as const;
              } catch (error) {
                console.error(`Portfolio risk NAV fetch failed for scheme ${schemeCode}`, error);
                return null;
              }
            }),
          ),
          fetchHistory("^NSEI", "1y", "1d").catch(() => []),
          fetchIndianEquityScreenerQuotes().catch((error) => {
            console.warn("Portfolio sector metadata is unavailable", error);
            return null;
          }),
        ]);
        const fundNavByCode = new Map(
          fundNavEntries.filter(
            (entry): entry is NonNullable<typeof entry> => entry !== null,
          ),
        );
        const quoteBySymbol = new Map(
          quotes.map((quote) => [quote.symbol.toUpperCase(), quote]),
        );
        const riskPositions = positions.map((position) => {
          const quote = quoteBySymbol.get(position.symbol);
          const fund = position.exchange === "MF"
            ? fundNavByCode.get(Number(position.symbol))
            : undefined;
          const marketPrice =
            position.exchange === "MF"
              ? fund?.latest.nav
              : quote?.regularMarketPrice;
          const quoteAvailable =
            marketPrice != null && Number.isFinite(marketPrice) && marketPrice > 0;
          return {
            symbol: position.symbol,
            name: position.name,
            sector: position.exchange === "MF" ? "Mutual Funds" : undefined,
            currentValue: quoteAvailable
              ? marketPrice * position.quantity
              : position.invested,
            quoteAvailable,
            history: historyBySymbol.get(positionKey(position)) ?? [],
          };
        });
        const sectorsBySymbol = new Map(
          (allEquityQuotes ?? []).map((quote) => [
            quote.symbol.replace(/\.(NS|BO)$/i, "").toUpperCase(),
            quote.sector ?? "Unclassified",
          ]),
        );
        const response = buildPortfolioRisk(
          riskPositions,
          niftyHistory,
          sectorsBySymbol,
        );
        if (allEquityQuotes === null) {
          response.warnings.push("Sector classifications are unavailable; affected holdings are unclassified.");
        }
        return response;
      },
      CACHE_TTL_MS,
    );
    return NextResponse.json(response);
  } catch (error) {
    console.error("Portfolio risk analytics failed", error);
    return NextResponse.json(
      { error: "Failed to calculate portfolio risk" },
      { status: 500 },
    );
  }
}
