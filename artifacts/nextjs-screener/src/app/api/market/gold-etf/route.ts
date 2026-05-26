import { NextResponse } from "next/server";
import { cache } from "@/lib/cache";

const YF_BASE = "https://query1.finance.yahoo.com";

const GOLD_ETFS = [
  { symbol: "GOLDBEES.NS", name: "Nippon India Gold ETF", amc: "Nippon India" },
  { symbol: "AXISGOLD.NS", name: "Axis Gold ETF", amc: "Axis" },
  { symbol: "KOTAKGOLD.NS", name: "Kotak Gold ETF", amc: "Kotak" },
  { symbol: "HDFCMFGETF.NS", name: "HDFC Gold ETF", amc: "HDFC" },
  { symbol: "ICICIPHYGLD.NS", name: "ICICI Pru Gold ETF", amc: "ICICI Prudential" },
  { symbol: "SBIGOLD.NS", name: "SBI Gold ETF", amc: "SBI" },
  { symbol: "QGOLDHALF.NS", name: "Quantum Gold Fund ETF", amc: "Quantum" },
  { symbol: "BSLGOLDETF.NS", name: "BSL Gold ETF", amc: "Bandhan (BSL)" },
  { symbol: "ABSLGOLDETF.NS", name: "Aditya Birla SL Gold ETF", amc: "Aditya Birla" },
  { symbol: "CRMFGOLD.NS", name: "Canara Robeco Gold ETF", amc: "Canara Robeco" },
];

async function fetchEtf(etf: (typeof GOLD_ETFS)[0]) {
  try {
    const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(etf.symbol)}?interval=1d&range=30d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      chart?: {
        result?: {
          meta?: {
            regularMarketPrice?: number; chartPreviousClose?: number;
            regularMarketDayHigh?: number; regularMarketDayLow?: number;
            regularMarketVolume?: number; fiftyTwoWeekHigh?: number; fiftyTwoWeekLow?: number;
            marketCap?: number; regularMarketTime?: number;
          };
          timestamp?: number[];
          indicators?: { quote?: { close?: (number | null)[]; volume?: (number | null)[] }[] };
        }[];
      };
    };
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta || !meta.regularMarketPrice) return null;

    const price = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose ?? price;
    const change = price - prev;
    const changePct = prev > 0 ? (change / prev) * 100 : 0;

    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const sparkline = closes.filter(c => c != null).slice(-15) as number[];

    // 1-month return
    const firstClose = sparkline.find(v => v > 0);
    const monthReturn = firstClose && price ? ((price - firstClose) / firstClose) * 100 : null;

    return {
      symbol: etf.symbol,
      name: etf.name,
      amc: etf.amc,
      price,
      change,
      changePct,
      high: meta.regularMarketDayHigh,
      low: meta.regularMarketDayLow,
      volume: meta.regularMarketVolume,
      week52High: meta.fiftyTwoWeekHigh,
      week52Low: meta.fiftyTwoWeekLow,
      monthReturn,
      sparkline,
    };
  } catch { return null; }
}

async function fetchAll() {
  const results = await Promise.all(GOLD_ETFS.map(fetchEtf));
  return results.filter(Boolean);
}

export async function GET() {
  try {
    const data = await cache.getOrSet("market:gold-etf", () => fetchAll(), 60 * 1000);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json([]);
  }
}
