import { NextRequest, NextResponse } from "next/server";
import { searchYahoo } from "@/lib/yahoo-finance";
import { NSE_STOCKS } from "@/lib/stock-list";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q.trim()) return NextResponse.json([]);
  const results = await searchYahoo(q);
  const normalizedQuery = q.trim().toLowerCase();
  const localMatches = NSE_STOCKS
    .filter((stock) =>
      [stock.symbol, stock.symbol.replace(/\.(NS|BO)$/i, ""), stock.name, stock.sector]
        .some((value) => value.toLowerCase().includes(normalizedQuery))
    )
    .map((stock) => ({
      symbol: stock.symbol,
      shortname: stock.name,
      exchDisp: stock.exchange,
      typeDisp: "Equity",
      sector: stock.sector,
    }));
  const remoteMatches = results.filter((result) => /\.(NS|BO)$/i.test(result.symbol));
  const seen = new Set<string>();
  const merged = [...localMatches, ...remoteMatches]
    .filter((result) => {
      const key = result.symbol.toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
  return NextResponse.json(merged);
}
