import { NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/yahoo-finance";
import { cache } from "@/lib/cache";
import { NSE_STOCKS } from "@/lib/stock-list";
import { fetchScreenerFundamentals } from "@/lib/screener-fundamentals";

export const dynamic = "force-dynamic";

async function fetchAllWithQuotes() {
  const symbols = NSE_STOCKS.map(s => s.symbol);
  const quotes = await cache.getOrSet(
    "screener:all-quotes",
    () => fetchQuotes(symbols),
    120_000
  );
  const fundamentals = await fetchScreenerFundamentals(symbols);

  return quotes.map(q => {
    const stockMeta = NSE_STOCKS.find(s => s.symbol === q.symbol);
    const f = fundamentals.get(q.symbol);
    const marketCap = q.marketCap ?? f?.marketCap;
    const marketCapCr = marketCap != null ? marketCap / 1e7 : null;
    return {
      symbol: q.symbol,
      name: stockMeta?.name ?? q.shortName ?? q.symbol,
      sector: stockMeta?.sector ?? "",
      exchange: stockMeta?.exchange ?? "",
      price: q.regularMarketPrice ?? null,
      change_pct: q.regularMarketChangePercent ?? null,
      volume: q.regularMarketVolume ?? null,
      pe: q.trailingPE ?? f?.trailingPE ?? null,
      forward_pe: q.forwardPE ?? f?.forwardPE ?? null,
      pb: q.priceToBook ?? f?.priceToBook ?? null,
      market_cap: marketCapCr,
      eps: q.trailingEps ?? f?.trailingEps ?? null,
      roe: (q.returnOnEquity ?? f?.returnOnEquity) != null
        ? (q.returnOnEquity ?? f?.returnOnEquity)! * 100
        : null,
      div_yield: (q.dividendYield ?? f?.dividendYield) != null
        ? (q.dividendYield ?? f?.dividendYield)! * 100
        : null,
      week52_high: q.fiftyTwoWeekHigh ?? null,
      week52_low: q.fiftyTwoWeekLow ?? null,
    };
  });
}

export async function GET() {
  try {
    const stocks = await cache.getOrSet(
      "screener:advanced-dataset",
      () => fetchAllWithQuotes(),
      180_000
    );
    return NextResponse.json(stocks);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
