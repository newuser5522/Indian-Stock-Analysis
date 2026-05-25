import { NextResponse } from "next/server";
import { fetchSectorIndices } from "@/lib/yahoo-finance";
import { cache } from "@/lib/cache";

export async function GET() {
  try {
    const data = await cache.getOrSet("market:sector-indices", () => fetchSectorIndices(), 2 * 60 * 1000);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
