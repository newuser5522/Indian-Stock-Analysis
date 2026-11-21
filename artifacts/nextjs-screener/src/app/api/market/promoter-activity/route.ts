import { NextResponse } from "next/server";
import { fetchNseApi } from "@/lib/nse";
import { fetchIndianEquityScreenerQuotes } from "@/lib/yahoo-finance";
import { cache } from "@/lib/cache";
import {
  getQuarterlyShareholdingChange,
  getShareholdingPercent,
  getShareholdingPeriods,
  type ShareholdingRow,
} from "@/lib/nse-shareholding";

export const dynamic = "force-dynamic";

interface NseTopCorpInfo {
  data?: NseTopCorpInfo;
  shareholdings_patterns?: {
    data?: Record<string, ShareholdingRow[]>;
  };
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
  quarter: string;
  trend: "increased" | "decreased" | "unchanged" | null;
}

// Fetch promoter holding data for a single stock from NSE
async function fetchOnePromoterHolding(symbol: string): Promise<NseTopCorpInfo | null> {
  const nseSymbol = symbol.replace(/\.(NS|BO)$/i, "").toUpperCase();
  try {
    const response = await fetchNseApi<NseTopCorpInfo>(
      `top-corp-info?symbol=${encodeURIComponent(nseSymbol)}&market=equities`,
    );
    return response.data ?? response;
  } catch (error) {
    console.warn(`Promoter data unavailable for ${nseSymbol}`, error);
    return null;
  }
}

async function fetchPromoterActivity(): Promise<PromoterRecord[]> {
  const topStocks = (await fetchIndianEquityScreenerQuotes())
    .filter((quote) => quote.marketCap != null)
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
    .slice(0, 30);

  const results: PromoterRecord[] = [];
  for (let index = 0; index < topStocks.length; index += 5) {
    const batch = await Promise.all(
      topStocks.slice(index, index + 5).map(async (stock): Promise<PromoterRecord | null> => {
        const info = await fetchOnePromoterHolding(stock.symbol);
        if (!info) return null;
        const periods = getShareholdingPeriods(info.shareholdings_patterns?.data);
        const latest = periods[periods.length - 1];
        const latestPromoter = latest
          ? getShareholdingPercent(latest.rows, ["Promoter & Promoter Group"])
          : null;
        if (latestPromoter == null || latest == null) return null;
        const change = getQuarterlyShareholdingChange(
          periods,
          ["Promoter & Promoter Group"],
        );
        const trend: "increased" | "decreased" | "unchanged" | null =
          change == null ? null
            : change > 0.1 ? "increased"
              : change < -0.1 ? "decreased"
                : "unchanged";
        return {
          symbol: stock.symbol,
          name: stock.longName ?? stock.shortName ?? stock.symbol,
          exchange: "NSE",
          sector: stock.sector ?? "Unclassified",
          promoterHolding: latestPromoter,
          promoterPledged: getShareholdingPercent(latest.rows, [
            "Shares pledged or otherwise encumbered",
            "Shares pledged or otherwise encumbered by promoters",
          ]),
          institutionalHolding: getShareholdingPercent(latest.rows, [
            "Institutional Investors",
          ]),
          publicHolding: getShareholdingPercent(latest.rows, ["Public"]),
          quarterlyChange: change,
          quarter: latest.date,
          trend,
        };
      }),
    );
    results.push(...batch.filter((record): record is PromoterRecord => record !== null));
  }

  if (results.length === 0) throw new Error("NSE returned no promoter holding data");

  return results;
}

export async function GET() {
  try {
    const data = await cache.getOrSet("market:promoter-activity", fetchPromoterActivity, 15 * 60 * 1000);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Promoter activity is unavailable", error);
    return NextResponse.json({ error: "Promoter activity is temporarily unavailable" }, { status: 502 });
  }
}
