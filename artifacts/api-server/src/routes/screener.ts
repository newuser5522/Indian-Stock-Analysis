import { Router, type IRouter } from "express";
import { fetchQuotes } from "../lib/yahoo-finance";
import { NSE_STOCKS, SECTORS } from "../lib/stock-list";
import { cache } from "../lib/cache";
import {
  ScreenStocksResponse,
  GetSectorsResponse,
  ScreenStocksQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const TTL = 60_000;

async function getNseQuotes() {
  return cache.getOrSet("nse_all", async () => {
    const symbols = NSE_STOCKS.filter((s) => s.exchange === "NSE").map((s) => s.symbol);
    return fetchQuotes(symbols);
  }, TTL);
}

async function getBseQuotes() {
  return cache.getOrSet("bse_all", async () => {
    const symbols = NSE_STOCKS.filter((s) => s.exchange === "BSE").map((s) => s.symbol);
    return fetchQuotes(symbols);
  }, TTL);
}

async function getAllQuotes() {
  return cache.getOrSet("all_stocks", async () => {
    const symbols = NSE_STOCKS.map((s) => s.symbol);
    return fetchQuotes(symbols);
  }, TTL);
}

router.get("/screener", async (req, res): Promise<void> => {
  try {
    const parsed = ScreenStocksQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { exchange, sector, minMarketCap, maxMarketCap, minPe, maxPe, minPb, maxPb, minDividendYield, minRoe, sortBy, sortOrder, limit } = parsed.data;

    const quotes = exchange === "BSE" ? await getBseQuotes() : exchange === "ALL" ? await getAllQuotes() : await getNseQuotes();

    let stocks = NSE_STOCKS.filter((s) =>
      !exchange || exchange === "ALL" || s.exchange === exchange
    );
    if (sector) {
      stocks = stocks.filter((s) => s.sector === sector);
    }

    let enriched = quotes
      .map((q) => {
        const info = stocks.find((s) => s.symbol === q.symbol);
        if (!info && sector) return null;
        const marketCapCrores = q.marketCap ? q.marketCap / 10_000_000 : undefined;
        return {
          symbol: q.symbol,
          name: q.shortName ?? q.longName ?? info?.name ?? q.symbol,
          exchange: q.symbol.endsWith(".NS") ? "NSE" : "BSE",
          sector: q.sector ?? info?.sector ?? "Unknown",
          price: q.regularMarketPrice ?? 0,
          change: q.regularMarketChange ?? 0,
          changePercent: q.regularMarketChangePercent ?? 0,
          marketCap: marketCapCrores,
          pe: q.trailingPE,
          pb: q.priceToBook,
          dividendYield: q.dividendYield != null ? q.dividendYield * 100 : undefined,
          roe: q.returnOnEquity != null ? q.returnOnEquity * 100 : undefined,
          volume: q.regularMarketVolume ?? 0,
          eps: q.trailingEps,
        };
      })
      .filter((s): s is NonNullable<typeof s> => {
        if (!s) return false;
        if (minMarketCap != null && (s.marketCap == null || s.marketCap < minMarketCap)) return false;
        if (maxMarketCap != null && (s.marketCap == null || s.marketCap > maxMarketCap)) return false;
        if (minPe != null && (s.pe == null || s.pe < minPe)) return false;
        if (maxPe != null && (s.pe == null || s.pe > maxPe)) return false;
        if (minPb != null && (s.pb == null || s.pb < minPb)) return false;
        if (maxPb != null && (s.pb == null || s.pb > maxPb)) return false;
        if (minDividendYield != null && (s.dividendYield == null || s.dividendYield < minDividendYield)) return false;
        if (minRoe != null && (s.roe == null || s.roe < minRoe)) return false;
        return true;
      });

    const sortKey = (sortBy ?? "marketCap") as string;
    const order = (sortOrder ?? "desc") === "desc" ? -1 : 1;
    enriched.sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey] as number | undefined;
      const bv = (b as Record<string, unknown>)[sortKey] as number | undefined;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * order;
    });

    const total = enriched.length;
    enriched = enriched.slice(0, limit ?? 50);

    res.json(ScreenStocksResponse.parse({ stocks: enriched, total }));
  } catch (err) {
    req.log.error({ err }, "Failed to screen stocks");
    res.status(500).json({ error: "Failed to screen stocks" });
  }
});

router.get("/screener/sectors", async (req, res): Promise<void> => {
  try {
    const quotes = await getNseQuotes();
    const sectorMap = new Map<string, { count: number; totalChange: number; totalPe: number; peCount: number; topStock: string; topMarketCap: number }>();

    for (const stock of NSE_STOCKS) {
      const q = quotes.find((q) => q.symbol === stock.symbol);
      const existing = sectorMap.get(stock.sector) ?? { count: 0, totalChange: 0, totalPe: 0, peCount: 0, topStock: stock.name, topMarketCap: 0 };
      existing.count++;
      if (q) {
        existing.totalChange += q.regularMarketChangePercent ?? 0;
        if (q.trailingPE != null && q.trailingPE > 0 && q.trailingPE < 200) {
          existing.totalPe += q.trailingPE;
          existing.peCount++;
        }
        if ((q.marketCap ?? 0) > existing.topMarketCap) {
          existing.topMarketCap = q.marketCap ?? 0;
          existing.topStock = q.shortName ?? stock.name;
        }
      }
      sectorMap.set(stock.sector, existing);
    }

    const sectors = SECTORS.map((sector) => {
      const data = sectorMap.get(sector) ?? { count: 0, totalChange: 0, totalPe: 0, peCount: 0, topStock: "", topMarketCap: 0 };
      return {
        sector,
        stockCount: data.count,
        avgPe: data.peCount > 0 ? data.totalPe / data.peCount : undefined,
        avgChangePercent: data.count > 0 ? data.totalChange / data.count : 0,
        topStock: data.topStock || undefined,
      };
    }).filter((s) => s.stockCount > 0);

    res.json(GetSectorsResponse.parse({ sectors }));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch sectors");
    res.status(500).json({ error: "Failed to fetch sectors" });
  }
});

export default router;
