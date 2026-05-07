import { Router, type IRouter } from "express";
import { fetchQuotes, fetchSummary, fetchHistory, searchYahoo, fetchNseData } from "../lib/yahoo-finance";
import { NSE_STOCKS } from "../lib/stock-list";
import { cache } from "../lib/cache";
import {
  GetStockQuoteResponse,
  GetMultipleQuotesResponse,
  GetStockFundamentalsResponse,
  GetStockHistoryResponse,
  SearchStocksResponse,
  GetStockQuoteParams,
  GetStockFundamentalsParams,
  GetStockHistoryParams,
  GetStockHistoryQueryParams,
  GetMultipleQuotesQueryParams,
  SearchStocksQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/stocks/search", async (req, res): Promise<void> => {
  try {
    const parsed = SearchStocksQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { q, exchange } = parsed.data;
    const raw = await searchYahoo(q);
    const results = raw
      .filter((r) => exchange === "ALL" || (exchange === "NSE" ? r.symbol.endsWith(".NS") : r.symbol.endsWith(".BO")))
      .map((r) => ({
        symbol: r.symbol,
        name: r.shortname ?? r.symbol,
        exchange: r.symbol.endsWith(".NS") ? "NSE" : "BSE",
        sector: r.sector,
      }));
    res.json(SearchStocksResponse.parse({ results }));
  } catch (err) {
    req.log.error({ err }, "Failed to search stocks");
    res.status(500).json({ error: "Failed to search stocks" });
  }
});

router.get("/stocks/quotes", async (req, res): Promise<void> => {
  try {
    const parsed = GetMultipleQuotesQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const symbols = parsed.data.symbols.split(",").map((s) => s.trim()).filter(Boolean);
    const raw = await fetchQuotes(symbols);
    const quotes = raw.map((q) => {
      const info = NSE_STOCKS.find((s) => s.symbol === q.symbol);
      return {
        symbol: q.symbol,
        name: q.shortName ?? q.longName ?? info?.name ?? q.symbol,
        exchange: q.symbol.endsWith(".NS") ? "NSE" : "BSE",
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
        sector: q.sector ?? info?.sector,
        industry: q.industry,
      };
    });
    res.json(GetMultipleQuotesResponse.parse({ quotes }));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch multiple quotes");
    res.status(500).json({ error: "Failed to fetch quotes" });
  }
});

router.get("/stocks/quote/:symbol", async (req, res): Promise<void> => {
  try {
    const params = GetStockQuoteParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const { symbol } = params.data;
    const [quote] = await fetchQuotes([symbol]);
    if (!quote) {
      res.status(404).json({ error: "Stock not found" });
      return;
    }
    const info = NSE_STOCKS.find((s) => s.symbol === symbol);
    res.json(
      GetStockQuoteResponse.parse({
        symbol: quote.symbol,
        name: quote.shortName ?? quote.longName ?? info?.name ?? symbol,
        exchange: symbol.endsWith(".NS") ? "NSE" : "BSE",
        price: quote.regularMarketPrice ?? 0,
        change: quote.regularMarketChange ?? 0,
        changePercent: quote.regularMarketChangePercent ?? 0,
        open: quote.regularMarketOpen ?? 0,
        high: quote.regularMarketDayHigh ?? 0,
        low: quote.regularMarketDayLow ?? 0,
        previousClose: quote.regularMarketPreviousClose ?? 0,
        volume: quote.regularMarketVolume ?? 0,
        marketCap: quote.marketCap,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
        sector: quote.sector ?? info?.sector,
        industry: quote.industry,
      })
    );
  } catch (err) {
    req.log.error({ err }, "Failed to fetch stock quote");
    res.status(500).json({ error: "Failed to fetch stock quote" });
  }
});

router.get("/stocks/fundamentals/:symbol", async (req, res): Promise<void> => {
  try {
    const params = GetStockFundamentalsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const { symbol } = params.data;

    const cacheKey = `fundamentals:${symbol}`;
    const cached = cache.get<ReturnType<typeof GetStockFundamentalsResponse.parse>>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const [summary, [quote], nse] = await Promise.all([
      fetchSummary(symbol),
      fetchQuotes([symbol]),
      fetchNseData(symbol),
    ]);

    const info = NSE_STOCKS.find((s) => s.symbol === symbol);
    const kstat = summary.defaultKeyStatistics ?? {};
    const fin = summary.financialData ?? {};
    const det = summary.summaryDetail ?? {};
    const profile = summary.assetProfile ?? {};
    const price = summary.price ?? {};

    const marketCapCrores =
      nse.marketCapCrores ??
      (det.marketCap?.raw != null ? det.marketCap.raw / 1e7 : undefined) ??
      (quote?.marketCap != null ? quote.marketCap / 1e7 : undefined);

    const body = GetStockFundamentalsResponse.parse({
      symbol,
      name: price.shortName ?? price.longName ?? quote?.shortName ?? quote?.longName ?? info?.name ?? symbol,
      sector: profile.sector ?? nse.sector ?? info?.sector,
      industry: profile.industry ?? nse.industry,
      marketCap: marketCapCrores,
      enterpriseValue: det.enterpriseValue?.raw ?? kstat.enterpriseValue?.raw,
      pe: det.trailingPE?.raw ?? nse.pe ?? quote?.trailingPE,
      forwardPe: det.forwardPE?.raw ?? quote?.forwardPE,
      pb: kstat.priceToBook?.raw ?? quote?.priceToBook,
      ps: det.priceToSalesTrailing12Months?.raw,
      eps: kstat.trailingEps?.raw ?? quote?.trailingEps ?? (nse.pe && quote?.regularMarketPrice ? quote.regularMarketPrice / nse.pe : undefined),
      epsGrowth: (kstat.earningsQuarterlyGrowth?.raw ?? kstat.epsQuarterlyGrowth?.raw)
        ? ((kstat.earningsQuarterlyGrowth?.raw ?? kstat.epsQuarterlyGrowth?.raw)! * 100)
        : undefined,
      dividendYield: det.dividendYield?.raw != null ? det.dividendYield.raw * 100 : undefined,
      dividendRate: det.dividendRate?.raw,
      payoutRatio: det.payoutRatio?.raw != null ? det.payoutRatio.raw * 100 : undefined,
      roe: fin.returnOnEquity?.raw != null ? fin.returnOnEquity.raw * 100 : undefined,
      roa: fin.returnOnAssets?.raw != null ? fin.returnOnAssets.raw * 100 : undefined,
      debtToEquity: fin.debtToEquity?.raw,
      currentRatio: fin.currentRatio?.raw,
      quickRatio: fin.quickRatio?.raw,
      grossMargins: fin.grossMargins?.raw != null ? fin.grossMargins.raw * 100 : undefined,
      operatingMargins: fin.operatingMargins?.raw != null ? fin.operatingMargins.raw * 100 : undefined,
      profitMargins: fin.profitMargins?.raw != null ? fin.profitMargins.raw * 100 : undefined,
      revenue: fin.totalRevenue?.raw,
      revenueGrowth: fin.revenueGrowth?.raw != null ? fin.revenueGrowth.raw * 100 : undefined,
      ebitda: fin.ebitda?.raw,
      freeCashflow: fin.freeCashflow?.raw,
      operatingCashflow: fin.operatingCashflow?.raw,
      bookValue: det.bookValue?.raw,
      analystRating: fin.recommendationKey,
      targetPrice: fin.targetMeanPrice?.raw,
      beta: det.beta?.raw ?? kstat.beta?.raw,
      sharesOutstanding: kstat.sharesOutstanding?.raw ?? nse.sharesOutstanding,
      float: kstat.floatShares?.raw,
      insiderPercent: kstat.heldPercentInsiders?.raw != null ? kstat.heldPercentInsiders.raw * 100 : undefined,
      institutionPercent: kstat.heldPercentInstitutions?.raw != null ? kstat.heldPercentInstitutions.raw * 100 : undefined,
      faceValue: nse.faceValue,
      vwap: nse.vwap,
      deliveryPct: nse.deliveryPct,
      annualVolatility: nse.annualVolatility,
    });

    cache.set(cacheKey, body, 5 * 60_000);
    res.json(body);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch fundamentals");
    res.status(500).json({ error: "Failed to fetch fundamentals" });
  }
});

router.get("/stocks/history/:symbol", async (req, res): Promise<void> => {
  try {
    const pathParams = GetStockHistoryParams.safeParse(req.params);
    if (!pathParams.success) {
      res.status(400).json({ error: pathParams.error.message });
      return;
    }
    const queryParams = GetStockHistoryQueryParams.safeParse(req.query);
    const period = queryParams.success ? (queryParams.data.period ?? "1mo") : "1mo";
    const interval = queryParams.success ? (queryParams.data.interval ?? "1d") : "1d";
    const { symbol } = pathParams.data;
    const candles = await fetchHistory(symbol, period, interval);
    res.json(GetStockHistoryResponse.parse({ symbol, candles }));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch history");
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

export default router;
