import { NextRequest, NextResponse } from "next/server";
import { fetchNseApi } from "@/lib/nse";

export const dynamic = "force-dynamic";

interface NseTopCorpInfo {
  data?: NseTopCorpInfo;
  promoterHoldingPct?: number;
  promoterPledgedPct?: number;
  institutionalHoldingPct?: number;
  retailHoldingPct?: number;
  promoterChange?: number;
  qtrName?: string;
  shareholdings_patterns?: {
    data?: Record<string, Record<string, string | number>[]>;
  };
}

function numeric(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = parseFloat(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function getHolding(
  rows: Record<string, string | number>[],
  key: string,
): number | null {
  for (const row of rows) {
    const match = Object.entries(row).find(
      ([label]) => label.trim().toLowerCase() === key.toLowerCase(),
    );
    if (match) return numeric(match[1]);
  }
  return null;
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
    const holdingPeriods = Object.entries(
      data.shareholdings_patterns?.data ?? {},
    )
      .map(([date, rows]) => ({
        date,
        timestamp: Date.parse(date),
        rows,
      }))
      .filter((period) => Number.isFinite(period.timestamp))
      .sort((a, b) => a.timestamp - b.timestamp);
    const periods = holdingPeriods.map(({ date, rows }) => ({
      date,
      promoterHolding: getHolding(rows, "Promoter & Promoter Group"),
      promoterPledged: getHolding(
        rows,
        "Shares pledged or otherwise encumbered",
      ),
      institutionalHolding: getHolding(rows, "Institutional Investors"),
      fiiHolding:
        getHolding(rows, "Foreign Portfolio Investors") ??
        getHolding(rows, "Foreign Institutional Investors"),
      diiHolding: getHolding(rows, "Domestic Institutional Investors"),
      publicHolding: getHolding(rows, "Public"),
      shareholderCount:
        getHolding(rows, "Number of Shareholders") ??
        getHolding(rows, "No. of Shareholders"),
    }));
    const latest = holdingPeriods[holdingPeriods.length - 1];
    const previous = holdingPeriods[holdingPeriods.length - 2];
    const latestPromoter =
      latest != null
        ? getHolding(latest.rows, "Promoter & Promoter Group")
        : null;
    const previousPromoter =
      previous != null
        ? getHolding(previous.rows, "Promoter & Promoter Group")
        : null;
    const promoterHolding =
      data.promoterHoldingPct ?? latestPromoter ?? null;
    const promoterPledged =
      data.promoterPledgedPct ??
      (latest != null
        ? getHolding(latest.rows, "Shares pledged or otherwise encumbered")
        : null);
    const institutionalHolding =
      data.institutionalHoldingPct ??
      (latest != null ? getHolding(latest.rows, "Institutional Investors") : null);
    const publicHolding =
      data.retailHoldingPct ??
      (latest != null ? getHolding(latest.rows, "Public") : null);
    const fiiHolding =
      latest != null
        ? getHolding(latest.rows, "Foreign Portfolio Investors") ??
          getHolding(latest.rows, "Foreign Institutional Investors")
        : null;
    const diiHolding =
      latest != null
        ? getHolding(latest.rows, "Domestic Institutional Investors")
        : null;
    const quarterlyChange =
      data.promoterChange ??
      (latestPromoter != null && previousPromoter != null
        ? latestPromoter - previousPromoter
        : null);
    return NextResponse.json({
      symbol: nseSymbol,
      promoterHolding,
      promoterPledged,
      institutionalHolding,
      fiiHolding,
      diiHolding,
      publicHolding,
      quarterlyChange,
      quarter: data.qtrName ?? latest?.date ?? null,
      source: "NSE India",
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