import { NextRequest, NextResponse } from "next/server";
import { fetchSummary } from "@/lib/yahoo-finance";
import { cache } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const cacheKey = `stock:fundamentals:${symbol}`;
  return cache.getOrSet(
    cacheKey,
    async () => {
      const summary = await fetchSummary(symbol);
      const data = {
        trailingPE: summary.summaryDetail?.trailingPE?.raw,
        forwardPE: summary.summaryDetail?.forwardPE?.raw,
        priceToBook: summary.defaultKeyStatistics?.priceToBook?.raw,
        trailingEps: summary.defaultKeyStatistics?.trailingEps?.raw,
        forwardEps: summary.defaultKeyStatistics?.forwardEps?.raw,
        pegRatio: summary.defaultKeyStatistics?.pegRatio?.raw,
        beta: summary.summaryDetail?.beta?.raw,
        dividendYield: summary.summaryDetail?.dividendYield?.raw,
        dividendRate: summary.summaryDetail?.dividendRate?.raw,
        payoutRatio: summary.summaryDetail?.payoutRatio?.raw,
        marketCap: summary.summaryDetail?.marketCap?.raw,
        returnOnEquity: summary.financialData?.returnOnEquity?.raw,
        returnOnAssets: summary.financialData?.returnOnAssets?.raw,
        grossMargins: summary.financialData?.grossMargins?.raw,
        operatingMargins: summary.financialData?.operatingMargins?.raw,
        profitMargins: summary.financialData?.profitMargins?.raw,
        currentRatio: summary.financialData?.currentRatio?.raw,
        debtToEquity: summary.financialData?.debtToEquity?.raw,
        revenueGrowth: summary.financialData?.revenueGrowth?.raw,
        totalRevenue: summary.financialData?.totalRevenue?.raw,
        freeCashflow: summary.financialData?.freeCashflow?.raw,
        totalCash: summary.financialData?.totalCash?.raw,
        targetMeanPrice: summary.financialData?.targetMeanPrice?.raw,
        recommendationKey: summary.financialData?.recommendationKey,
        sector: summary.assetProfile?.sector,
        industry: summary.assetProfile?.industry,
        longBusinessSummary: summary.assetProfile?.longBusinessSummary,
        country: summary.assetProfile?.country,
        fullTimeEmployees: summary.assetProfile?.fullTimeEmployees,
        website: summary.assetProfile?.website,
      };
      return NextResponse.json(data);
    },
    300_000
  );
}
