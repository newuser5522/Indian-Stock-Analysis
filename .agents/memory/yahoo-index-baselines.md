---
name: Yahoo index baselines
description: How to avoid incorrect daily changes for NSE/BSE index cards.
---

Yahoo’s chart endpoint can return a stale or mismatched chartPreviousClose for index symbols when queried with interval=1d and range=5d. For index symbols beginning with `^`, the interval=1m and range=1d request returns the session-aligned previous close and produces the exchange-like change shown by TradingView.

**Why:** Using the daily metadata produced a large false loss for NIFTY even though the live price was correct.

**How to apply:** Keep the existing daily chart request for individual stocks. Branch index symbols to the intraday request before calculating regularMarketChange and regularMarketChangePercent.