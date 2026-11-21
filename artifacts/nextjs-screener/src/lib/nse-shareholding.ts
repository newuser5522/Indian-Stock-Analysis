export type ShareholdingRow = Record<string, unknown>;

export interface ShareholdingPeriod {
  date: string;
  timestamp: number;
  rows: ShareholdingRow[];
}

function normalizeLabel(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function parseShareholdingPercent(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number.parseFloat(String(value).replace(/,/g, "").replace(/%/g, "").trim());
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function categoryFromRow(row: ShareholdingRow): string | null {
  const categoryKeys = new Set([
    "category",
    "category name",
    "shareholder category",
    "label",
    "name",
    "particulars",
  ]);
  for (const [key, value] of Object.entries(row)) {
    if (categoryKeys.has(normalizeLabel(key)) && typeof value === "string") {
      return normalizeLabel(value);
    }
  }
  return null;
}

function percentageFromRow(row: ShareholdingRow): number | null {
  const percentKeys = new Set([
    "percentage shareholding",
    "shareholding percentage",
    "share holding percentage",
    "shareholding percent",
    "shareholding pct",
    "shareholding",
    "percentage",
    "percent",
    "of shareholding",
  ]);
  for (const [key, value] of Object.entries(row)) {
    if (!percentKeys.has(normalizeLabel(key))) continue;
    const percent = parseShareholdingPercent(value);
    if (percent != null) return percent;
  }
  return parseShareholdingPercent(row.value);
}

export function getShareholdingPercent(
  rows: ShareholdingRow[],
  labels: string[],
): number | null {
  const targets = labels.map(normalizeLabel);
  for (const row of rows) {
    const category = categoryFromRow(row);
    if (category != null && targets.includes(category)) {
      const percent = percentageFromRow(row);
      if (percent != null) return percent;
    }

    for (const [label, value] of Object.entries(row)) {
      if (!targets.includes(normalizeLabel(label))) continue;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const percent = percentageFromRow(value as ShareholdingRow);
        if (percent != null) return percent;
        continue;
      }
      const percent = parseShareholdingPercent(value);
      if (percent != null) return percent;
    }
  }
  return null;
}

function periodTimestamp(value: string): number {
  const dayFirst = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (dayFirst) {
    const date = new Date(Date.UTC(
      Number(dayFirst[3]),
      Number(dayFirst[2]) - 1,
      Number(dayFirst[1]),
    ));
    if (
      date.getUTCFullYear() === Number(dayFirst[3]) &&
      date.getUTCMonth() === Number(dayFirst[2]) - 1 &&
      date.getUTCDate() === Number(dayFirst[1])
    ) return date.getTime();
    return Number.NaN;
  }
  return Date.parse(value);
}

export function getShareholdingPeriods(
  value: Record<string, ShareholdingRow[]> | undefined,
): ShareholdingPeriod[] {
  return Object.entries(value ?? {})
    .map(([date, rows]) => ({
      date,
      timestamp: periodTimestamp(date),
      rows: Array.isArray(rows) ? rows : [],
    }))
    .filter((period) => Number.isFinite(period.timestamp) && period.rows.length > 0)
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function getQuarterlyShareholdingChange(
  periods: ShareholdingPeriod[],
  labels: string[],
): number | null {
  if (periods.length < 2) return null;
  const latest = periods[periods.length - 1];
  const previous = periods[periods.length - 2];
  const elapsedDays = (latest.timestamp - previous.timestamp) / 86_400_000;
  if (elapsedDays < 75 || elapsedDays > 110) return null;

  const latestValue = getShareholdingPercent(latest.rows, labels);
  const previousValue = getShareholdingPercent(previous.rows, labels);
  return latestValue != null && previousValue != null
    ? latestValue - previousValue
    : null;
}

