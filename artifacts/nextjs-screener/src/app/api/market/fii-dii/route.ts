import { NextResponse } from "next/server";
import { cache } from "@/lib/cache";
import { fetchNseApi } from "@/lib/nse";

interface FiiDiiRecord {
  category: string;
  buyValue: string;
  sellValue: string;
  netValue: string;
  date?: string;
}

async function fetchFiiDii() {
  const raw = await fetchNseApi<FiiDiiRecord[]>("fiidiiTradeReact");
  if (!Array.isArray(raw)) throw new Error("Unexpected NSE FII/DII response format");

  return raw.map((record) => {
    const parseValue = (value: string) => {
      const parsed = Number.parseFloat(value.replace(/,/g, ""));
      if (!Number.isFinite(parsed)) throw new Error("Invalid NSE FII/DII numeric value");
      return parsed;
    };
    return {
      category: record.category?.replace("*", "").trim() ?? "—",
      buyValue: parseValue(record.buyValue),
      sellValue: parseValue(record.sellValue),
      netValue: parseValue(record.netValue),
      date: record.date ?? null,
    };
  });
}

export async function GET() {
  try {
    const data = await cache.getOrSet("market:fii-dii", () => fetchFiiDii(), 10 * 60 * 1000);
    return NextResponse.json(data);
  } catch (error) {
    console.error("FII/DII data is unavailable", error);
    return NextResponse.json({ error: "FII/DII data is temporarily unavailable" }, { status: 502 });
  }
}
