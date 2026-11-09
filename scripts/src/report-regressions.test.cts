import assert from "node:assert/strict";
import test from "node:test";
import { applyQuery, PRESETS, type StockRow } from "../../artifacts/nextjs-screener/src/lib/query-parser";
import { cache } from "../../artifacts/nextjs-screener/src/lib/cache";
import { displaySymbol, formatMarketCap, formatPrice } from "../../artifacts/nextjs-screener/src/lib/format";
import { validatePortfolioInput } from "../../artifacts/nextjs-screener/src/lib/portfolio-validation";
import { buildPortfolioRisk } from "../../artifacts/nextjs-screener/src/lib/portfolio-risk";

function stock(overrides: Partial<StockRow> = {}): StockRow {
  return {
    symbol: "X",
    name: "X",
    sector: "",
    exchange: "NSE",
    price: 100,
    change_pct: 0,
    volume: 1,
    pe: null,
    forward_pe: null,
    pb: null,
    market_cap: null,
    eps: null,
    roe: null,
    div_yield: null,
    week52_high: null,
    week52_low: null,
    ...overrides,
  };
}

test("query screener honors AND precedence and parentheses", () => {
  const rows = [
    stock({ symbol: "A", pe: 10, roe: 30, pb: 5 }),
    stock({ symbol: "B", pe: 50, roe: 30, pb: 0.5 }),
    stock({ symbol: "C", pe: 10, roe: 5, pb: 0.5 }),
  ];
  assert.deepEqual(
    applyQuery(rows, "pe < 15 AND roe > 20 OR pb < 1").results.map((row) => row.symbol),
    ["A", "B", "C"],
  );
  assert.deepEqual(
    applyQuery(rows, "pe < 15 AND (roe > 20 OR pb < 1)").results.map((row) => row.symbol),
    ["A", "C"],
  );
});

test("query screener accepts the 52-week preset and rejects malformed numeric syntax", () => {
  const rows = [stock({ symbol: "near", price: 95, week52_high: 100 })];
  const preset = PRESETS.find(({ label }) => label === "52W Near High");
  assert.ok(preset);
  assert.deepEqual(applyQuery(rows, preset.query).results.map((row) => row.symbol), ["near"]);
  for (const query of ["pe < 1.2.3", "pe < .", "pe < 5.", "pe < 1e3 AND", "pe < 1 AND AND roe > 2"]) {
    assert.ok(applyQuery(rows, query).error, `${query} should be rejected`);
  }
  assert.equal(applyQuery(rows, "pe < 1e3").error, undefined);
});

test("portfolio validation bounds numeric values and rejects future purchase dates", () => {
  const valid = {
    symbol: "TCS.NS",
    quantity: 16_777_217,
    avgPrice: 1,
    purchaseDate: null,
  };
  const accepted = validatePortfolioInput(valid);
  assert.ok("value" in accepted);
  if ("value" in accepted) assert.equal(accepted.value.quantity, 16_777_217);
  assert.ok("error" in validatePortfolioInput({ ...valid, quantity: 1e39 }));
  assert.ok("error" in validatePortfolioInput({ ...valid, purchaseDate: "2099-01-01" }));
});

test("formatters handle invalid numbers and rounded crore boundaries", () => {
  assert.equal(formatPrice(Number.NaN), "—");
  assert.equal(formatMarketCap(99_999), "₹1.00L Cr");
  assert.equal(displaySymbol("A.NSE.NS"), "A.NSE");
});

test("portfolio sector lookup normalizes Yahoo suffixes", () => {
  const result = buildPortfolioRisk(
    [{ symbol: "TCS.NS", name: "TCS", currentValue: 1_000, quoteAvailable: true, history: [] }],
    [],
    new Map([["TCS", "Technology"]]),
  );
  assert.equal(result.positions[0]?.sector, "Technology");
  assert.equal(result.sectorExposure[0]?.sector, "Technology");
});

test("cache retries after empty values and exceptions", async () => {
  let emptyCalls = 0;
  await cache.getOrSet("test:empty-result", async () => { emptyCalls++; return []; }, 60_000);
  await cache.getOrSet("test:empty-result", async () => { emptyCalls++; return []; }, 60_000);
  assert.equal(emptyCalls, 2);

  let attempts = 0;
  await assert.rejects(
    cache.getOrSet("test:failed-result", async () => {
      attempts++;
      throw new Error("upstream unavailable");
    }, 60_000),
  );
  await cache.getOrSet("test:failed-result", async () => { attempts++; return ["ok"]; }, 60_000);
  assert.equal(attempts, 2);
});
