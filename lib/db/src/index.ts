import { drizzle } from "drizzle-orm/node-postgres";
export { count, eq, sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

const requestedPoolSize = Number.parseInt(process.env.DB_POOL_MAX ?? "5", 10);
const poolSize =
  Number.isInteger(requestedPoolSize) && requestedPoolSize >= 1 && requestedPoolSize <= 50
    ? requestedPoolSize
    : 5;

export const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        max: poolSize,
        connectionTimeoutMillis: 5_000,
        idleTimeoutMillis: 30_000,
        ...(process.env.DATABASE_SSL === "true"
          ? { ssl: { rejectUnauthorized: true } }
          : {}),
      }
    : {},
);
export const db = drizzle(pool, { schema });

export * from "./schema";
