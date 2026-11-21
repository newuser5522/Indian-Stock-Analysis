import { NextResponse } from "next/server";
import { cache } from "@/lib/cache";
import { fetchBseIndexHistories } from "@/lib/bse-indices";
import { ANALYTICS_INDEX_CATALOG } from "@/lib/index-symbols";
import { fetchNiftyIndicesHistories } from "@/lib/nifty-indices";
import { fetchNseIndexHistories } from "@/lib/nse";
import { fetchHistory } from "@/lib/yahoo-finance";

export const dynamic = "force-dynamic";

interface IndexAnalytics {
  symbol: string | null;
  exchange: "NSE" | "BSE";
  category: string;
  name: string;
  available: boolean;
  asOfDate: string | null;
  close: number | null;
  change1m: number | null;
  change3m: number | null;
  change6m: number | null;
  change1y: number | null;
  change5y: number | null;
  high5y: number | null;
  low5y: number | null;
  drawdown5y: number | null;
}

interface IndexHistoryPoint {
  timestamp: number;
  close: number;
}

function percentageChange(
  closes: number[],
  sessions: number,
): number | null {
  if (closes.length <= sessions) return null;
  const previous = closes[closes.length - sessions - 1];
  const latest = closes[closes.length - 1];
  return previous > 0 ? ((latest - previous) / previous) * 100 : null;
}

function percentageChangeOverYears(
  history: { timestamp: number; close: number }[],
  years: number,
): number | null {
  const latest = history[history.length - 1];
  if (!latest) return null;

  const targetTimestamp =
    latest.timestamp - years * 365.25 * 24 * 60 * 60;
  const comparison = history.find(
    (point) => point.timestamp >= targetTimestamp,
  );
  if (
    !comparison ||
    comparison.timestamp - targetTimestamp > 14 * 24 * 60 * 60
  ) {
    return null;
  }
  return comparison.close > 0
    ? ((latest.close - comparison.close) / comparison.close) * 100
    : null;
}

async function fetchIndexAnalytics(): Promise<IndexAnalytics[]> {
  const historyBySymbol = new Map<string, IndexHistoryPoint[]>();
  const symbols = [...new Set(ANALYTICS_INDEX_CATALOG
    .map(({ symbol }) => symbol)
    .filter((symbol): symbol is string => symbol != null))];
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(5, symbols.length) }, async () => {
    while (nextIndex < symbols.length) {
      const symbol = symbols[nextIndex++];
      try {
        historyBySymbol.set(
          symbol,
          await fetchHistory(symbol, "5y", "1d"),
        );
      } catch (error) {
        console.warn(`Index history is unavailable for ${symbol}`, error);
        historyBySymbol.set(symbol, []);
      }
    }
  }));

  const missingNseIndexes = ANALYTICS_INDEX_CATALOG.filter(
    (index) =>
      index.exchange === "NSE" &&
      (!index.symbol || historyBySymbol.get(index.symbol)?.length === 0),
  );
  const nseIndexNames = [...new Set(missingNseIndexes.map(({ name }) => name))];
  const missingBseIndexes = ANALYTICS_INDEX_CATALOG.filter(
    (index) =>
      index.exchange === "BSE" &&
      (!index.symbol || historyBySymbol.get(index.symbol)?.length === 0),
  );
  const bseIndexNames = [...new Set(missingBseIndexes.map(({ name }) => name))];
  const historyByName = new Map<string, IndexHistoryPoint[]>();
  const now = new Date();
  const from = new Date(
    Date.UTC(now.getUTCFullYear() - 5, now.getUTCMonth(), now.getUTCDate()),
  );
  const formatDate = (date: Date) =>
    `${String(date.getUTCDate()).padStart(2, "0")}-${String(
      date.getUTCMonth() + 1,
    ).padStart(2, "0")}-${date.getUTCFullYear()}`;

  await Promise.all([
    (async () => {
      if (nseIndexNames.length === 0) return;
      try {
        const histories = await fetchNiftyIndicesHistories(
          nseIndexNames,
          formatDate(from),
          formatDate(now),
        );
        for (const [name, history] of histories) {
          historyByName.set(name, history);
        }
      } catch (error) {
        console.warn("Nifty Indices history source is unavailable", error);
        try {
          const histories = await fetchNseIndexHistories(
            nseIndexNames,
            formatDate(from),
            formatDate(now),
          );
          for (const [name, history] of histories) {
            historyByName.set(name, history);
          }
        } catch (fallbackError) {
          console.warn("NSE historical index source is unavailable", fallbackError);
        }
      }
    })(),
    (async () => {
      if (bseIndexNames.length === 0) return;
      try {
        const histories = await fetchBseIndexHistories(
          bseIndexNames,
          formatDate(from),
          formatDate(now),
        );
        for (const [name, history] of histories) {
          historyByName.set(name, history);
        }
      } catch (error) {
        console.warn("BSE historical index source is unavailable", error);
      }
    })(),
  ]);

  return ANALYTICS_INDEX_CATALOG.map((index) => {
    const yahooHistory = index.symbol
      ? historyBySymbol.get(index.symbol) ?? []
      : [];
    const history =
      yahooHistory.length > 0
        ? yahooHistory
        : historyByName.get(index.name) ?? [];
    const closes = history.map((point) => point.close);
    if (history.length === 0) {
      return {
        ...index,
        available: false,
        asOfDate: null,
        close: null,
        change1m: null,
        change3m: null,
        change6m: null,
        change1y: null,
        change5y: null,
        high5y: null,
        low5y: null,
        drawdown5y: null,
      };
    }

    let peak = closes[0];
    let maxDrawdown = 0;
    for (const close of closes) {
      peak = Math.max(peak, close);
      if (peak > 0) maxDrawdown = Math.min(maxDrawdown, (close / peak - 1) * 100);
    }
    const latest = history[history.length - 1];
    return {
      ...index,
      available: true,
      asOfDate: new Date(latest.timestamp * 1000).toLocaleDateString(
        "en-CA",
        { timeZone: "Asia/Kolkata" },
      ),
      close: latest.close,
      change1m: percentageChange(closes, 21),
      change3m: percentageChange(closes, 63),
      change6m: percentageChange(closes, 126),
      change1y: percentageChange(closes, 252),
      change5y: percentageChangeOverYears(history, 5),
      high5y: Math.max(...closes),
      low5y: Math.min(...closes),
      drawdown5y: maxDrawdown,
    };
  });
}

export async function GET() {
  try {
    const data = await cache.getOrSet(
      "market:index-analytics:eod:v6",
      fetchIndexAnalytics,
      12 * 60 * 60 * 1000,
    );
    return NextResponse.json(data);
  } catch (error) {
    console.error("Index analytics are unavailable", error);
    return NextResponse.json(
      { error: "Index analytics are temporarily unavailable" },
      { status: 502 },
    );
  }
}
