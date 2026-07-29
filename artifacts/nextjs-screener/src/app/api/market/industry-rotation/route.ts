import { NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/yahoo-finance";
import { fetchSectorPerformance } from "@/lib/yahoo-finance";
import { NSE_STOCKS } from "@/lib/stock-list";
import { cache } from "@/lib/cache";

export const dynamic = "force-dynamic";

export interface IndustryRotationSector {
  sector: string;
  stockCount: number;
  advances: number;
  declines: number;
  unchanged: number;
  adRatio: number;
  avgChange1d: number;
  strongUp: number;  // stocks > +3%
  strongDown: number; // stocks < -3%
  topStock: string;
  topStockChange: number;
  worstStock: string;
  worstStockChange: number;
  // From sector performance (RRG data)
  change1w: number;
  change1m: number;
  change3m: number;
  rsRatio: number;
  rsMomentum: number;
  quadrant: "Leading" | "Weakening" | "Lagging" | "Improving";
  momentum: "accelerating" | "decelerating" | "stable";
}

async function computeIndustryRotation(): Promise<IndustryRotationSector[]> {
  const symbols = NSE_STOCKS.map((s) => s.symbol);

  const [quotes, sectorPerf] = await Promise.all([
    fetchQuotes(symbols),
    fetchSectorPerformance(),
  ]);

  const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));
  const sectorPerfMap = new Map(sectorPerf.map((sp) => [sp.sector, sp]));

  // Group stocks by sector
  const sectorMap = new Map<string, typeof NSE_STOCKS>();
  for (const stock of NSE_STOCKS) {
    const arr = sectorMap.get(stock.sector) ?? [];
    arr.push(stock);
    sectorMap.set(stock.sector, arr);
  }

  const result: IndustryRotationSector[] = [];

  for (const [sector, stocks] of sectorMap) {
    let advances = 0, declines = 0, unchanged = 0, strongUp = 0, strongDown = 0;
    let totalChange = 0, validCount = 0;
    let topStock = "", topChange = -Infinity, worstStock = "", worstChange = Infinity;

    for (const stock of stocks) {
      const q = quoteMap.get(stock.symbol);
      if (!q) continue;
      const chg = q.regularMarketChangePercent ?? 0;
      totalChange += chg;
      validCount++;
      if (chg > 0) advances++;
      else if (chg < 0) declines++;
      else unchanged++;
      if (chg >= 3) strongUp++;
      if (chg <= -3) strongDown++;
      if (chg > topChange) { topChange = chg; topStock = stock.name; }
      if (chg < worstChange) { worstChange = chg; worstStock = stock.name; }
    }

    const avgChange1d = validCount > 0 ? parseFloat((totalChange / validCount).toFixed(3)) : 0;
    const adRatio = declines > 0 ? parseFloat((advances / declines).toFixed(2)) : advances;
    const sp = sectorPerfMap.get(sector);

    // Momentum: compare 1d vs 1w trend
    const momentum: "accelerating" | "decelerating" | "stable" = sp
      ? avgChange1d > sp.change1w / 5 ? "accelerating"
        : avgChange1d < sp.change1w / 5 ? "decelerating"
          : "stable"
      : "stable";

    result.push({
      sector,
      stockCount: stocks.length,
      advances,
      declines,
      unchanged,
      adRatio,
      avgChange1d,
      strongUp,
      strongDown,
      topStock,
      topStockChange: topChange === -Infinity ? 0 : parseFloat(topChange.toFixed(2)),
      worstStock,
      worstStockChange: worstChange === Infinity ? 0 : parseFloat(worstChange.toFixed(2)),
      change1w: sp?.change1w ?? 0,
      change1m: sp?.change1m ?? 0,
      change3m: sp?.change3m ?? 0,
      rsRatio: sp?.rsRatio ?? 100,
      rsMomentum: sp?.rsMomentum ?? 100,
      quadrant: sp?.quadrant ?? "Improving",
      momentum,
    });
  }

  return result.sort((a, b) => b.avgChange1d - a.avgChange1d);
}

export async function GET() {
  try {
    const data = await cache.getOrSet("market:industry-rotation", computeIndustryRotation, 3 * 60 * 1000);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json([]);
  }
}
