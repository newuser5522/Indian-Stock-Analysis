import { NextResponse } from "next/server";
import { cache } from "@/lib/cache";

const YF_BASE = "https://query1.finance.yahoo.com";

const FOREX_PAIRS = [
  { symbol: "USDINR=X", base: "USD", quote: "INR", name: "US Dollar" },
  { symbol: "EURINR=X", base: "EUR", quote: "INR", name: "Euro" },
  { symbol: "GBPINR=X", base: "GBP", quote: "INR", name: "British Pound" },
  { symbol: "JPYINR=X", base: "JPY", quote: "INR", name: "Japanese Yen" },
  { symbol: "AUDINR=X", base: "AUD", quote: "INR", name: "Australian Dollar" },
  { symbol: "CADINR=X", base: "CAD", quote: "INR", name: "Canadian Dollar" },
  { symbol: "CHFINR=X", base: "CHF", quote: "INR", name: "Swiss Franc" },
  { symbol: "CNHINR=X", base: "CNH", quote: "INR", name: "Chinese Yuan" },
  { symbol: "SGDINR=X", base: "SGD", quote: "INR", name: "Singapore Dollar" },
  { symbol: "AEDINR=X", base: "AED", quote: "INR", name: "UAE Dirham" },
];

async function fetchPair(pair: (typeof FOREX_PAIRS)[0]) {
  try {
    const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(pair.symbol)}?interval=1d&range=30d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      chart?: {
        result?: {
          meta?: { regularMarketPrice?: number; chartPreviousClose?: number; regularMarketDayHigh?: number; regularMarketDayLow?: number; regularMarketTime?: number };
          timestamp?: number[];
          indicators?: { quote?: { close?: (number | null)[] }[] };
        }[];
      };
    };
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta) return null;

    const price = meta.regularMarketPrice ?? 0;
    const prev = meta.chartPreviousClose ?? price;
    const change = price - prev;
    const changePct = prev > 0 ? (change / prev) * 100 : 0;

    // 30-day sparkline
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const timestamps = result?.timestamp ?? [];
    const sparkline = closes
      .map((c, i) => ({ t: timestamps[i], v: c }))
      .filter(p => p.v != null)
      .slice(-20)
      .map(p => p.v as number);

    return {
      symbol: pair.symbol,
      base: pair.base,
      quote: pair.quote,
      name: pair.name,
      price,
      change,
      changePct,
      high: meta.regularMarketDayHigh ?? price,
      low: meta.regularMarketDayLow ?? price,
      sparkline,
      lastUpdated: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    };
  } catch { return null; }
}

async function fetchAll() {
  const results = await Promise.all(FOREX_PAIRS.map(fetchPair));
  return results.filter(Boolean);
}

export async function GET() {
  try {
    const data = await cache.getOrSet("market:forex", () => fetchAll(), 60 * 1000);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json([]);
  }
}
