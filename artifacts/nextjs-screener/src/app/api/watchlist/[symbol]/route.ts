import { NextRequest, NextResponse } from "next/server";
import { db, isDatabaseConfigured, sql } from "@workspace/db";
import { watchlistTable } from "@workspace/db";
import { getWatchlistDatabaseError } from "@/lib/watchlist-db-error";
import { getCurrentUserId } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  const ownerId = await getCurrentUserId();
  if (ownerId == null) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const { symbol } = await params;
    if (!/^[A-Za-z0-9.^&=_-]{1,50}$/.test(symbol)) {
      return NextResponse.json({ error: "A valid stock symbol is required" }, { status: 400 });
    }
    const [deleted] = await db
      .delete(watchlistTable)
      .where(sql`${watchlistTable.symbol} = ${symbol.trim().toUpperCase()} AND ${watchlistTable.ownerId} = ${ownerId}`)
      .returning({ symbol: watchlistTable.symbol });
    if (!deleted) return NextResponse.json({ error: "Watchlist item not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("watchlist DELETE error", err);
    const failure = getWatchlistDatabaseError(err);
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}
