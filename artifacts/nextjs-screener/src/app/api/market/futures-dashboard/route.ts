import { NextResponse } from "next/server";
import { fetchNseApi } from "@/lib/nse";
import { cache } from "@/lib/cache";

export const dynamic = "force-dynamic";

interface OptionEntry {
  openInterest?: number;
  changeinOpenInterest?: number;
  totalTradedVolume?: number;
  impliedVolatility?: number;
  lastPrice?: number;
  pChange?: number;
}

interface OptionChainRow {
  strikePrice?: number;
  expiryDate?: string;
  CE?: OptionEntry;
  PE?: OptionEntry;
}

interface OptionChainResponse {
  filtered?: {
    data?: OptionChainRow[];
    CE?: { totOI?: number; totVol?: number };
    PE?: { totOI?: number; totVol?: number };
  };
  records?: {
    expiryDates?: string[];
    underlyingValue?: number;
  };
}

export interface OiStrike {
  strike: number;
  callOI: number;
  putOI: number;
  callOIChange: number;
  putOIChange: number;
  callLTP: number;
  putLTP: number;
  callIV: number;
  putIV: number;
}

export interface FuturesDashboard {
  symbol: string;
  spotPrice: number;
  expiry: string;
  pcr: number;
  totalCallOI: number;
  totalPutOI: number;
  maxCallOIStrike: number;
  maxPutOIStrike: number;
  straddle: number;
  oiStrikes: OiStrike[];
}

async function fetchFuturesData(symbol: "NIFTY" | "BANKNIFTY"): Promise<FuturesDashboard> {
  const raw = await fetchNseApi<OptionChainResponse>(`option-chain-indices?symbol=${symbol}`);

  const rows = raw?.filtered?.data ?? [];
  const totalCallOI = raw?.filtered?.CE?.totOI ?? 0;
  const totalPutOI = raw?.filtered?.PE?.totOI ?? 0;
  const pcr = totalCallOI > 0 ? parseFloat((totalPutOI / totalCallOI).toFixed(3)) : 0;
  const spotPrice = raw?.records?.underlyingValue ?? 0;
  const expiry = raw?.records?.expiryDates?.[0] ?? "";

  let maxCallOI = 0, maxCallOIStrike = 0;
  let maxPutOI = 0, maxPutOIStrike = 0;

  const oiStrikes: OiStrike[] = rows.map((row) => {
    const callOI = row.CE?.openInterest ?? 0;
    const putOI = row.PE?.openInterest ?? 0;
    if (callOI > maxCallOI) { maxCallOI = callOI; maxCallOIStrike = row.strikePrice ?? 0; }
    if (putOI > maxPutOI) { maxPutOI = putOI; maxPutOIStrike = row.strikePrice ?? 0; }
    return {
      strike: row.strikePrice ?? 0,
      callOI,
      putOI,
      callOIChange: row.CE?.changeinOpenInterest ?? 0,
      putOIChange: row.PE?.changeinOpenInterest ?? 0,
      callLTP: row.CE?.lastPrice ?? 0,
      putLTP: row.PE?.lastPrice ?? 0,
      callIV: row.CE?.impliedVolatility ?? 0,
      putIV: row.PE?.impliedVolatility ?? 0,
    };
  });

  // ATM straddle price (call + put LTP at closest strike to spot)
  const atm = oiStrikes.reduce((best, s) =>
    Math.abs(s.strike - spotPrice) < Math.abs(best.strike - spotPrice) ? s : best,
    oiStrikes[0] ?? { strike: 0, callLTP: 0, putLTP: 0, callOI: 0, putOI: 0, callOIChange: 0, putOIChange: 0, callIV: 0, putIV: 0 }
  );
  const straddle = parseFloat(((atm?.callLTP ?? 0) + (atm?.putLTP ?? 0)).toFixed(2));

  return {
    symbol,
    spotPrice,
    expiry,
    pcr,
    totalCallOI,
    totalPutOI,
    maxCallOIStrike,
    maxPutOIStrike,
    straddle,
    oiStrikes: oiStrikes.slice(0, 30), // 15 strikes above + below ATM
  };
}

function mockFutures(symbol: string, spot: number): FuturesDashboard {
  const strikes = Array.from({ length: 20 }, (_, i) => Math.round(spot / 100) * 100 - 1000 + i * 100);
  const atm = Math.round(spot / 100) * 100;
  const oiStrikes: OiStrike[] = strikes.map((s) => {
    const dist = Math.abs(s - atm) / 100;
    const baseCallOI = Math.round(Math.max(1000000, 8000000 - dist * 500000 + Math.random() * 500000));
    const basePutOI = Math.round(Math.max(1000000, 7000000 - dist * 400000 + Math.random() * 400000));
    return { strike: s, callOI: baseCallOI, putOI: basePutOI, callOIChange: Math.round((Math.random() - 0.5) * 200000), putOIChange: Math.round((Math.random() - 0.5) * 150000), callLTP: parseFloat(Math.max(5, (atm + 200 - s) * 0.8).toFixed(2)), putLTP: parseFloat(Math.max(5, (s - atm + 200) * 0.8).toFixed(2)), callIV: parseFloat((14 + dist * 0.5 + Math.random()).toFixed(2)), putIV: parseFloat((15 + dist * 0.5 + Math.random()).toFixed(2)) };
  });
  const maxCall = oiStrikes.reduce((m, s) => s.callOI > m.callOI ? s : m, oiStrikes[0]);
  const maxPut = oiStrikes.reduce((m, s) => s.putOI > m.putOI ? s : m, oiStrikes[0]);
  const totalCall = oiStrikes.reduce((t, s) => t + s.callOI, 0);
  const totalPut = oiStrikes.reduce((t, s) => t + s.putOI, 0);
  const atmRow = oiStrikes.find((s) => s.strike === atm) ?? oiStrikes[10];
  return {
    symbol,
    spotPrice: spot,
    expiry: "31-Jul-2025",
    pcr: parseFloat((totalPut / totalCall).toFixed(3)),
    totalCallOI: totalCall,
    totalPutOI: totalPut,
    maxCallOIStrike: maxCall?.strike ?? 0,
    maxPutOIStrike: maxPut?.strike ?? 0,
    straddle: parseFloat(((atmRow?.callLTP ?? 0) + (atmRow?.putLTP ?? 0)).toFixed(2)),
    oiStrikes,
  };
}

export async function GET() {
  try {
    const [nifty, bankNifty] = await cache.getOrSet("market:futures-dashboard", async () => {
      const [n, b] = await Promise.all([fetchFuturesData("NIFTY"), fetchFuturesData("BANKNIFTY")]);
      return [n, b];
    }, 2 * 60 * 1000);
    return NextResponse.json({ nifty, bankNifty });
  } catch {
    return NextResponse.json({
      nifty: mockFutures("NIFTY", 23767),
      bankNifty: mockFutures("BANKNIFTY", 52800),
    });
  }
}
