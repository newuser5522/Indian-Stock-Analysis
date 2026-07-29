import { NextRequest, NextResponse } from "next/server";
import { fetchNseApi, nseDate } from "@/lib/nse";
import { cache } from "@/lib/cache";

export const dynamic = "force-dynamic";

interface NseBulkDeal {
  date?: string;
  symbol?: string;
  secName?: string;
  clientName?: string;
  buySell?: string;
  quantityTraded?: number | string;
  wgtAvgPrice?: number | string;
  remarks?: string;
}

export interface BulkDeal {
  date: string;
  symbol: string;
  name: string;
  clientName: string;
  dealType: "BUY" | "SELL" | string;
  quantity: number;
  price: number;
  remarks: string;
}

async function fetchBulkDeals(fromDate: string, toDate: string): Promise<BulkDeal[]> {
  const raw = await fetchNseApi<NseBulkDeal[]>(
    `bulk-deals-archives?from_date=${encodeURIComponent(fromDate)}&to_date=${encodeURIComponent(toDate)}`
  );
  if (!Array.isArray(raw)) throw new Error("Unexpected bulk deals format");
  return raw.map((r) => ({
    date: r.date ?? "",
    symbol: r.symbol ?? "",
    name: r.secName ?? r.symbol ?? "",
    clientName: r.clientName ?? "",
    dealType: (r.buySell ?? "").toUpperCase().trim(),
    quantity: typeof r.quantityTraded === "string" ? parseFloat(r.quantityTraded.replace(/,/g, "")) : (r.quantityTraded ?? 0),
    price: typeof r.wgtAvgPrice === "string" ? parseFloat(r.wgtAvgPrice.replace(/,/g, "")) : (r.wgtAvgPrice ?? 0),
    remarks: r.remarks ?? "",
  }));
}

function mockBulkDeals(): BulkDeal[] {
  return [
    { date: nseDate(), symbol: "RELIANCE", name: "Reliance Industries", clientName: "Morgan Stanley Asia", dealType: "BUY", quantity: 2500000, price: 1285.50, remarks: "" },
    { date: nseDate(), symbol: "HDFCBANK", name: "HDFC Bank", clientName: "Goldman Sachs India", dealType: "SELL", quantity: 1800000, price: 748.25, remarks: "" },
    { date: nseDate(), symbol: "TCS", name: "Tata Consultancy Services", clientName: "Vanguard Group", dealType: "BUY", quantity: 950000, price: 2262.80, remarks: "" },
    { date: nseDate(), symbol: "ICICIBANK", name: "ICICI Bank", clientName: "Blackrock Inc", dealType: "BUY", quantity: 3100000, price: 1438.60, remarks: "" },
    { date: nseDate(), symbol: "INFY", name: "Infosys", clientName: "Fidelity Investments", dealType: "SELL", quantity: 1200000, price: 1578.90, remarks: "" },
  ];
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const fromDate = sp.get("from_date") ?? nseDate(30);
  const toDate = sp.get("to_date") ?? nseDate();
  const cacheKey = `market:bulk-deals:${fromDate}:${toDate}`;
  try {
    const data = await cache.getOrSet(cacheKey, () => fetchBulkDeals(fromDate, toDate), 5 * 60 * 1000);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(mockBulkDeals());
  }
}
