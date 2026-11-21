interface BseIndexMapping {
  Indx_cd?: unknown;
  shortalias?: unknown;
}

interface BseHistoryRow {
  newdate?: unknown;
  Day?: unknown;
  Month?: unknown;
  year?: unknown;
  I_close?: unknown;
}

export interface BseIndexHistoryPoint {
  timestamp: number;
  close: number;
}

const BSE_API_URL = "https://api.bseindia.com/BseIndiaAPI/api";
const BSE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Origin: "https://www.bseindia.com",
  Referer: "https://www.bseindia.com/indices/IndexArchiveData.html",
};
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

let indexMappingsRequest: Promise<Map<string, string>> | undefined;

function normalizeIndexName(value: string): string {
  return value
    .toUpperCase()
    .replace(/\bINDEX\b/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

async function fetchIndexMappings(): Promise<Map<string, string>> {
  const query = new URLSearchParams({ fmdt: "", todt: "" });
  const response = await fetch(
    `${BSE_API_URL}/FillddlIndex/w?${query}`,
    {
      headers: BSE_HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) {
    throw new Error(`BSE index mapping request failed: ${response.status}`);
  }
  const raw: unknown = await response.json();
  if (typeof raw !== "object" || raw === null || !("Table" in raw)) {
    throw new Error("BSE returned an unexpected index mapping format");
  }
  const rows = raw.Table;
  if (!Array.isArray(rows)) {
    throw new Error("BSE returned an unexpected index mapping format");
  }

  const mappings = new Map<string, string>();
  for (const item of rows) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as BseIndexMapping;
    if (typeof row.shortalias === "string" && typeof row.Indx_cd === "string") {
      mappings.set(normalizeIndexName(row.shortalias), row.Indx_cd);
    }
  }
  return mappings;
}

function getIndexMappings(): Promise<Map<string, string>> {
  if (!indexMappingsRequest) {
    indexMappingsRequest = fetchIndexMappings().catch((error: unknown) => {
      indexMappingsRequest = undefined;
      throw error;
    });
  }
  return indexMappingsRequest;
}

function formatBseDate(value: string): string {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (!match) throw new Error("Invalid index history date");
  return `${match[1]}/${match[2]}/${match[3]}`;
}

function parseHistoryDate(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2})[-\s]([A-Za-z]+)[-\s](\d{4})$/.exec(value.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = MONTHS.findIndex(
    (monthName) => monthName.toLowerCase() === match[2].slice(0, 3).toLowerCase(),
  );
  const year = Number(match[3]);
  if (month < 0) return null;
  const timestamp = Date.UTC(year, month, day) / 1000;
  const date = new Date(timestamp * 1000);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month &&
    date.getUTCDate() === day
    ? timestamp
    : null;
}

function parseHistoryRows(response: unknown): BseIndexHistoryPoint[] {
  if (typeof response !== "object" || response === null || !("Table" in response)) {
    throw new Error("BSE returned an unexpected index history format");
  }
  const rows = response.Table;
  if (!Array.isArray(rows)) {
    throw new Error("BSE returned an unexpected index history format");
  }

  const points = rows.flatMap((item): BseIndexHistoryPoint[] => {
    if (typeof item !== "object" || item === null) return [];
    const row = item as BseHistoryRow;
    const date =
      typeof row.newdate === "string"
        ? row.newdate
        : typeof row.Day === "number" &&
            typeof row.Month === "string" &&
            typeof row.year === "string"
          ? `${row.Day} ${row.Month} ${row.year}`
          : null;
    const timestamp = parseHistoryDate(date);
    const rawClose = row.I_close;
    const close =
      typeof rawClose === "number"
        ? rawClose
        : typeof rawClose === "string"
          ? Number(rawClose.replaceAll(",", ""))
          : Number.NaN;
    return timestamp !== null && Number.isFinite(close) && close > 0
      ? [{ timestamp, close }]
      : [];
  });
  points.sort((left, right) => left.timestamp - right.timestamp);
  return points;
}

async function fetchIndexHistory(
  indexName: string,
  indexCode: string,
  fromDate: string,
  toDate: string,
): Promise<BseIndexHistoryPoint[]> {
  const query = new URLSearchParams({
    fmdt: fromDate,
    index: indexCode,
    period: "D",
    todt: toDate,
  });
  const response = await fetch(`${BSE_API_URL}/IndexArchDailyPAR/w?${query}`, {
    headers: BSE_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(
      `BSE index history request failed for ${indexName}: ${response.status}`,
    );
  }
  return parseHistoryRows(await response.json());
}

export async function fetchBseIndexHistories(
  indexNames: string[],
  fromDate: string,
  toDate: string,
): Promise<Map<string, BseIndexHistoryPoint[]>> {
  const histories = new Map<string, BseIndexHistoryPoint[]>();
  if (indexNames.length === 0) return histories;

  const mappings = await getIndexMappings();
  const startDate = formatBseDate(fromDate);
  const endDate = formatBseDate(toDate);
  const supportedIndexes = indexNames.flatMap((indexName) => {
    const indexCode = mappings.get(normalizeIndexName(indexName));
    if (!indexCode) {
      histories.set(indexName, []);
      return [];
    }
    return [{ indexName, indexCode }];
  });

  let nextIndex = 0;
  const failedIndexes: string[] = [];
  let firstError: unknown;
  await Promise.all(
    Array.from({ length: Math.min(4, supportedIndexes.length) }, async () => {
      while (nextIndex < supportedIndexes.length) {
        const { indexName, indexCode } = supportedIndexes[nextIndex++];
        try {
          histories.set(
            indexName,
            await fetchIndexHistory(indexName, indexCode, startDate, endDate),
          );
        } catch (error) {
          failedIndexes.push(indexName);
          firstError ??= error;
          histories.set(indexName, []);
        }
      }
    }),
  );
  if (failedIndexes.length > 0) {
    console.warn("Some BSE index history requests failed", {
      failedIndexes,
      cause: firstError,
    });
  }
  return histories;
}
