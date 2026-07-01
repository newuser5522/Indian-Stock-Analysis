# Indian Stock Screener

A full-stack Next.js 15 App Router app for screening NSE/BSE stocks with live Yahoo Finance data, fundamentals, RSI charts, and a PostgreSQL watchlist.

## Run & Operate

- `pnpm --filter @workspace/nextjs-screener run dev` — Next.js dev server (port 24507, path `/nextjs/`)
- `pnpm --filter @workspace/api-server run dev` — Legacy Express API (port 8080, path `/api/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- **Next.js 15** App Router (primary app at `/nextjs/`)
- Legacy API: Express 5 (still running at `/api/`)
- DB: PostgreSQL + Drizzle ORM (`@workspace/db`)
- Styling: Tailwind CSS v4 + shadcn/ui components
- Charts: Recharts (price + RSI charts)
- Data fetching: React Query (@tanstack/react-query)
- Data sources: Yahoo Finance API + NSE India API

## Where things live

```
artifacts/nextjs-screener/
  src/
    app/                     # Next.js App Router pages
      page.tsx               # Market overview (indices + movers)
      screener/page.tsx      # Stock screener with filters
      watchlist/page.tsx     # Watchlist management
      stock/[symbol]/page.tsx # Stock detail (chart + fundamentals)
      api/
        market/{overview,top-gainers,top-losers,most-active}/
        screener/{route,sectors}/
        stocks/{quote,fundamentals,history,quotes,search}/[symbol]/
        watchlist/{route,[symbol]}/
    lib/
      yahoo-finance.ts       # Yahoo Finance + NSE India API client
      stock-list.ts          # 109 NSE stocks + index symbols + sectors
      cache.ts               # Simple in-memory TTL cache
      format.ts              # Price/change/volume formatters
      api-url.ts             # Client-side URL helper (uses NEXT_PUBLIC_BASE_PATH)
    components/
      navbar.tsx             # Navigation bar
      providers.tsx          # React Query + Sonner providers
      ui/                    # shadcn/ui components (scaffolded)

lib/db/src/schema/watchlist.ts  # PostgreSQL watchlist schema
```

## Architecture decisions

- **Next.js basePath `/nextjs`**: avoids conflict with the legacy Express API at `/api`. Client fetches use `apiUrl('/...')` which prepends `NEXT_PUBLIC_BASE_PATH`.
- **Server-side caching**: In-memory TTL cache (`src/lib/cache.ts`) per Next.js process. Market data: 60s TTL, fundamentals: 5min TTL, screener quotes: 2min TTL.
- **Yahoo Finance**: Uses chart API v8 (no auth required) for quotes/history. Uses quoteSummary v10 with crumb for fundamentals, falling back to a crumbless `v7/finance/quote` call (`fetchQuoteFallback` in `yahoo-finance.ts`) if the crumb/session fails.
- **Screener search**: `api/screener/route.ts` uses `searchYahoo` for a live, symbol-search-based stock listing rather than filtering only the static `NSE_STOCKS` list; the screener page has a search box wired to this.
- **Fundamentals fallback chain**: `api/stocks/fundamentals/[symbol]/route.ts` merges `fetchSummary` (quoteSummary), `fetchQuotes`, and `fetchNseData` (NSE India quote-equity API) results, since any one source can be missing fields or blocked.
- **RSI(14)**: Computed client-side from OHLCV history data in the stock detail page.
- **DB imports in API routes**: `@workspace/db` is a workspace package imported directly into Next.js API routes — no need for a separate Express layer.

## Product

- **Market Overview**: Live Nifty 50, Sensex, Bank Nifty, IT, Auto, Pharma index cards; top gainers/losers/most-active
- **Stock Screener**: Filter 109+ NSE stocks by exchange, sector, P/E, P/B, market cap; sort by any metric
- **Stock Detail**: Live price, OHLCV stats, 52-week range, price chart with period selector, RSI(14) chart, full fundamentals panel with analyst consensus
- **Watchlist**: PostgreSQL-backed; search + add stocks, remove stocks, live price updates

## User preferences

- Personal use only — no auth required
- Dark navy theme throughout
- NSE/BSE data via Yahoo Finance + NSE India APIs (no paid API keys)

## Gotchas

- `NEXT_PUBLIC_BASE_PATH` must be set to `/nextjs` for client-side fetch calls to route correctly through the proxy
- Yahoo Finance crumb is session-bound; if `fetchSummary` fails, fundamentals will return empty (non-fatal)
- The in-memory cache resets on each Next.js server restart (dev) — that's expected behavior
- Do not run `pnpm dev` at workspace root; use the workflow or `pnpm --filter` syntax

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
