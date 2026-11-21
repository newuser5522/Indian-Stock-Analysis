import assert from "node:assert/strict";
import test from "node:test";
import { applyQuery, PRESETS, type StockRow } from "../../artifacts/nextjs-screener/src/lib/query-parser";
import { cache } from "../../artifacts/nextjs-screener/src/lib/cache";
import { displaySymbol, formatMarketCap, formatPrice } from "../../artifacts/nextjs-screener/src/lib/format";
import { validatePortfolioInput, validatePortfolioUpdate } from "../../artifacts/nextjs-screener/src/lib/portfolio-validation";
import { buildPortfolioRisk } from "../../artifacts/nextjs-screener/src/lib/portfolio-risk";
import { calculatePortfolioCagr } from "../../artifacts/nextjs-screener/src/lib/portfolio-cagr";
import { hashPassword, validatePassword, verifyPassword } from "../../artifacts/nextjs-screener/src/lib/account-password";
import {
  getQuarterlyShareholdingChange,
  getShareholdingPercent,
  getShareholdingPeriods,
} from "../../artifacts/nextjs-screener/src/lib/nse-shareholding";
import {
  calculateIndicator,
  calculateIndicatorComponents,
  relativeStrengthIndex,
} from "../../artifacts/nextjs-screener/src/lib/chart-analysis";
import {
  buildSumSpreadSeries,
  normalizeClosesInTimeRange,
  normalizeVisibleCloses,
} from "../../artifacts/nextjs-screener/src/lib/chart-comparison";
import { isStockAlertTriggered } from "../../artifacts/nextjs-screener/src/lib/stock-alerts";

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
  const aliased = stock({ pe: 10, pb: 1, market_cap: 10_000, div_yield: 3 });
  assert.deepEqual(
    applyQuery(
      [aliased],
      "price_to_earnings < 15 AND price_to_book < 2 AND market_capitalization >= 10000 AND dividend_yield > 2",
    ).results,
    [aliased],
  );
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
  const formStyle = validatePortfolioInput({
    symbol: "tcs.ns",
    quantity: "16777217",
    avgPrice: "1.5",
    purchaseDate: "",
    name: "",
    exchange: "",
    notes: "",
  });
  assert.ok("value" in formStyle);
  if ("value" in formStyle) {
    assert.equal(formStyle.value.quantity, 16_777_217);
    assert.equal(formStyle.value.avgPrice, 1.5);
    assert.equal(formStyle.value.purchaseDate, null);
  }
  const update = validatePortfolioUpdate({ quantity: "2", avgPrice: "10.5", purchaseDate: "" });
  assert.ok("value" in update);
  if ("value" in update) {
    assert.equal(update.value.quantity, 2);
    assert.equal(update.value.avgPrice, 10.5);
    assert.equal(update.value.purchaseDate, null);
  }
  assert.ok("error" in validatePortfolioInput({ ...valid, quantity: 1e39 }));
  assert.ok("error" in validatePortfolioInput({ ...valid, purchaseDate: "2099-01-01" }));
  assert.ok("error" in validatePortfolioInput({ ...valid, portfolioId: 0 }));
});

test("portfolio CAGR handles dated cash flows and requires complete purchase dates", () => {
  const cagr = calculatePortfolioCagr(
    [{ invested: 100, currentValue: 121, purchaseDate: "2020-01-01" }],
    new Date("2022-01-01T00:00:00.000Z"),
  );
  assert.ok(cagr != null && Math.abs(cagr - 10) < 0.1);
  assert.equal(
    calculatePortfolioCagr(
      [{ invested: 100, currentValue: 110, purchaseDate: null }],
      new Date("2022-01-01T00:00:00.000Z"),
    ),
    null,
  );
});

test("shareholding parses reported percentages and compares adjacent quarters in percentage points", () => {
  const periods = getShareholdingPeriods({
    "30-06-2024": [
      { category: "Promoter & Promoter Group", "shareholdingPercentage": "53.21%" },
    ],
    "31-03-2024": [
      { category: "Promoter & Promoter Group", "shareholdingPercentage": "52.80%" },
    ],
  });
  const previous = periods[0];
  assert.ok(previous);
  assert.equal(getShareholdingPercent(previous.rows, ["Promoter & Promoter Group"]), 52.8);
  const change = getQuarterlyShareholdingChange(periods, ["Promoter & Promoter Group"]);
  assert.ok(change != null && Math.abs(change - 0.41) < 1e-8);
  assert.equal(getShareholdingPercent([{ category: "Promoter & Promoter Group", percentage: "101" }], ["Promoter & Promoter Group"]), null);
});

test("RSI uses Wilder smoothing and MACD histogram is MACD minus its signal line", () => {
  const closes = Array.from({ length: 45 }, (_, index) =>
    100 + index * 0.7 + Math.sin(index * 0.8) * 2,
  );
  const rsi = relativeStrengthIndex(closes);
  assert.equal(rsi[13], null);
  assert.ok(rsi[14] != null && rsi[14] >= 0 && rsi[14] <= 100);

  const bars = closes.map((close, index) => ({
    timestamp: index * 86_400,
    open: close - 0.3,
    high: close + 0.7,
    low: close - 0.8,
    close,
    volume: 1_000 + index,
  }));
  const macd = calculateIndicatorComponents(bars, "macd");
  const dif = macd[0]?.values[40];
  const signal = macd[1]?.values[40];
  const histogram = macd[2]?.values[40];
  assert.ok(dif != null && signal != null && histogram != null);
  assert.ok(Math.abs(histogram - (dif - signal)) < 1e-12);

  const rsiComponents = calculateIndicatorComponents(bars, "rsi");
  const rsiValue = rsiComponents[0]?.values[27];
  const rsiMovingAverage = rsiComponents[1]?.values[27];
  assert.ok(rsiValue != null && rsiMovingAverage != null);
  const expectedRsiAverage = rsi
    .slice(14, 28)
    .reduce<number>((sum, value) => sum + (value ?? 0), 0) / 14;
  assert.ok(Math.abs(rsiMovingAverage - expectedRsiAverage) < 1e-12);
});

test("EMA presets use the selected period and SMA-seeded EMA recurrence", () => {
  const closes = Array.from({ length: 205 }, (_, index) => 50 + index);
  const bars = closes.map((close, index) => ({
    timestamp: index * 86_400,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1_000,
  }));
  const ema200 = calculateIndicator(bars, "ema200");
  assert.equal(ema200[198], null);
  assert.equal(ema200[199], 149.5);
  const expectedNext = ema200[199]! + (closes[200]! - ema200[199]!) * (2 / 201);
  assert.ok(ema200[200] != null && Math.abs(ema200[200] - expectedNext) < 1e-12);
});

test("chart spreads sum OHLC bars only at shared timestamps", () => {
  const a = [
    { timestamp: 1, open: 10, high: 12, low: 9, close: 11, volume: 20 },
    { timestamp: 2, open: 11, high: 13, low: 10, close: 12, volume: 21 },
  ];
  const b = [
    { timestamp: 1, open: 20, high: 22, low: 19, close: 21, volume: 30 },
    { timestamp: 3, open: 21, high: 23, low: 20, close: 22, volume: 31 },
  ];
  assert.deepEqual(
    buildSumSpreadSeries([
      { symbol: "A.NS", candles: a },
      { symbol: "B.NS", candles: b },
    ]),
    [{ timestamp: 1, open: 30, high: 34, low: 28, close: 32, volume: 0 }],
  );
  assert.throws(
    () => buildSumSpreadSeries([{ symbol: "A", candles: a }, { symbol: "a", candles: b }]),
    /duplicate symbols/,
  );
});

test("percentage comparisons normalize to the first valid visible close", () => {
  const candles = [
    { timestamp: 1, open: 0, high: 0, low: 0, close: 0, volume: 0 },
    { timestamp: 2, open: 100, high: 100, low: 100, close: 100, volume: 0 },
    { timestamp: 3, open: 110, high: 110, low: 110, close: 110, volume: 0 },
  ];
  const normalized = normalizeVisibleCloses(candles, 1, 2);
  assert.deepEqual(normalized.map(({ timestamp }) => timestamp), [2, 3]);
  assert.ok(Math.abs(normalized[1]!.changePct - 10) < 1e-12);
  assert.deepEqual(
    normalizeClosesInTimeRange(candles, 2, 3).map(({ timestamp, changePct }) => [timestamp, changePct]),
    [[2, 0], [3, normalized[1]!.changePct]],
  );
  assert.equal(isStockAlertTriggered({
    id: "alert",
    symbol: "A.NS",
    condition: "above",
    value: 105,
    createdAt: new Date(0).toISOString(),
    triggered: false,
  }, { symbol: "A.NS", regularMarketPrice: 110 }), true);
});

test("account passwords are salted and verify only against the correct password", () => {
  const firstHash = hashPassword("secure-password-123");
  const secondHash = hashPassword("secure-password-123");
  assert.notEqual(firstHash, secondHash);
  assert.equal(verifyPassword("secure-password-123", firstHash), true);
  assert.equal(verifyPassword("wrong-password", firstHash), false);
  assert.equal(verifyPassword("secure-password-123", "invalid"), false);
  assert.equal(validatePassword("short"), false);
  assert.equal(validatePassword("long-enough-password"), true);
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
