import { NextRequest, NextResponse } from "next/server";
import { fetchMutualFundHistory } from "@/lib/mutual-funds";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ schemeCode: string }> },
) {
  const { schemeCode: rawSchemeCode } = await params;
  if (!/^[1-9]\d{0,8}$/.test(rawSchemeCode)) {
    return NextResponse.json({ error: "Invalid mutual-fund scheme code" }, { status: 400 });
  }

  const schemeCode = Number(rawSchemeCode);
  const period = req.nextUrl.searchParams.get("period") ?? "5y";
  const periodYears: Record<string, number | null> = {
    "1y": 1,
    "3y": 3,
    "5y": 5,
    max: null,
  };
  if (!(period in periodYears)) {
    return NextResponse.json({ error: "Unsupported history period" }, { status: 400 });
  }

  try {
    const fund = await fetchMutualFundHistory(schemeCode);
    const latest = fund.history.at(-1);
    if (!latest) {
      return NextResponse.json({ error: "No NAV history is available" }, { status: 404 });
    }

    const years = periodYears[period];
    const startTimestamp =
      years == null
        ? Number.NEGATIVE_INFINITY
        : latest.timestamp - years * 365.25 * 24 * 60 * 60;
    const history = fund.history.filter(
      (point) => point.timestamp >= startTimestamp,
    );
    return NextResponse.json({ ...fund, latest, history });
  } catch (error) {
    console.error(`Mutual-fund history is unavailable for scheme ${schemeCode}`, error);
    return NextResponse.json(
      { error: "Mutual-fund NAV history is temporarily unavailable" },
      { status: 502 },
    );
  }
}
