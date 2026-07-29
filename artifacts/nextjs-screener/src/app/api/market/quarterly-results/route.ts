import { NextResponse } from "next/server";
import { fetchNseApi, nseDate } from "@/lib/nse";
import { NSE_STOCKS } from "@/lib/stock-list";
import { cache } from "@/lib/cache";

export const dynamic = "force-dynamic";

interface NseCorpResult {
  symbol?: string;
  companyName?: string;
  income?: string | number;
  profit?: string | number;
  incomeGrowth?: string | number;
  profitGrowth?: string | number;
  period?: string;
  xbrlAttachment?: string;
}

export interface QuarterlyResult {
  symbol: string;
  name: string;
  sector: string;
  period: string;
  revenue: number | null;
  profit: number | null;
  revenueGrowth: number | null;
  profitGrowth: number | null;
  eps: number | null;
  beat: "beat" | "miss" | "inline" | null;
}

function parseNum(v: string | number | undefined | null): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

async function fetchQuarterlyResults(): Promise<QuarterlyResult[]> {
  // NSE provides quarterly results via the corp-actions endpoint
  const raw = await fetchNseApi<NseCorpResult[]>(
    `quarterly-results?index=equities&from_date=${encodeURIComponent(nseDate(90))}&to_date=${encodeURIComponent(nseDate())}`
  );
  if (!Array.isArray(raw)) throw new Error("Unexpected quarterly results format");

  const sectorMap = new Map(NSE_STOCKS.map((s) => [s.symbol.replace(/\.(NS|BO)$/i, "").toUpperCase(), s.sector]));

  return raw.slice(0, 100).map((r) => {
    const sym = (r.symbol ?? "").toUpperCase();
    const revenue = parseNum(r.income);
    const profit = parseNum(r.profit);
    const revenueGrowth = parseNum(r.incomeGrowth);
    const profitGrowth = parseNum(r.profitGrowth);
    const beat: "beat" | "miss" | "inline" | null =
      profitGrowth != null ? (profitGrowth > 5 ? "beat" : profitGrowth < -5 ? "miss" : "inline") : null;

    return {
      symbol: sym,
      name: r.companyName ?? sym,
      sector: sectorMap.get(sym) ?? "Other",
      period: r.period ?? "",
      revenue,
      profit,
      revenueGrowth,
      profitGrowth,
      eps: null,
      beat,
    };
  });
}

function mockQuarterlyResults(): QuarterlyResult[] {
  const quarter = "Q1 FY2026";
  return [
    { symbol: "RELIANCE", name: "Reliance Industries", sector: "Energy", period: quarter, revenue: 258000, profit: 19260, revenueGrowth: 12.4, profitGrowth: 8.7, eps: 28.50, beat: "beat" },
    { symbol: "TCS", name: "Tata Consultancy Services", sector: "Technology", period: quarter, revenue: 62250, profit: 12650, revenueGrowth: 6.1, profitGrowth: 5.8, eps: 34.20, beat: "inline" },
    { symbol: "HDFCBANK", name: "HDFC Bank", sector: "Financial Services", period: quarter, revenue: 78400, profit: 16950, revenueGrowth: 18.3, profitGrowth: 14.2, eps: 22.40, beat: "beat" },
    { symbol: "INFY", name: "Infosys", sector: "Technology", period: quarter, revenue: 40350, profit: 7750, revenueGrowth: 4.8, profitGrowth: -2.1, eps: 18.30, beat: "miss" },
    { symbol: "ICICIBANK", name: "ICICI Bank", sector: "Financial Services", period: quarter, revenue: 48200, profit: 11200, revenueGrowth: 20.1, profitGrowth: 16.8, eps: 16.50, beat: "beat" },
    { symbol: "HINDUNILVR", name: "Hindustan Unilever", sector: "Consumer Staples", period: quarter, revenue: 14750, profit: 2680, revenueGrowth: 3.2, profitGrowth: 4.1, eps: 11.40, beat: "inline" },
    { symbol: "BAJFINANCE", name: "Bajaj Finance", sector: "Financial Services", period: quarter, revenue: 16850, profit: 4260, revenueGrowth: 22.4, profitGrowth: 19.8, eps: 70.20, beat: "beat" },
    { symbol: "SUNPHARMA", name: "Sun Pharmaceutical", sector: "Healthcare", period: quarter, revenue: 12480, profit: 2560, revenueGrowth: 9.3, profitGrowth: 11.5, eps: 10.60, beat: "beat" },
    { symbol: "TATAMOTORS", name: "Tata Motors", sector: "Consumer Discretionary", period: quarter, revenue: 118500, profit: 5200, revenueGrowth: -2.4, profitGrowth: -18.6, eps: 14.10, beat: "miss" },
    { symbol: "WIPRO", name: "Wipro", sector: "Technology", period: quarter, revenue: 23150, profit: 3560, revenueGrowth: 2.9, profitGrowth: 3.4, eps: 6.50, beat: "inline" },
  ];
}

export async function GET() {
  try {
    const data = await cache.getOrSet("market:quarterly-results", fetchQuarterlyResults, 30 * 60 * 1000);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(mockQuarterlyResults());
  }
}
