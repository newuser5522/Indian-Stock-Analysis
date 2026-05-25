const YF_BASE = "https://query1.finance.yahoo.com";
const YF_BASE2 = "https://query2.finance.yahoo.com";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Origin: "https://finance.yahoo.com",
  Referer: "https://finance.yahoo.com/",
};

const NSE_BASE = "https://www.nseindia.com/api";
const NSE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nseindia.com/",
};

export interface NseData {
  pe?: number;
  marketCapCrores?: number;
  vwap?: number;
  faceValue?: number;
  deliveryPct?: number;
  annualVolatility?: number;
  sector?: string;
  industry?: string;
  sharesOutstanding?: number;
}

export async function fetchNseData(symbol: string): Promise<NseData> {
  const nseSymbol = symbol.replace(/\.(NS|BO)$/i, "").toUpperCase();
  try {
    const [quoteRes, tradeRes] = await Promise.all([
      fetch(`${NSE_BASE}/quote-equity?symbol=${encodeURIComponent(nseSymbol)}`, { headers: NSE_HEADERS }),
      fetch(`${NSE_BASE}/quote-equity?symbol=${encodeURIComponent(nseSymbol)}&section=trade_info`, { headers: NSE_HEADERS }),
    ]);

    const result: NseData = {};

    if (quoteRes.ok) {
      const quoteData = (await quoteRes.json()) as {
        metadata?: { pdSymbolPe?: number };
        priceInfo?: { vwap?: number };
        industryInfo?: { macro?: string; sector?: string; industry?: string; basicIndustry?: string };
        securityInfo?: { faceValue?: number; issuedSize?: number };
      };
      result.pe = quoteData.metadata?.pdSymbolPe ?? undefined;
      result.vwap = quoteData.priceInfo?.vwap ?? undefined;
      result.faceValue = quoteData.securityInfo?.faceValue ?? undefined;
      result.sharesOutstanding = quoteData.securityInfo?.issuedSize ?? undefined;
      result.sector = quoteData.industryInfo?.macro ?? undefined;
      result.industry = quoteData.industryInfo?.industry ?? quoteData.industryInfo?.basicIndustry ?? undefined;
    }

    if (tradeRes.ok) {
      const tradeData = (await tradeRes.json()) as {
        marketDeptOrderBook?: { tradeInfo?: { totalMarketCap?: number; cmAnnualVolatility?: string } };
        securityWiseDP?: { deliveryToTradedQuantity?: number };
      };
      result.marketCapCrores = tradeData.marketDeptOrderBook?.tradeInfo?.totalMarketCap ?? undefined;
      const volStr = tradeData.marketDeptOrderBook?.tradeInfo?.cmAnnualVolatility;
      result.annualVolatility = volStr ? parseFloat(volStr) : undefined;
      result.deliveryPct = tradeData.securityWiseDP?.deliveryToTradedQuantity ?? undefined;
    }

    return result;
  } catch {
    return {};
  }
}

async function yfFetch(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Yahoo Finance fetch failed: ${res.status} ${url}`);
  return res.json();
}

export interface YFQuote {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketPreviousClose?: number;
  regularMarketVolume?: number;
  marketCap?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  sector?: string;
  industry?: string;
  exchange?: string;
  trailingPE?: number;
  forwardPE?: number;
  priceToBook?: number;
  trailingEps?: number;
  dividendYield?: number;
  returnOnEquity?: number;
}

interface ChartMeta {
  symbol?: string;
  exchangeName?: string;
  longName?: string;
  shortName?: string;
  regularMarketPrice?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  chartPreviousClose?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
}

async function fetchChartMeta(symbol: string): Promise<YFQuote | null> {
  try {
    const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const data = (await yfFetch(url)) as {
      chart?: {
        result?: {
          meta?: ChartMeta;
          timestamp?: number[];
          indicators?: { quote?: { open?: (number | null)[]; close?: (number | null)[] }[] };
        }[];
      };
    };
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta) return null;

    const price = meta.regularMarketPrice ?? 0;
    const prevClose = meta.chartPreviousClose ?? 0;
    const change = prevClose > 0 ? price - prevClose : 0;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    const quotes = result?.indicators?.quote?.[0];
    const timestamps = result?.timestamp ?? [];
    const prevDayIdx = timestamps.length >= 2 ? timestamps.length - 2 : -1;
    const open = prevDayIdx >= 0 ? (quotes?.open?.[prevDayIdx] ?? price) : price;

    return {
      symbol,
      shortName: meta.shortName,
      longName: meta.longName,
      regularMarketPrice: price,
      regularMarketChange: change,
      regularMarketChangePercent: changePercent,
      regularMarketOpen: open,
      regularMarketDayHigh: meta.regularMarketDayHigh,
      regularMarketDayLow: meta.regularMarketDayLow,
      regularMarketPreviousClose: prevClose,
      regularMarketVolume: meta.regularMarketVolume,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
      exchange: meta.exchangeName,
    };
  } catch {
    return null;
  }
}

export async function fetchQuotes(symbols: string[]): Promise<YFQuote[]> {
  if (symbols.length === 0) return [];
  const BATCH = 20;
  const results: YFQuote[] = [];
  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const fetched = await Promise.all(batch.map(fetchChartMeta));
    for (const q of fetched) {
      if (q) results.push(q);
    }
  }
  return results;
}

export interface YFSummary {
  defaultKeyStatistics?: {
    trailingEps?: { raw?: number };
    forwardEps?: { raw?: number };
    priceToBook?: { raw?: number };
    beta?: { raw?: number };
    floatShares?: { raw?: number };
    sharesOutstanding?: { raw?: number };
    heldPercentInsiders?: { raw?: number };
    heldPercentInstitutions?: { raw?: number };
    earningsQuarterlyGrowth?: { raw?: number };
    pegRatio?: { raw?: number };
  };
  financialData?: {
    currentRatio?: { raw?: number };
    quickRatio?: { raw?: number };
    debtToEquity?: { raw?: number };
    returnOnAssets?: { raw?: number };
    returnOnEquity?: { raw?: number };
    grossMargins?: { raw?: number };
    operatingMargins?: { raw?: number };
    profitMargins?: { raw?: number };
    totalRevenue?: { raw?: number };
    revenueGrowth?: { raw?: number };
    ebitda?: { raw?: number };
    freeCashflow?: { raw?: number };
    operatingCashflow?: { raw?: number };
    totalCash?: { raw?: number };
    totalDebt?: { raw?: number };
    targetMeanPrice?: { raw?: number };
    recommendationKey?: string;
  };
  summaryDetail?: {
    marketCap?: { raw?: number };
    enterpriseValue?: { raw?: number };
    trailingPE?: { raw?: number };
    forwardPE?: { raw?: number };
    priceToSalesTrailing12Months?: { raw?: number };
    dividendYield?: { raw?: number };
    dividendRate?: { raw?: number };
    payoutRatio?: { raw?: number };
    beta?: { raw?: number };
    bookValue?: { raw?: number };
    previousClose?: { raw?: number };
    fiftyTwoWeekHigh?: { raw?: number };
    fiftyTwoWeekLow?: { raw?: number };
    volume?: { raw?: number };
  };
  assetProfile?: {
    sector?: string;
    industry?: string;
    longBusinessSummary?: string;
    country?: string;
    city?: string;
    fullTimeEmployees?: number;
    website?: string;
  };
  price?: {
    shortName?: string;
    longName?: string;
    regularMarketPrice?: { raw?: number };
    regularMarketChange?: { raw?: number };
    regularMarketChangePercent?: { raw?: number };
    regularMarketVolume?: { raw?: number };
    regularMarketOpen?: { raw?: number };
    regularMarketDayHigh?: { raw?: number };
    regularMarketDayLow?: { raw?: number };
    regularMarketPreviousClose?: { raw?: number };
    marketCap?: { raw?: number };
  };
}

let _crumb: string | null = null;
let _cookies: string | null = null;

async function getYFCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  if (_crumb && _cookies) return { crumb: _crumb, cookie: _cookies };
  try {
    const consentRes = await fetch("https://finance.yahoo.com/", {
      headers: { ...HEADERS, Cookie: "GUCS=AZBxCDE0; B=abc123; YahooFinanceFirstCrumb=none" },
      redirect: "follow",
    });
    const setCookieHeader = consentRes.headers.get("set-cookie") ?? "";
    const cookieStr = setCookieHeader.split(",").map((c) => c.split(";")[0].trim()).join("; ");
    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { ...HEADERS, Cookie: cookieStr },
    });
    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.startsWith("{")) return null;
    _crumb = crumb;
    _cookies = cookieStr;
    return { crumb, cookie: cookieStr };
  } catch {
    return null;
  }
}

export async function fetchSummary(symbol: string): Promise<YFSummary> {
  const modules = ["defaultKeyStatistics", "financialData", "summaryDetail", "assetProfile", "price"].join(",");
  try {
    const auth = await getYFCrumb();
    const crumb = auth?.crumb ?? "";
    const cookie = auth?.cookie ?? "";
    const url = `${YF_BASE}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;
    const res = await fetch(url, { headers: { ...HEADERS, ...(cookie ? { Cookie: cookie } : {}) } });
    if (!res.ok) throw new Error(`quoteSummary failed: ${res.status}`);
    const data = (await res.json()) as { quoteSummary?: { result?: YFSummary[] } };
    return data?.quoteSummary?.result?.[0] ?? {};
  } catch {
    return {};
  }
}

export async function fetchHistory(
  symbol: string,
  period: string,
  interval: string
): Promise<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }[]> {
  const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${period}`;
  const data = (await yfFetch(url)) as {
    chart?: {
      result?: {
        timestamp?: number[];
        indicators?: {
          quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[];
        };
      }[];
    };
  };
  const result = data?.chart?.result?.[0];
  if (!result) return [];
  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  return timestamps
    .map((ts, i) => ({
      timestamp: ts,
      open: quote.open?.[i] ?? 0,
      high: quote.high?.[i] ?? 0,
      low: quote.low?.[i] ?? 0,
      close: quote.close?.[i] ?? 0,
      volume: quote.volume?.[i] ?? 0,
    }))
    .filter((c) => c.close > 0);
}

export async function searchYahoo(
  query: string
): Promise<{ symbol: string; shortname: string; exchDisp: string; typeDisp: string; sector?: string }[]> {
  const url = `${YF_BASE}/v1/finance/search?q=${encodeURIComponent(query)}&lang=en-US&region=IN&quotesCount=20&newsCount=0&enableFuzzyQuery=false`;
  const data = (await yfFetch(url)) as {
    quotes?: { symbol: string; shortname: string; exchDisp: string; typeDisp: string; sector?: string }[];
  };
  return (data?.quotes ?? []).filter((q) => q.typeDisp === "equity" || q.typeDisp === "Equity");
}

/* ─── News ─────────────────────────────────────────────────────────────── */

export interface YFNewsItem {
  uuid: string;
  title: string;
  publisher: string;
  link: string;
  providerPublishTime: number;
  type: string;
  relatedTickers?: string[];
  thumbnail?: { resolutions?: { url: string; width: number }[] };
  summary?: string;
}

export async function fetchMarketNews(count = 25): Promise<YFNewsItem[]> {
  try {
    // Fetch news via search for broad Indian market terms
    const queries = ["NIFTY India stocks", "BSE NSE market", "Indian stocks"];
    const allNews: YFNewsItem[] = [];
    const seen = new Set<string>();
    for (const q of queries) {
      try {
        const url = `${YF_BASE}/v1/finance/search?q=${encodeURIComponent(q)}&lang=en-US&region=IN&quotesCount=0&newsCount=15&enableFuzzyQuery=false`;
        const data = (await yfFetch(url)) as { news?: YFNewsItem[] };
        for (const n of data?.news ?? []) {
          if (!seen.has(n.uuid)) { seen.add(n.uuid); allNews.push(n); }
        }
        if (allNews.length >= count) break;
      } catch { /* skip query */ }
    }
    return allNews.slice(0, count).sort((a, b) => b.providerPublishTime - a.providerPublishTime);
  } catch {
    return [];
  }
}

export async function fetchStockNews(symbol: string, count = 15): Promise<YFNewsItem[]> {
  try {
    const url = `${YF_BASE}/v1/finance/search?q=${encodeURIComponent(symbol)}&lang=en-US&region=IN&quotesCount=0&newsCount=${count}&enableFuzzyQuery=false`;
    const data = (await yfFetch(url)) as { news?: YFNewsItem[] };
    return (data?.news ?? []).sort((a, b) => b.providerPublishTime - a.providerPublishTime);
  } catch {
    return [];
  }
}

/* ─── Sector indices ───────────────────────────────────────────────────── */

export const SECTOR_INDICES = [
  { symbol: "^NSEBANK", name: "Nifty Bank", sector: "Banking" },
  { symbol: "^CNXIT", name: "Nifty IT", sector: "IT" },
  { symbol: "^CNXAUTO", name: "Nifty Auto", sector: "Auto" },
  { symbol: "^CNXPHARMA", name: "Nifty Pharma", sector: "Pharma" },
  { symbol: "^CNXFMCG", name: "Nifty FMCG", sector: "FMCG" },
  { symbol: "^CNXMETAL", name: "Nifty Metal", sector: "Metals" },
  { symbol: "^CNXENERGY", name: "Nifty Energy", sector: "Energy" },
  { symbol: "^CNXINFRA", name: "Nifty Infra", sector: "Infrastructure" },
  { symbol: "^CNXREALTY", name: "Nifty Realty", sector: "Realty" },
  { symbol: "^CNX100", name: "Nifty 100 (Midcap)", sector: "Midcap" },
  { symbol: "^CNXSC", name: "Nifty Smallcap", sector: "Smallcap" },
];

export interface SectorIndexQuote extends YFQuote {
  sectorName: string;
}

export async function fetchSectorIndices(): Promise<SectorIndexQuote[]> {
  const results = await Promise.all(
    SECTOR_INDICES.map(async (si) => {
      const q = await fetchChartMeta(si.symbol);
      if (!q) return null;
      return {
        ...q,
        symbol: si.symbol,
        shortName: si.name,
        sectorName: si.sector,
      } as SectorIndexQuote;
    })
  );
  return results.filter(Boolean) as SectorIndexQuote[];
}

/* ─── Sector performance for RRG ──────────────────────────────────────── */
export interface SectorPerf {
  sector: string;
  symbol: string;
  name: string;
  change1d: number;
  change1w: number;
  change1m: number;
  change3m: number;
  rsRatio: number;   // RS-Ratio vs Nifty (simplified: 3m relative perf)
  rsMomentum: number; // RS-Momentum (1m relative perf)
  quadrant: "Leading" | "Weakening" | "Lagging" | "Improving";
}

export async function fetchSectorPerformance(): Promise<SectorPerf[]> {
  // Fetch Nifty 50 for benchmark
  const benchmarkPromise = fetchHistory("^NSEI", "6mo", "1d");
  const sectorPromises = SECTOR_INDICES.map(si => fetchHistory(si.symbol, "6mo", "1d"));
  const [benchmark, ...sectorHistories] = await Promise.all([benchmarkPromise, ...sectorPromises]);

  function lastN(arr: { close: number }[], n: number) {
    return arr.length >= n ? arr.slice(-n) : arr;
  }
  function pctChange(arr: { close: number }[], n: number): number {
    const data = lastN(arr, n);
    if (data.length < 2) return 0;
    return ((data[data.length - 1].close - data[0].close) / data[0].close) * 100;
  }

  const benchmarkChange3m = pctChange(benchmark, 66);
  const benchmarkChange1m = pctChange(benchmark, 22);

  return SECTOR_INDICES.map((si, i) => {
    const hist = sectorHistories[i];
    const change1d = pctChange(hist, 2);
    const change1w = pctChange(hist, 6);
    const change1m = pctChange(hist, 22);
    const change3m = pctChange(hist, 66);

    // RS-Ratio: sector 3m perf relative to benchmark, normalized to 100
    const rsRatio = 100 + (change3m - benchmarkChange3m);
    // RS-Momentum: sector 1m perf relative to benchmark 1m
    const rsMomentum = 100 + (change1m - benchmarkChange1m);

    const quadrant: "Leading" | "Weakening" | "Lagging" | "Improving" =
      rsRatio >= 100 && rsMomentum >= 100 ? "Leading" :
      rsRatio >= 100 && rsMomentum < 100 ? "Weakening" :
      rsRatio < 100 && rsMomentum < 100 ? "Lagging" : "Improving";

    return {
      sector: si.sector,
      symbol: si.symbol,
      name: si.name,
      change1d,
      change1w,
      change1m,
      change3m,
      rsRatio,
      rsMomentum,
      quadrant,
    };
  });
}

/* ─── Sector heatmap ───────────────────────────────────────────────────── */
export interface HeatmapSector {
  sector: string;
  change1d: number;
  marketCapCr: number;
  stockCount: number;
  topStocks: string[];
}

/* ─── History table (66 days) ──────────────────────────────────────────── */
export interface HistoryTableRow {
  date: string; // "DD Mon"
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change1d: number;
  change5d: number | null;
  change22d: number | null;
  change66d: number | null;
  rsi: number | null;
}

function computeRSI14(closes: number[]): (number | null)[] {
  const period = 14;
  const rsi: (number | null)[] = new Array(period).fill(null);
  if (closes.length <= period) return rsi;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return rsi;
}

export async function fetchHistoryTable(symbol: string): Promise<HistoryTableRow[]> {
  // Fetch 6 months to have enough data for 66D lookback + RSI(14) warm-up
  const hist = await fetchHistory(symbol, "6mo", "1d");
  if (hist.length === 0) return [];

  const closes = hist.map(h => h.close);
  const rsiArr = computeRSI14(closes);

  const rows: HistoryTableRow[] = [];
  // Only return last 80 rows (plenty for display)
  const start = Math.max(0, hist.length - 80);

  for (let i = start; i < hist.length; i++) {
    const h = hist[i];
    const c = closes[i];
    const prev = closes[i - 1] ?? c;
    const change1d = prev > 0 ? ((c - prev) / prev) * 100 : 0;
    const c5 = i >= 5 ? closes[i - 5] : null;
    const c22 = i >= 22 ? closes[i - 22] : null;
    const c66 = i >= 66 ? closes[i - 66] : null;
    const d = new Date(h.timestamp * 1000);
    const dateStr = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    rows.push({
      date: dateStr,
      timestamp: h.timestamp,
      open: h.open,
      high: h.high,
      low: h.low,
      close: h.close,
      volume: h.volume,
      change1d,
      change5d: c5 != null ? ((c - c5) / c5) * 100 : null,
      change22d: c22 != null ? ((c - c22) / c22) * 100 : null,
      change66d: c66 != null ? ((c - c66) / c66) * 100 : null,
      rsi: rsiArr[i] ?? null,
    });
  }
  return rows.reverse(); // most recent first
}

// suppress unused import warning
void YF_BASE2;
