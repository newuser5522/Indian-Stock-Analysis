import { pgTable, text, serial, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const portfolioTable = pgTable("portfolio", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  name: text("name").notNull().default(""),
  exchange: text("exchange").notNull().default("NSE"),
  quantity: real("quantity").notNull(),
  avgPrice: real("avg_price").notNull(),
  purchaseDate: text("purchase_date"),
  notes: text("notes"),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPortfolioSchema = createInsertSchema(portfolioTable).omit({
  id: true,
  addedAt: true,
});
export type InsertPortfolioItem = z.infer<typeof insertPortfolioSchema>;
export type PortfolioDbItem = typeof portfolioTable.$inferSelect;
