import { NextRequest, NextResponse } from "next/server";
import { cache } from "@/lib/cache";

export const dynamic = "force-dynamic";

interface Filing {
  title: string;
  date: string;
  type: string;
  category: string;
  url?: string;
}

async function fetchNseFilings(symbol: string): Promise<Filing[]> {
  const clean = symbol.replace(".NS", "").replace(".BO", "").toUpperCase();

  const filingTypes = [
    { path: `corporates-corporateActions?index=equities&symbol=${clean}`, cat: "Corporate Actions" },
    { path: `boardMeetings?index=equities&symbol=${clean}`, cat: "Board Meetings" },
    { path: `corporates-announcements?index=equities&symbol=${clean}&isIssuer=true`, cat: "Announcements" },
  ];

  const results: Filing[] = [];

  for (const ft of filingTypes) {
    try {
      const res = await fetch(`https://www.nseindia.com/api/${ft.path}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
          Referer: "https://www.nseindia.com",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const data = await res.json() as Record<string, unknown>;

      // Corporate actions
      if (ft.cat === "Corporate Actions" && Array.isArray(data)) {
        for (const item of (data as Record<string, string>[]).slice(0, 8)) {
          results.push({
            title: item.subject || item.purpose || "Corporate Action",
            date: item.exDate || item.recordDate || "",
            type: item.series || "EQ",
            category: "Corporate Action",
          });
        }
      }
      // Board meetings
      else if (ft.cat === "Board Meetings" && Array.isArray(data)) {
        for (const item of (data as Record<string, string>[]).slice(0, 6)) {
          results.push({
            title: item.bm_purpose || "Board Meeting",
            date: item.bm_date || "",
            type: "Board",
            category: "Board Meeting",
          });
        }
      }
      // Announcements
      else if (ft.cat === "Announcements") {
        const items = (data as { data?: Record<string, string>[] })?.data ?? (Array.isArray(data) ? data as Record<string, string>[] : []);
        for (const item of items.slice(0, 10)) {
          results.push({
            title: item.desc || item.subject || "Announcement",
            date: item.an_dt || item.date || "",
            type: item.sort_date ? "Filing" : "Notice",
            category: "Announcement",
          });
        }
      }
    } catch { continue; }
  }

  return results.sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return db - da;
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  try {
    const data = await cache.getOrSet(
      `filings:${symbol}`,
      () => fetchNseFilings(symbol),
      5 * 60 * 1000
    );
    return NextResponse.json(data);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
