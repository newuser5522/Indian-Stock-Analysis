---
name: Indian stock search
description: Search-result policy for FinTrack's Indian stock experience
---

FinTrack search should prioritize and return Indian-listed symbols only: NSE symbols ending in `.NS` and BSE symbols ending in `.BO`.

**Why:** Yahoo Finance can return US or other global listings ahead of the matching Indian stock, so an apparently valid search such as INFY can navigate to the wrong market.

**How to apply:** Preserve the NSE/BSE filter in both the Next.js search route and the API-server search route, while keeping the UI search usable by name, symbol, slash shortcut, arrow navigation, and Enter-to-select.