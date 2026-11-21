import { NextRequest, NextResponse } from "next/server";
import { fetchNseApi } from "@/lib/nse";
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const nseSymbol = symbol.replace(/\.(NS|BO)$/i, "").toUpperCase();
  if (!nseSymbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  try {
    const response = await fetchNseApi<NseTopCorpInfo>(
      `top-corp-info?symbol=${encodeURIComponent(nseSymbol)}&market=equities`,
    );
    const data = response.data ?? response;
    const holdingPeriods = getShareholdingPeriods(data.shareholdings_patterns?.data);
    const periods = holdingPeriods.map(({ date, rows }) => ({
      date,
      promoterHolding: getShareholdingPercent(rows, ["Promoter & Promoter Group"]),
      promoterPledged: getShareholdingPercent(rows, [
        "Shares pledged or otherwise encumbered",
        "Shares pledged or otherwise encumbered by promoters",
      ]),
      institutionalHolding: getShareholdingPercent(rows, ["Institutional Investors"]),
      fiiHolding: getShareholdingPercent(rows, [
        "Foreign Portfolio Investors",
        "Foreign Institutional Investors",
      ]),
      diiHolding: getShareholdingPercent(rows, ["Domestic Institutional Investors"]),
      publicHolding: getShareholdingPercent(rows, ["Public"]),
      shareholderCount: null,
    }));
    const latest = holdingPeriods[holdingPeriods.length - 1];
    const latestPromoter =
      latest != null
        ? getShareholdingPercent(latest.rows, ["Promoter & Promoter Group"])
        : null;
    const promoterHolding = latestPromoter;
    const promoterPledged =
      latest != null
        ? getShareholdingPercent(latest.rows, [
            "Shares pledged or otherwise encumbered",
            "Shares pledged or otherwise encumbered by promoters",
          ])
        : null;
    const institutionalHolding =
      latest != null
        ? getShareholdingPercent(latest.rows, ["Institutional Investors"])
        : null;
    const fiiHolding =
      latest != null
        ? getShareholdingPercent(latest.rows, [
            "Foreign Portfolio Investors",
            "Foreign Institutional Investors",
          ])
        : null;
    const diiHolding =
      latest != null
        ? getShareholdingPercent(latest.rows, ["Domestic Institutional Investors"])
        : null;
    const publicHolding =
      latest != null
        ? getShareholdingPercent(latest.rows, ["Public"])
        : null;
    const quarterlyChange = getQuarterlyShareholdingChange(
      holdingPeriods,
      ["Promoter & Promoter Group"],
    );
    return NextResponse.json({
      symbol: nseSymbol,
      promoterHolding,
      promoterPledged,
      institutionalHolding,
      fiiHolding,
      diiHolding,
      publicHolding,
      quarterlyChange,
      quarter: latest?.date ?? null,
      source: "NSE India shareholding pattern",
      periods,
    });
  } catch (error) {
    console.error(`Stock ownership data is unavailable for ${nseSymbol}`, error);
    return NextResponse.json(
      { error: "Stock ownership data is temporarily unavailable" },
      { status: 502 },
    );
  }
}