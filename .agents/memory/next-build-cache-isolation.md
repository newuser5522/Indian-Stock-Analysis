---
name: Next build cache isolation
description: Shared `.next` output can corrupt a running Next dev workflow when a production build runs concurrently.
---

Stop the Next development workflow before running `next build`; restart it after the build completes.

**Why:** The dev server and production build share the same `.next` directory. A concurrent build can remove or replace webpack chunks while dev requests are using them, causing `MODULE_NOT_FOUND`, missing `routes-manifest.json`, 500 responses, and blank previews.

**How to apply:** For verification, stop the managed Next workflow, run the build, remove `.next` only if the dev cache was already corrupted, then restart the managed workflow and test the preview/API routes.