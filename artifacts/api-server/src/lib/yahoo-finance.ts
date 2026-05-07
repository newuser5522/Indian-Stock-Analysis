const YF_BASE = "https://query1.finance.yahoo.com";
const YF_BASE2 = "https://query2.finance.yahoo.com";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Origin: "https://finance.yahoo.com",
  Referer: "https://finance.yahoo.com/",
};

const NSE_BASE = "https://www.nseindia.com/api";
const NSE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
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
      fetch(`${NSE_BASE}/quote-equity?symbol=${encodeURIComponent(nseSymbol)}`, {
        headers: NSE_HEADERS,
      }),
      fetch(
        `${NSE_BASE}/quote-equity?symbol=${encodeURIComponent(nseSymbol)}&section=trade_info`,
        { headers: NSE_HEADERS }
      ),
    ]);

    const result: NseData = {};

    if (quoteRes.ok) {
      const quoteData = (await quoteRes.json()) as {
        metadata?: { pdSymbolPe?: number };
        priceInfo?: { vwap?: number };
        industryInfo?: {
          macro?: string;
          sector?: string;
          industry?: string;
          basicIndustry?: string;
        };
        securityInfo?: { faceValue?: number; issuedSize?: number };
      };
      result.pe = quoteData.metadata?.pdSymbolPe ?? undefined;
      result.vwap = quoteData.priceInfo?.vwap ?? undefined;
      result.faceValue = quoteData.securityInfo?.faceValue ?? undefined;
      result.sharesOutstanding = quoteData.securityInfo?.issuedSize ?? undefined;
      result.sector = quoteData.industryInfo?.macro ?? undefined;
      result.industry =
        quoteData.industryInfo?.industry ??
        quoteData.industryInfo?.basicIndustry ??
        undefined;
    }

    if (tradeRes.ok) {
      const tradeData = (await tradeRes.json()) as {
        marketDeptOrderBook?: {
          tradeInfo?: {
            totalMarketCap?: number;
            cmAnnualVolatility?: string;
          };
        };
        securityWiseDP?: { deliveryToTradedQuantity?: number };
      };
      result.marketCapCrores =
        tradeData.marketDeptOrderBook?.tradeInfo?.totalMarketCap ?? undefined;
      const volStr = tradeData.marketDeptOrderBook?.tradeInfo?.cmAnnualVolatility;
      result.annualVolatility = volStr ? parseFloat(volStr) : undefined;
      result.deliveryPct =
        tradeData.securityWiseDP?.deliveryToTradedQuantity ?? undefined;
    }

    return result;
  } catch {
    return {};
  }
}

async function yfFetch(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`Yahoo Finance fetch failed: ${res.status} ${url}`);
  }
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
  currency?: string;
  exchangeName?: string;
  longName?: string;
  shortName?: string;
  regularMarketPrice?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  regularMarketTime?: number;
  chartPreviousClose?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  priceHint?: number;
}

async function fetchChartMeta(symbol: string): Promise<YFQuote | null> {
  try {
    const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const data = (await yfFetch(url)) as { chart?: { result?: { meta?: ChartMeta; timestamp?: number[]; indicators?: { quote?: { open?: (number|null)[]; high?: (number|null)[]; low?: (number|null)[]; close?: (number|null)[]; volume?: (number|null)[] }[] } }[] } };
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
    const open = prevDayIdx >= 0 ? (quotes?.open?.[prevDayIdx] ?? meta.regularMarketPrice ?? 0) : (meta.regularMarketPrice ?? 0);

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
    enterpriseValue?: { raw?: number };
    trailingEps?: { raw?: number };
    forwardEps?: { raw?: number };
    priceToBook?: { raw?: number };
    beta?: { raw?: number };
    floatShares?: { raw?: number };
    sharesOutstanding?: { raw?: number };
    heldPercentInsiders?: { raw?: number };
    heldPercentInstitutions?: { raw?: number };
    epsQuarterlyGrowth?: { raw?: number };
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
      headers: {
        ...HEADERS,
        Cookie: "GUCS=AZBxCDE0; B=abc123; YahooFinanceFirstCrumb=none",
      },
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
    const res = await fetch(url, {
      headers: { ...HEADERS, ...(cookie ? { Cookie: cookie } : {}) },
    });
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
          quote?: {
            open?: (number | null)[];
            high?: (number | null)[];
            low?: (number | null)[];
            close?: (number | null)[];
            volume?: (number | null)[];
          }[];
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

export async function searchYahoo(query: string): Promise<{ symbol: string; shortname: string; exchDisp: string; typeDisp: string; sector?: string }[]> {
  const url = `${YF_BASE}/v1/finance/search?q=${encodeURIComponent(query)}&lang=en-US&region=IN&quotesCount=20&newsCount=0&enableFuzzyQuery=false`;
  const data = (await yfFetch(url)) as { quotes?: { symbol: string; shortname: string; exchDisp: string; typeDisp: string; sector?: string }[] };
  return (data?.quotes ?? []).filter(
    (q) => q.typeDisp === "equity" || q.typeDisp === "Equity"
  );
}
