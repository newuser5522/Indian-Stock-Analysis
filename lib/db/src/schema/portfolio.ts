import { pgTable, text, serial, timestamp, doublePrecision, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const portfolioGroupTable = pgTable("portfolio_groups", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull().default(1),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const portfolioTable = pgTable("portfolio", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull().default(1),
  portfolioId: integer("portfolio_id").notNull().default(1),
  symbol: text("symbol").notNull(),
  name: text("name").notNull().default(""),
  exchange: text("exchange").notNull().default("NSE"),
  quantity: doublePrecision("quantity").notNull(),
  avgPrice: doublePrecision("avg_price").notNull(),
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
