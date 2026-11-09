import { NextRequest, NextResponse } from "next/server";
import { db, eq, isDatabaseConfigured } from "@workspace/db";
import { watchlistTable } from "@workspace/db";
import { getWatchlistDatabaseError } from "@/lib/watchlist-db-error";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { symbol } = await params;
    if (!/^[A-Za-z0-9.^&=_-]{1,50}$/.test(symbol)) {
      return NextResponse.json({ error: "A valid stock symbol is required" }, { status: 400 });
    }
    const [deleted] = await db
      .delete(watchlistTable)
      .where(eq(watchlistTable.symbol, symbol.trim().toUpperCase()))
      .returning({ symbol: watchlistTable.symbol });
    if (!deleted) return NextResponse.json({ error: "Watchlist item not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("watchlist DELETE error", err);
    const failure = getWatchlistDatabaseError(err);
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}
