import { cache } from "@/lib/cache";
import { fetchSummary } from "@/lib/yahoo-finance";

export interface ScreenerFundamentals {
  trailingPE?: number;
  forwardPE?: number;
  priceToBook?: number;
  trailingEps?: number;
  dividendYield?: number;
  marketCap?: number;
  returnOnEquity?: number;
}

function readRaw(value: { raw?: number } | undefined): number | undefined {
  return typeof value?.raw === "number" ? value.raw : undefined;
}

function fromSummary(summary: Awaited<ReturnType<typeof fetchSummary>>): ScreenerFundamentals {
  return {
    trailingPE: readRaw(summary.summaryDetail?.trailingPE),
    forwardPE: readRaw(summary.summaryDetail?.forwardPE),
    priceToBook: readRaw(summary.defaultKeyStatistics?.priceToBook),
    trailingEps: readRaw(summary.defaultKeyStatistics?.trailingEps),
    dividendYield: readRaw(summary.summaryDetail?.dividendYield),
    marketCap:
      readRaw(summary.summaryDetail?.marketCap) ??
      readRaw(summary.price?.marketCap),
    returnOnEquity: readRaw(summary.financialData?.returnOnEquity),
  };
}

/**
 * Yahoo's chart endpoint is fast and reliable for prices, but it does not
 * include valuation fields. Fetch those fields separately and cache each
 * symbol so filter changes do not repeat the expensive request.
 */
export async function fetchScreenerFundamentals(
  symbols: string[],
): Promise<Map<string, ScreenerFundamentals>> {
  const uniqueSymbols = [...new Set(symbols)];
  const result = new Map<string, ScreenerFundamentals>();
  const batchSize = 6;

  for (let i = 0; i < uniqueSymbols.length; i += batchSize) {
    const batch = uniqueSymbols.slice(i, i + batchSize);
    const entries = await Promise.all(
      batch.map(async (symbol) => {
        const summary = await cache.getOrSet(
          `screener:fundamentals:${symbol}`,
          () => fetchSummary(symbol),
          300_000,
        );
        return [symbol, fromSummary(summary)] as const;
      }),
    );
    for (const [symbol, fundamentals] of entries) {
      result.set(symbol, fundamentals);
    }
  }

  return result;
}