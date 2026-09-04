import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, watchlistTable } from "@workspace/db";
import { fetchQuotes } from "../lib/yahoo-finance";
import {
  GetWatchlistResponse,
  AddToWatchlistBody,
  RemoveFromWatchlistParams,
  RemoveFromWatchlistResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/watchlist", async (req, res): Promise<void> => {
  try {
    const items: (typeof watchlistTable.$inferSelect)[] = await db
      .select()
      .from(watchlistTable)
      .orderBy(watchlistTable.addedAt);
    if (items.length === 0) {
      res.json(GetWatchlistResponse.parse({ items: [] }));
      return;
    }
    const symbols = items.map((i) => i.symbol);
    const quotes = await fetchQuotes(symbols);
    const enriched = items.map((item) => {
      const q = quotes.find((q) => q.symbol === item.symbol);
      return {
        id: item.id,
        symbol: item.symbol,
        name: item.name,
        exchange: item.exchange,
        addedAt: item.addedAt.toISOString(),
        price: q?.regularMarketPrice,
        change: q?.regularMarketChange,
        changePercent: q?.regularMarketChangePercent,
      };
    });
    res.json(GetWatchlistResponse.parse({ items: enriched }));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch watchlist");
    res.status(500).json({ error: "Failed to fetch watchlist" });
  }
});

router.post("/watchlist", async (req, res): Promise<void> => {
  try {
    const parsed = AddToWatchlistBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const existing = await db
      .select()
      .from(watchlistTable)
      .where(eq(watchlistTable.symbol, parsed.data.symbol));
    if (existing.length > 0) {
      const item = existing[0];
      res.status(201).json({
        id: item.id,
        symbol: item.symbol,
        name: item.name,
        exchange: item.exchange,
        addedAt: item.addedAt.toISOString(),
      });
      return;
    }
    const [item] = await db
      .insert(watchlistTable)
      .values(parsed.data)
      .returning();
    res.status(201).json({
      id: item.id,
      symbol: item.symbol,
      name: item.name,
      exchange: item.exchange,
      addedAt: item.addedAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to add to watchlist");
    res.status(500).json({ error: "Failed to add to watchlist" });
  }
});

router.delete("/watchlist/:symbol", async (req, res): Promise<void> => {
  try {
    const params = RemoveFromWatchlistParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    await db
      .delete(watchlistTable)
      .where(eq(watchlistTable.symbol, params.data.symbol));
    res.json(RemoveFromWatchlistResponse.parse({ success: true }));
  } catch (err) {
    req.log.error({ err }, "Failed to remove from watchlist");
    res.status(500).json({ error: "Failed to remove from watchlist" });
  }
});

export default router;
