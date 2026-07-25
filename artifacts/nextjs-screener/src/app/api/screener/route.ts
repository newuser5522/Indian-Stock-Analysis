import { NextRequest, NextResponse } from "next/server";
import { fetchQuotes, searchYahoo } from "@/lib/yahoo-finance";
import { NSE_STOCKS } from "@/lib/stock-list";
import { cache } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const exchange = sp.get("exchange") ?? "";
  const sector = sp.get("sector") ?? "";
  const minPe = sp.get("minPe") ? parseFloat(sp.get("minPe")!) : null;
  const maxPe = sp.get("maxPe") ? parseFloat(sp.get("maxPe")!) : null;
  const minPb = sp.get("minPb") ? parseFloat(sp.get("minPb")!) : null;
  const maxPb = sp.get("maxPb") ? parseFloat(sp.get("maxPb")!) : null;
  const minMarketCapCr = sp.get("minMarketCapCr")
    ? parseFloat(sp.get("minMarketCapCr")!)
    : null;
  const sortBy = sp.get("sortBy") ?? "marketCap";
  const sortOrder = sp.get("sortOrder") ?? "desc";
  const limitParam = sp.get("limit");
  const limit = limitParam ? parseInt(limitParam) : null;
  const searchQuery = (sp.get("search") ?? sp.get("q") ?? "").trim();

  let stocks: Array<{
    symbol: string;
    name: string;
    exchange: string;
    sector: string;
  }> = [];

  if (searchQuery) {
    // User typed a search query — use Yahoo live search
    const searchResults = await searchYahoo(searchQuery, 200);
    stocks = searchResults
      .filter((q) => q.typeDisp === "equity" || q.typeDisp === "Equity")
      .map((q) => ({
        symbol: q.symbol,
        name: q.shortname || q.symbol,
        exchange:
          q.exchDisp === "NSE"
            ? "NSE"
            : q.exchDisp === "BSE"
              ? "BSE"
              : q.exchDisp || "",
        sector: q.sector ?? "",
      }))
      .filter((s) => {
        if (exchange && exchange !== "ALL" && s.exchange !== exchange)
          return false;
        if (sector && s.sector !== sector) return false;
        return true;
      });
  } else {
    // No search query — use the static stock list and filter by exchange/sector
    stocks = NSE_STOCKS.filter((s) => {
      if (exchange && exchange !== "ALL" && s.exchange !== exchange) return false;
      if (sector && s.sector !== sector) return false;
      return true;
    });
  }

  const symbols = stocks.map((s) => s.symbol);
  const cacheKey = `screener:quotes:${symbols.join(",")}`;

  const quotes = await cache.getOrSet(
    cacheKey,
    () => fetchQuotes(symbols),
    120_000,
  );

  const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

  const results = stocks
    .map((s) => {
      const q = quoteMap.get(s.symbol);
      return {
        symbol: s.symbol,
        name: s.name,
        exchange: s.exchange,
        sector: s.sector,
        regularMarketPrice: q?.regularMarketPrice,
        regularMarketChange: q?.regularMarketChange,
        regularMarketChangePercent: q?.regularMarketChangePercent,
        regularMarketVolume: q?.regularMarketVolume,
        marketCap: q?.marketCap,
        trailingPE: q?.trailingPE,
        priceToBook: q?.priceToBook,
        dividendYield: q?.dividendYield,
        returnOnEquity: q?.returnOnEquity,
      };
    })
    .filter((s) => {
      if (minPe !== null && (s.trailingPE == null || s.trailingPE < minPe))
        return false;
      if (maxPe !== null && (s.trailingPE == null || s.trailingPE > maxPe))
        return false;
      if (minPb !== null && (s.priceToBook == null || s.priceToBook < minPb))
        return false;
      if (maxPb !== null && (s.priceToBook == null || s.priceToBook > maxPb))
        return false;
      if (minMarketCapCr !== null) {
        const capCr = s.marketCap != null ? s.marketCap / 1e7 : null;
        if (capCr == null || capCr < minMarketCapCr) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const key = sortBy as keyof typeof a;
      const av =
        (a[key] as number | undefined) ??
        (sortOrder === "asc" ? Infinity : -Infinity);
      const bv =
        (b[key] as number | undefined) ??
        (sortOrder === "asc" ? Infinity : -Infinity);
      return sortOrder === "asc" ? av - bv : bv - av;
    });

  const pagedResults = limit ? results.slice(0, limit) : results;

  return NextResponse.json(pagedResults);
}
