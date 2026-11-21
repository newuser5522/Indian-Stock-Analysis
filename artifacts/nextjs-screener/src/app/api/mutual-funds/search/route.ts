import { NextRequest, NextResponse } from "next/server";
import { searchMutualFunds } from "@/lib/mutual-funds";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length > 100) {
    return NextResponse.json({ error: "Search query is too long" }, { status: 400 });
  }

  try {
    return NextResponse.json(await searchMutualFunds(query));
  } catch (error) {
    console.error("Mutual-fund search is unavailable", error);
    return NextResponse.json(
      { error: "Mutual-fund search is temporarily unavailable" },
      { status: 502 },
    );
  }
}
