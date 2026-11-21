import { pgTable, text, serial, timestamp, real, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const watchlistTable = pgTable(
  "watchlist",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id").notNull().default(1),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    exchange: text("exchange").notNull(),
    addedPrice: real("added_price"),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("watchlist_owner_symbol_unique").on(table.ownerId, table.symbol)],
);

export const insertWatchlistSchema = createInsertSchema(watchlistTable).omit({
  id: true,
  addedAt: true,
});
export type InsertWatchlistItem = z.infer<typeof insertWatchlistSchema>;
export type WatchlistDbItem = typeof watchlistTable.$inferSelect;
