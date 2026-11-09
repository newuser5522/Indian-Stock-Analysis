import { NextRequest, NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/yahoo-finance";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get("symbols") ?? "";
  if (!symbolsParam) return NextResponse.json([]);
  const symbols = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (symbols.length > 50) {
    return NextResponse.json({ error: "A maximum of 50 symbols is allowed" }, { status: 400 });
  }
  if (symbols.some((symbol) => !/^[A-Za-z0-9.^&=_-]{1,50}$/.test(symbol))) {
    return NextResponse.json({ error: "One or more stock symbols are invalid" }, { status: 400 });
  }
  try {
    const quotes = await fetchQuotes(symbols);
    if (quotes.length === 0) {
      return NextResponse.json(
        { error: "Quotes are temporarily unavailable" },
        { status: 502 },
      );
    }
    return NextResponse.json(quotes);
  } catch (error) {
    console.error("Stock quotes are unavailable", error);
    return NextResponse.json(
      { error: "Quotes are temporarily unavailable" },
      { status: 502 },
    );
  }
}
