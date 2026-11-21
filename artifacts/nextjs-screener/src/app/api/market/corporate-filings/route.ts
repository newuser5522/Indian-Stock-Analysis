import { NextRequest, NextResponse } from "next/server";
import { fetchNseApi, nseDate } from "@/lib/nse";
import { cache } from "@/lib/cache";

export const dynamic = "force-dynamic";

interface NseAnnouncement {
  symbol?: string;
  desc?: string;
  subject?: string;
  attchmntText?: string;
  exchdisstime?: string;
  attchmntFile?: string;
  smIndustry?: string;
  sm_name?: string;
  comp?: string;
}

export interface FilingRecord {
  symbol: string;
  company: string;
  category: string;
  subject: string;
  summary: string;
  date: string;
  attachmentUrl: string | null;
}

function normalizeAttachment(value: string | undefined): string | null {
  const raw = value?.trim().replace(/&amp;/gi, "&").replace(/[\u0000-\u001f]/g, "");
  if (!raw) return null;

  const repaired = raw
    .replace(/^https?:\/(?!\/)/i, (protocol) => `${protocol}/`)
    .replace(/^www\./i, "https://www.")
    .replace(/^(nsearchives\.nseindia\.com\/)/i, "https://$1");
  if (/^https?:\/\//i.test(repaired) || repaired.startsWith("//")) {
    try {
      const url = new URL(repaired.startsWith("//") ? `https:${repaired}` : repaired);
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;
      if (!/(^|\.)nseindia\.com$/i.test(url.hostname)) return null;
      url.protocol = "https:";
      return url.toString();
    } catch {
      return null;
    }
  }

  const path = repaired.replace(/^\/+/, "");
  if (!path || path.includes("..")) return null;
  if (path.toLowerCase().startsWith("corporate/")) {
    return `https://www.nseindia.com/${path}`;
  }
  if (path.toLowerCase().startsWith("content/")) {
    return `https://nsearchives.nseindia.com/${path}`;
  }
  const filename = path.split("/").pop() ?? "";
  if (!filename) return null;
  const notice = filename.startsWith("Notice_") ? filename : `Notice_${filename}`;
  return `https://www.nseindia.com/corporate/${notice}`;
}

function categorise(subject: string): string {
  const s = subject.toLowerCase();
  if (s.includes("board meeting")) return "Board Meeting";
  if (s.includes("result") || s.includes("financial")) return "Financial Results";
  if (s.includes("dividend")) return "Dividend";
  if (s.includes("agm") || s.includes("annual general")) return "AGM";
  if (s.includes("buyback")) return "Buyback";
  if (s.includes("acquisition") || s.includes("merger")) return "M&A";
  if (s.includes("insider") || s.includes("promoter")) return "Promoter/Insider";
  if (s.includes("credit") || s.includes("rating")) return "Credit Rating";
  if (s.includes("basmati") || s.includes("record date")) return "Record Date";
  return "General";
}

async function fetchFilings(fromDate: string, toDate: string): Promise<FilingRecord[]> {
  const raw = await fetchNseApi<NseAnnouncement[]>(
    `corporate-announcements?index=equities&from_date=${encodeURIComponent(fromDate)}&to_date=${encodeURIComponent(toDate)}`
  );
  if (!Array.isArray(raw)) throw new Error("Unexpected filings format");
  return raw.map((r) => {
    const subject = (r.subject ?? r.desc ?? "").replace(/\s+/g, " ").trim();
    const description = (r.attchmntText ?? r.desc ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const summarySource = description.toLowerCase() === subject.toLowerCase()
      ? ""
      : description;
    return {
      symbol: r.symbol ?? "",
      company: r.sm_name ?? r.comp ?? r.symbol ?? "",
      category: categorise(subject),
      subject,
      summary: summarySource.length > 280
        ? `${summarySource.slice(0, 277).trimEnd()}…`
        : summarySource,
      date: r.exchdisstime ?? "",
      attachmentUrl: normalizeAttachment(r.attchmntFile),
    };
  });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const fromDate = sp.get("from_date") ?? nseDate(7);
  const toDate = sp.get("to_date") ?? nseDate();
  const category = sp.get("category") ?? "";
  const cacheKey = `market:corporate-filings:${fromDate}:${toDate}`;
  try {
    let data = await cache.getOrSet(cacheKey, () => fetchFilings(fromDate, toDate), 5 * 60 * 1000);
    if (category) data = data.filter((d) => d.category === category);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Corporate filing data is unavailable", error);
    return NextResponse.json({ error: "Corporate filing data is temporarily unavailable" }, { status: 502 });
  }
}
