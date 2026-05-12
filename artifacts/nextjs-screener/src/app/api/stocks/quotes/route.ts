import { NextRequest, NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/yahoo-finance";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get("symbols") ?? "";
  if (!symbolsParam) return NextResponse.json([]);
  const symbols = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);
  const quotes = await fetchQuotes(symbols);
  return NextResponse.json(quotes);
}
