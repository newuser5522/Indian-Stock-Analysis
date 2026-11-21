export interface ChartCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PercentPoint {
  timestamp: number;
  changePct: number;
}

export const MAX_SPREAD_SYMBOLS = 10;

export function buildSumSpreadSeries(
  series: { symbol: string; candles: ChartCandle[] }[],
): ChartCandle[] {
  const symbols = series.map(({ symbol }) => symbol.trim().toUpperCase());
  if (symbols.length < 2 || symbols.length > MAX_SPREAD_SYMBOLS) {
    throw new Error(`A spread requires 2 to ${MAX_SPREAD_SYMBOLS} symbols.`);
  }
  if (new Set(symbols).size !== symbols.length) {
    throw new Error("A spread cannot contain duplicate symbols.");
  }
  if (series.some(({ candles }) => candles.length === 0)) {
    throw new Error("Every spread symbol must have historical data.");
  }

  const indexed = series.map(({ candles }) =>
    new Map(candles.map((candle) => [candle.timestamp, candle])),
  );
  const commonTimestamps = [...indexed[0]!.keys()]
    .filter((timestamp) => indexed.every((bars) => bars.has(timestamp)))
    .sort((a, b) => a - b);

  return commonTimestamps.map((timestamp) => {
    const bars = indexed.map((items) => items.get(timestamp)!);
    return {
      timestamp,
      open: bars.reduce((sum, candle) => sum + candle.open, 0),
      high: bars.reduce((sum, candle) => sum + candle.high, 0),
      low: bars.reduce((sum, candle) => sum + candle.low, 0),
      close: bars.reduce((sum, candle) => sum + candle.close, 0),
      volume: 0,
    };
  });
}

export function normalizeVisibleCloses(
  candles: ChartCandle[],
  startIndex: number,
  endIndex: number,
): PercentPoint[] {
  return normalizeCloses(candles.slice(
    Math.max(0, startIndex),
    Math.min(candles.length, endIndex + 1),
  ));
}

export function normalizeClosesInTimeRange(
  candles: ChartCandle[],
  startTimestamp: number,
  endTimestamp: number,
): PercentPoint[] {
  return normalizeCloses(
    candles.filter((candle) =>
      candle.timestamp >= startTimestamp && candle.timestamp <= endTimestamp,
    ),
  );
}

function normalizeCloses(visible: ChartCandle[]): PercentPoint[] {
  const baseline = visible.find(
    (candle) => Number.isFinite(candle.close) && candle.close > 0,
  );
  if (!baseline) return [];

  return visible.flatMap((candle) =>
    Number.isFinite(candle.close) && candle.close > 0
      ? [{
          timestamp: candle.timestamp,
          changePct: ((candle.close / baseline.close) - 1) * 100,
        }]
      : [],
  );
}
