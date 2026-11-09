import { NextRequest, NextResponse } from "next/server";
import {
  fetchIndianEquityScreenerQuotes,
  fetchQuotes,
  searchYahoo,
  type YFQuote,
} from "@/lib/yahoo-finance";
import { cache } from "@/lib/cache";
import { fetchScreenerFundamentals } from "@/lib/screener-fundamentals";

export const dynamic = "force-dynamic";

type ScreenerRow = YFQuote & { exchange: string; name: string };

function compareRows(a: ScreenerRow, b: ScreenerRow, sortBy: string, order: string) {
  const left = a[sortBy as keyof ScreenerRow];
  const right = b[sortBy as keyof ScreenerRow];
  const direction = order === "asc" ? 1 : -1;

  if (left == null) return right == null ? 0 : 1;
  if (right == null) return -1;
  if (typeof left === "number" && typeof right === "number") {
    return (left - right) * direction;
  }
  return String(left).localeCompare(String(right)) * direction;
}

function matchesRange(
  value: number | undefined,
  min: number | null,
  max: number | null,
): boolean {
  const lower = min !== null && Number.isFinite(min) ? min : undefined;
  const upper = max !== null && Number.isFinite(max) ? max : undefined;
  if (lower === undefined && upper === undefined) return true;
  if (value == null || !Number.isFinite(value)) return false;
  return (
    (lower === undefined || value >= lower) &&
    (upper === undefined || value <= upper)
  );
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const exchange = sp.get("exchange") ?? "";
    const sector = sp.get("sector") ?? "";
    const minPe = sp.has("minPe") ? Number(sp.get("minPe")) : null;
    const maxPe = sp.has("maxPe") ? Number(sp.get("maxPe")) : null;
    const minPb = sp.has("minPb") ? Number(sp.get("minPb")) : null;
    const maxPb = sp.has("maxPb") ? Number(sp.get("maxPb")) : null;
    const minMarketCapCr = sp.has("minMarketCapCr")
      ? Number(sp.get("minMarketCapCr"))
      : null;
    const maxMarketCapCr = sp.has("maxMarketCapCr")
      ? Number(sp.get("maxMarketCapCr"))
      : null;
    const minPrice = sp.has("minPrice") ? Number(sp.get("minPrice")) : null;
    const maxPrice = sp.has("maxPrice") ? Number(sp.get("maxPrice")) : null;
    const minChangePct = sp.has("minChangePct")
      ? Number(sp.get("minChangePct"))
      : null;
    const maxChangePct = sp.has("maxChangePct")
      ? Number(sp.get("maxChangePct"))
      : null;
    const minVolume = sp.has("minVolume") ? Number(sp.get("minVolume")) : null;
    const minDividendYield = sp.has("minDividendYield")
      ? Number(sp.get("minDividendYield"))
      : null;
    const minRoePct = sp.has("minRoePct") ? Number(sp.get("minRoePct")) : null;
    const sortBy = sp.get("sortBy") ?? "marketCap";
    const sortOrder = sp.get("sortOrder") ?? "desc";
    const limitParam = sp.get("limit");
    const limit = limitParam ? Number.parseInt(limitParam, 10) : null;
    const searchQuery = (sp.get("search") ?? sp.get("q") ?? "").trim();

    let rows: ScreenerRow[];
    let dataWarning: string | null = null;
    if (searchQuery) {
      const searchResults = await searchYahoo(searchQuery, 200);
      const matches = searchResults
        .filter((quote) => ["equity", "Equity"].includes(quote.typeDisp ?? ""))
        .filter((quote) => ["NSE", "BSE"].includes(quote.exchDisp ?? ""))
        .map((quote) => ({
          symbol: quote.symbol,
          name: quote.shortname || quote.symbol,
          exchange: quote.exchDisp ?? "",
          sector: quote.sector ?? "",
        }));
      const symbols = matches.map((quote) => quote.symbol);
      const quotes = await cache.getOrSet(
        `screener:search-quotes:${symbols.join(",")}`,
        () => fetchQuotes(symbols),
        120_000,
      );
      const fundamentals = await fetchScreenerFundamentals(symbols);
      const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));

      rows = matches.map((match) => {
        const quote = quoteMap.get(match.symbol);
        const fundamental = fundamentals.get(match.symbol);
        return {
          ...quote,
          symbol: match.symbol,
          shortName: match.name,
          name: match.name,
          exchange: match.exchange,
          sector: match.sector || "Unclassified",
          marketCap: quote?.marketCap ?? fundamental?.marketCap,
          trailingPE: quote?.trailingPE ?? fundamental?.trailingPE,
          priceToBook: quote?.priceToBook ?? fundamental?.priceToBook,
          dividendYield: quote?.dividendYield ?? fundamental?.dividendYield,
          returnOnEquity: quote?.returnOnEquity ?? fundamental?.returnOnEquity,
        };
      });
    } else {
      const requestedExchanges: Array<"NSE" | "BSE"> =
        exchange === "NSE" || exchange === "BSE"
          ? [exchange]
          : ["NSE", "BSE"];
      const exchangeResults = await Promise.allSettled(
        requestedExchanges.map(async (requestedExchange) => ({
          exchange: requestedExchange,
          quotes: await fetchIndianEquityScreenerQuotes(requestedExchange),
        })),
      );
      const quotesByExchange: {
        exchange: "NSE" | "BSE";
        quotes: YFQuote[];
      }[] = [];
      const failedExchanges: string[] = [];
      exchangeResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          quotesByExchange.push(result.value);
        } else {
          const failedExchange = requestedExchanges[index];
          failedExchanges.push(failedExchange);
          console.warn(
            `Screener data is unavailable for ${failedExchange}`,
            result.reason,
          );
        }
      });
      if (quotesByExchange.length === 0) {
        throw new Error("No exchange listings were returned");
      }
      if (failedExchanges.length > 0) {
        const availableExchanges = quotesByExchange.map(({ exchange }) => exchange);
        dataWarning = `Could not load ${failedExchanges.join(" and ")} listings. Showing ${availableExchanges.join(" and ")} results only.`;
      }
      rows = quotesByExchange.flatMap(({ exchange: listingExchange, quotes }) =>
        quotes.map((quote) => ({
          ...quote,
          name: quote.longName ?? quote.shortName ?? quote.symbol,
          sector: quote.sector ?? "Unclassified",
          exchange: listingExchange,
        })),
      );
    }

    const results = rows
      .filter((row) => {
        if (exchange && exchange !== "ALL" && row.exchange !== exchange) return false;
        if (sector && row.sector !== sector) return false;
        const marketCapCr =
          row.marketCap == null ? undefined : row.marketCap / 1e7;
        if (!matchesRange(row.trailingPE, minPe, maxPe)) return false;
        if (!matchesRange(row.priceToBook, minPb, maxPb)) return false;
        if (!matchesRange(marketCapCr, minMarketCapCr, maxMarketCapCr)) return false;
        if (!matchesRange(row.regularMarketPrice, minPrice, maxPrice)) return false;
        if (!matchesRange(row.regularMarketChangePercent, minChangePct, maxChangePct)) return false;
        if (!matchesRange(row.regularMarketVolume, minVolume, null)) return false;
        if (
          !matchesRange(
            row.dividendYield == null ? undefined : row.dividendYield * 100,
            minDividendYield,
            null,
          )
        ) return false;
        if (
          !matchesRange(
            row.returnOnEquity == null ? undefined : row.returnOnEquity * 100,
            minRoePct,
            null,
          )
        ) return false;
        return true;
      })
      .sort((a, b) => compareRows(a, b, sortBy, sortOrder));

    return NextResponse.json(
      limit && Number.isFinite(limit) ? results.slice(0, limit) : results,
      {
        headers: dataWarning ? { "X-Data-Warning": dataWarning } : undefined,
      },
    );
  } catch (error) {
    console.error("Screener data is unavailable", error);
    return NextResponse.json(
      { error: "Screener data is temporarily unavailable" },
      { status: 502 },
    );
  }
}
