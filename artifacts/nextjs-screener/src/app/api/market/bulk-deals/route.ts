import { NextRequest, NextResponse } from "next/server";
import { fetchNseBulkDeals, nseDate } from "@/lib/nse";
import { cache } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface BulkDeal {
  date: string;
  symbol: string;
  name: string;
  clientName: string;
  dealType: "BUY" | "SELL" | string;
  quantity: number | null;
  price: number | null;
  remarks: string;
}

async function fetchBulkDeals(fromDate: string, toDate: string): Promise<BulkDeal[]> {
  const raw = await fetchNseBulkDeals(fromDate, toDate);
  return raw.map((r) => ({
    date: r.date ?? "",
    symbol: r.symbol ?? "",
    name: r.secName ?? r.symbol ?? "",
    clientName: r.clientName ?? "",
    dealType: (r.buyOrSellFlag ?? r.buySell ?? "").toUpperCase().trim(),
    quantity: parseNumeric(r.quantityTraded),
    price: parseNumeric(r.tradePrice ?? r.wgtAvgPrice),
    remarks: r.remarks ?? "",
  }));
}

function parseNumeric(value: number | string | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "string"
    ? Number.parseFloat(value.replace(/,/g, "").trim())
    : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const fromDate = sp.get("from_date") ?? nseDate(30);
  const toDate = sp.get("to_date") ?? nseDate();
  const start = nseDateTimestamp(fromDate);
  const end = nseDateTimestamp(toDate);
  if (start == null || end == null || start > end) {
    return NextResponse.json({ error: "Dates must use DD-MM-YYYY or YYYY-MM-DD format" }, { status: 400 });
  }
  const cacheKey = `market:bulk-deals:${fromDate}:${toDate}`;
  try {
    const data = await cache.getOrSet(cacheKey, () => fetchBulkDeals(fromDate, toDate), 5 * 60 * 1000);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Bulk deal data is unavailable", error);
    return NextResponse.json({ error: "Bulk deal data is temporarily unavailable" }, { status: 502 });
  }
}

function nseDateTimestamp(value: string): number | null {
  const dayFirst = /^\d{2}-\d{2}-\d{4}$/.test(value);
  const match = dayFirst
    ? /^(\d{2})-(\d{2})-(\d{4})$/.exec(value)
    : /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(dayFirst ? match[3] : match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(dayFirst ? match[1] : match[3]);
  const date = new Date(Date.UTC(year, month, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) return null;
  return date.getTime();
}
