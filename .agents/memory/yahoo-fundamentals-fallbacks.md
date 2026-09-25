---
name: Yahoo fundamentals fallbacks
description: Durable constraints for filling missing Indian stock ratios from Yahoo Finance.
---

Yahoo Finance’s quote summary can omit PEG, ROE, ROA, and current ratio even when the underlying annual financial statements contain enough data to calculate them. The fundamentals-timeseries endpoint is the reliable fallback for these fields, and it should be queried one statement type per request because combined type requests may return only one series.

**Why:** The stock detail UI otherwise renders legitimate but incomplete API responses as dashes, which looks like a loading failure to users.

**How to apply:** Prefer summary values first. When absent, fetch annual current assets, current liabilities, total assets, stockholders’ equity, and net income separately; derive current ratio, ROA, and ROE. Only derive PEG when a positive earnings-growth value is available. Treat `.next` as generated cache output and clear it before restarting dev if a vendor-chunk module error appears after a production build.