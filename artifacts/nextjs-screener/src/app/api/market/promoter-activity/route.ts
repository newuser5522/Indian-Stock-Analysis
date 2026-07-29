import { NextResponse } from "next/server";
import { fetchNseApi } from "@/lib/nse";
import { NSE_STOCKS } from "@/lib/stock-list";
import { cache } from "@/lib/cache";

export const dynamic = "force-dynamic";

interface NseTopCorpInfo {
  promoterHoldingPct?: number;
  promoterPledgedPct?: number;
  institutionalHoldingPct?: number;
  retailHoldingPct?: number;
  promoterChange?: number;
  qtrName?: string;
}

export interface PromoterRecord {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  promoterHolding: number | null;
  promoterPledged: number | null;
  institutionalHolding: number | null;
  publicHolding: number | null;
  quarterlyChange: number | null;
  trend: "buying" | "selling" | "neutral";
}

// Fetch promoter holding data for a single stock from NSE
async function fetchOnePromoterHolding(symbol: string): Promise<NseTopCorpInfo | null> {
  const nseSymbol = symbol.replace(/\.(NS|BO)$/i, "").toUpperCase();
  try {
    const data = await fetchNseApi<{ data?: NseTopCorpInfo }>(`top-corp-info?symbol=${encodeURIComponent(nseSymbol)}&market=equities`);
    return data?.data ?? null;
  } catch {
    return null;
  }
}

async function fetchPromoterActivity(): Promise<PromoterRecord[]> {
  // Use top 30 stocks by order in NSE_STOCKS (sorted by market cap)
  const topStocks = NSE_STOCKS.slice(0, 30);

  const results = await Promise.all(
    topStocks.map(async (s): Promise<PromoterRecord> => {
      const info = await fetchOnePromoterHolding(s.symbol);
      const promoterHolding = info?.promoterHoldingPct ?? null;
      const change = info?.promoterChange ?? null;
      const trend: "buying" | "selling" | "neutral" =
        change != null && change > 0.1 ? "buying"
          : change != null && change < -0.1 ? "selling"
            : "neutral";
      return {
        symbol: s.symbol,
        name: s.name,
        exchange: s.exchange,
        sector: s.sector,
        promoterHolding,
        promoterPledged: info?.promoterPledgedPct ?? null,
        institutionalHolding: info?.institutionalHoldingPct ?? null,
        publicHolding: info?.retailHoldingPct ?? null,
        quarterlyChange: change,
        trend,
      };
    })
  );

  // If NSE returned no real data for any stock, fall back to mock
  const hasRealData = results.some((r) => r.promoterHolding !== null);
  if (!hasRealData) throw new Error("NSE returned no promoter holding data");

  return results;
}

function mockPromoterActivity(): PromoterRecord[] {
  const stocks = NSE_STOCKS.slice(0, 20);
  return stocks.map((s, i) => {
    const base = 40 + Math.sin(i) * 15;
    const change = Math.cos(i * 2.3) * 1.5;
    return {
      symbol: s.symbol,
      name: s.name,
      exchange: s.exchange,
      sector: s.sector,
      promoterHolding: parseFloat(base.toFixed(2)),
      promoterPledged: parseFloat((Math.abs(Math.sin(i * 3)) * 8).toFixed(2)),
      institutionalHolding: parseFloat((25 + Math.sin(i + 1) * 10).toFixed(2)),
      publicHolding: parseFloat((100 - base - 25).toFixed(2)),
      quarterlyChange: parseFloat(change.toFixed(2)),
      trend: change > 0.1 ? "buying" : change < -0.1 ? "selling" : "neutral",
    };
  });
}

export async function GET() {
  try {
    const data = await cache.getOrSet("market:promoter-activity", fetchPromoterActivity, 15 * 60 * 1000);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(mockPromoterActivity());
  }
}
