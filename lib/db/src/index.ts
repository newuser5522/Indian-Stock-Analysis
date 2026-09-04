import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

let pool: pg.Pool | null = null;
let db: any = null;

if (process.env.DATABASE_URL) {
  try {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle(pool, { schema });
  } catch (err) {
    console.error("Failed to connect to database:", err);
    console.warn(
      "Database features will be unavailable. Set a valid DATABASE_URL to enable watchlist, portfolio, and alerts.",
    );
  }
} else {
  console.warn(
    "DATABASE_URL not set. Database features will be unavailable. Some features like watchlist, portfolio, and alerts will not work.",
  );
}

export { pool, db };
export * from "./schema";
