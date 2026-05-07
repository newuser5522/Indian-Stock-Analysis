import { Router, type IRouter } from "express";
import { fetchQuotes } from "../lib/yahoo-finance";
import { NSE_STOCKS, INDEX_SYMBOLS } from "../lib/stock-list";
import { cache } from "../lib/cache";
import {
  GetMarketOverviewResponse,
  GetTopGainersResponse,
  GetTopLosersResponse,
  GetMostActiveResponse,
  GetTopGainersQueryParams,
  GetTopLosersQueryParams,
  GetMostActiveQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const TTL_INDICES = 60_000;
const TTL_MOVERS = 60_000;

async function getIndexQuotes() {
  return cache.getOrSet("indices", async () => {
    const symbols = INDEX_SYMBOLS.map((i) => i.symbol);
    return fetchQuotes(symbols);
  }, TTL_INDICES);
}

async function getNseQuotes() {
  return cache.getOrSet("nse_all", async () => {
    const symbols = NSE_STOCKS.filter((s) => s.exchange === "NSE").map((s) => s.symbol);
    return fetchQuotes(symbols);
  }, TTL_MOVERS);
}

async function getBseQuotes() {
  return cache.getOrSet("bse_all", async () => {
    const symbols = NSE_STOCKS.filter((s) => s.exchange === "BSE").map((s) => s.symbol);
    return fetchQuotes(symbols);
  }, TTL_MOVERS);
}

async function getAllQuotes() {
  return cache.getOrSet("all_stocks", async () => {
    const symbols = NSE_STOCKS.map((s) => s.symbol);
    return fetchQuotes(symbols);
  }, TTL_MOVERS);
}

export async function warmCache() {
  try {
    await Promise.all([getIndexQuotes(), getNseQuotes()]);
  } catch {
    // best-effort
  }
}

router.get("/market/overview", async (req, res): Promise<void> => {
  try {
    const quotes = await getIndexQuotes();
    const indices = INDEX_SYMBOLS.map((idx) => {
      const q = quotes.find((q) => q.symbol === idx.symbol);
      return {
        symbol: idx.symbol,
        name: idx.name,
        price: q?.regularMarketPrice ?? 0,
        change: q?.regularMarketChange ?? 0,
        changePercent: q?.regularMarketChangePercent ?? 0,
        previousClose: q?.regularMarketPreviousClose ?? 0,
      };
    });
    res.json(GetMarketOverviewResponse.parse({ indices }));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch market overview");
    res.status(500).json({ error: "Failed to fetch market overview" });
  }
});

router.get("/market/top-gainers", async (req, res): Promise<void> => {
  try {
    const params = GetTopGainersQueryParams.safeParse(req.query);
    const limit = params.success ? (params.data.limit ?? 10) : 10;
    const exchange = params.success ? (params.data.exchange ?? "NSE") : "NSE";
    const quotes = exchange === "BSE" ? await getBseQuotes() : exchange === "ALL" ? await getAllQuotes() : await getNseQuotes();
    const enriched = quotes
      .filter((q) => q.regularMarketChangePercent != null)
      .sort((a, b) => (b.regularMarketChangePercent ?? 0) - (a.regularMarketChangePercent ?? 0))
      .slice(0, limit)
      .map((q) => ({
        symbol: q.symbol,
        name: q.shortName ?? q.longName ?? q.symbol,
        exchange,
        price: q.regularMarketPrice ?? 0,
        change: q.regularMarketChange ?? 0,
        changePercent: q.regularMarketChangePercent ?? 0,
        open: q.regularMarketOpen ?? 0,
        high: q.regularMarketDayHigh ?? 0,
        low: q.regularMarketDayLow ?? 0,
        previousClose: q.regularMarketPreviousClose ?? 0,
        volume: q.regularMarketVolume ?? 0,
        marketCap: q.marketCap,
        fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: q.fiftyTwoWeekLow,
        sector: q.sector,
        industry: q.industry,
      }));
    res.json(GetTopGainersResponse.parse({ stocks: enriched }));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch top gainers");
    res.status(500).json({ error: "Failed to fetch top gainers" });
  }
});

router.get("/market/top-losers", async (req, res): Promise<void> => {
  try {
    const params = GetTopLosersQueryParams.safeParse(req.query);
    const limit = params.success ? (params.data.limit ?? 10) : 10;
    const exchange = params.success ? (params.data.exchange ?? "NSE") : "NSE";
    const quotes = exchange === "BSE" ? await getBseQuotes() : exchange === "ALL" ? await getAllQuotes() : await getNseQuotes();
    const enriched = quotes
      .filter((q) => q.regularMarketChangePercent != null)
      .sort((a, b) => (a.regularMarketChangePercent ?? 0) - (b.regularMarketChangePercent ?? 0))
      .slice(0, limit)
      .map((q) => ({
        symbol: q.symbol,
        name: q.shortName ?? q.longName ?? q.symbol,
        exchange,
        price: q.regularMarketPrice ?? 0,
        change: q.regularMarketChange ?? 0,
        changePercent: q.regularMarketChangePercent ?? 0,
        open: q.regularMarketOpen ?? 0,
        high: q.regularMarketDayHigh ?? 0,
        low: q.regularMarketDayLow ?? 0,
        previousClose: q.regularMarketPreviousClose ?? 0,
        volume: q.regularMarketVolume ?? 0,
        marketCap: q.marketCap,
        fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: q.fiftyTwoWeekLow,
        sector: q.sector,
        industry: q.industry,
      }));
    res.json(GetTopLosersResponse.parse({ stocks: enriched }));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch top losers");
    res.status(500).json({ error: "Failed to fetch top losers" });
  }
});

router.get("/market/most-active", async (req, res): Promise<void> => {
  try {
    const params = GetMostActiveQueryParams.safeParse(req.query);
    const limit = params.success ? (params.data.limit ?? 10) : 10;
    const exchange = params.success ? (params.data.exchange ?? "NSE") : "NSE";
    const quotes = exchange === "BSE" ? await getBseQuotes() : exchange === "ALL" ? await getAllQuotes() : await getNseQuotes();
    const enriched = quotes
      .filter((q) => q.regularMarketVolume != null)
      .sort((a, b) => (b.regularMarketVolume ?? 0) - (a.regularMarketVolume ?? 0))
      .slice(0, limit)
      .map((q) => ({
        symbol: q.symbol,
        name: q.shortName ?? q.longName ?? q.symbol,
        exchange,
        price: q.regularMarketPrice ?? 0,
        change: q.regularMarketChange ?? 0,
        changePercent: q.regularMarketChangePercent ?? 0,
        open: q.regularMarketOpen ?? 0,
        high: q.regularMarketDayHigh ?? 0,
        low: q.regularMarketDayLow ?? 0,
        previousClose: q.regularMarketPreviousClose ?? 0,
        volume: q.regularMarketVolume ?? 0,
        marketCap: q.marketCap,
        fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: q.fiftyTwoWeekLow,
        sector: q.sector,
        industry: q.industry,
      }));
    res.json(GetMostActiveResponse.parse({ stocks: enriched }));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch most active");
    res.status(500).json({ error: "Failed to fetch most active" });
  }
});

export default router;
