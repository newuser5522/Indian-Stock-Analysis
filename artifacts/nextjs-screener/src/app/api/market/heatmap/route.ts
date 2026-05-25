import { NextResponse } from "next/server";
import { fetchSectorIndices, SECTOR_INDICES } from "@/lib/yahoo-finance";
import { NSE_STOCKS } from "@/lib/stock-list";
import { cache } from "@/lib/cache";

// Map sector index sectors to our stock-list sector names
const SECTOR_MAP: Record<string, string[]> = {
  Banking: ["Financial Services"],
  IT: ["Technology"],
  Auto: ["Consumer Discretionary"],
  Pharma: ["Healthcare"],
  FMCG: ["Consumer Staples"],
  Metals: ["Materials"],
  Energy: ["Energy"],
  Infrastructure: ["Industrials"],
  Realty: ["Real Estate"],
};

const TOP_STOCKS_PER_SECTOR: Record<string, string[]> = {
  Banking: ["HDFCBANK", "ICICIBANK", "SBIN", "KOTAKBANK", "AXISBANK"],
  IT: ["TCS", "INFOSYS", "HCLTECH", "WIPRO", "TECHM"],
  Auto: ["MARUTI", "TATAMOTORS", "M&M", "BAJAJ-AUTO", "EICHERMOT"],
  Pharma: ["SUNPHARMA", "DRREDDY", "CIPLA", "DIVISLAB", "APOLLOHOSP"],
  FMCG: ["HINDUNILVR", "ITC", "NESTLEIND", "BRITANNIA", "DABUR"],
  Metals: ["TATASTEEL", "JSWSTEEL", "HINDALCO", "COALINDIA", "ONGC"],
  Energy: ["RELIANCE", "ONGC", "BPCL", "COALINDIA", "NTPC"],
  Infrastructure: ["LT", "ADANIPORTS", "ADANIENT", "SIEMENS", "POWERGRID"],
  Realty: ["DLF", "GODREJPROP", "OBEROIRLTY"],
  Midcap: [],
  Smallcap: [],
};

async function buildHeatmap() {
  const indices = await fetchSectorIndices();
  return indices.map((idx) => {
    const stockListSectors = SECTOR_MAP[idx.sectorName] ?? [];
    const stocks = NSE_STOCKS.filter((s) => stockListSectors.includes(s.sector));
    const sectorInfo = SECTOR_INDICES.find((si) => si.sector === idx.sectorName);
    const topStocks = TOP_STOCKS_PER_SECTOR[idx.sectorName] ?? [];
    return {
      sector: idx.sectorName,
      indexSymbol: sectorInfo?.symbol ?? "",
      indexName: idx.shortName ?? idx.sectorName,
      change1d: idx.regularMarketChangePercent ?? 0,
      price: idx.regularMarketPrice ?? 0,
      stockCount: stocks.length > 0 ? stocks.length : undefined,
      topStocks: topStocks.slice(0, 4),
    };
  });
}

export async function GET() {
  try {
    const data = await cache.getOrSet("market:heatmap", () => buildHeatmap(), 3 * 60 * 1000);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
