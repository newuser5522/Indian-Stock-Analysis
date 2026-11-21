interface IndexMapping {
  Index_long_name?: unknown;
  Trading_Index_Name?: unknown;
}

interface IndexHistoryRow {
  HistoricalDate?: unknown;
  CLOSE?: unknown;
}

export interface NiftyIndexHistoryPoint {
  timestamp: number;
  close: number;
}

const INDEX_MAPPING_URL =
  "https://liveindexsa.niftyindices.com/assets/json/IndexMapping.json";
const INDEX_HISTORY_URL =
  "https://www.niftyindices.com/BackPage/getHistoricaldatatabletoString";
const INDEX_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Content-Type": "application/json; charset=utf-8",
  Origin: "https://www.niftyindices.com",
  Referer: "https://www.niftyindices.com/reports/historical-data",
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
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function fetchIndexMappings(): Promise<Map<string, string>> {
  const response = await fetch(INDEX_MAPPING_URL, {
    headers: { "User-Agent": INDEX_HEADERS["User-Agent"] },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Nifty Indices mapping request failed: ${response.status}`);
  }
  const raw: unknown = await response.json();
  if (!Array.isArray(raw)) {
    throw new Error("Nifty Indices returned an unexpected mapping format");
  }

  const mappings = new Map<string, string>();
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as IndexMapping;
    if (
      typeof row.Index_long_name === "string" &&
      typeof row.Trading_Index_Name === "string"
    ) {
      mappings.set(
        normalizeIndexName(row.Index_long_name),
        row.Trading_Index_Name,
      );
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

function formatNiftyDate(value: string): string {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (!match) throw new Error("Invalid index history date");
  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const monthName = MONTHS[month];
  if (!monthName) throw new Error("Invalid index history date");
  return `${day}-${monthName}-${match[3]}`;
}

function parseHistoryDate(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})$/.exec(value.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = MONTHS.findIndex(
    (monthName) => monthName.toLowerCase() === match[2].toLowerCase(),
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

function parseHistoryRows(response: unknown): NiftyIndexHistoryPoint[] {
  const rows =
    Array.isArray(response)
      ? response
      : typeof response === "object" && response !== null &&
          "d" in response && typeof response.d === "string"
        ? JSON.parse(response.d)
        : [];
  if (!Array.isArray(rows)) {
    throw new Error("Nifty Indices returned an unexpected history format");
  }

  const points = rows.flatMap((item): NiftyIndexHistoryPoint[] => {
    if (typeof item !== "object" || item === null) return [];
    const row = item as IndexHistoryRow;
    const timestamp = parseHistoryDate(row.HistoricalDate);
    const rawClose = row.CLOSE;
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
  tradingName: string,
  startDate: string,
  endDate: string,
): Promise<NiftyIndexHistoryPoint[]> {
  const requestInfo = {
    name: tradingName.toUpperCase(),
    startDate,
    endDate,
    indexName,
  };
  const response = await fetch(INDEX_HISTORY_URL, {
    method: "POST",
    headers: INDEX_HEADERS,
    body: JSON.stringify({ cinfo: JSON.stringify(requestInfo) }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(
      `Nifty Indices history request failed for ${indexName}: ${response.status}`,
    );
  }
  return parseHistoryRows(await response.json());
}

export async function fetchNiftyIndicesHistories(
  indexNames: string[],
  fromDate: string,
  toDate: string,
): Promise<Map<string, NiftyIndexHistoryPoint[]>> {
  const histories = new Map<string, NiftyIndexHistoryPoint[]>();
  if (indexNames.length === 0) return histories;

  const mappings = await getIndexMappings();
  const startDate = formatNiftyDate(fromDate);
  const endDate = formatNiftyDate(toDate);
  const supportedIndexes = indexNames.flatMap((indexName) => {
    const tradingName = mappings.get(normalizeIndexName(indexName));
    if (!tradingName) {
      histories.set(indexName, []);
      return [];
    }
    return [{ indexName, tradingName }];
  });

  let nextIndex = 0;
  const failedIndexes: string[] = [];
  let firstError: unknown;
  await Promise.all(
    Array.from({ length: Math.min(4, supportedIndexes.length) }, async () => {
      while (nextIndex < supportedIndexes.length) {
        const { indexName, tradingName } = supportedIndexes[nextIndex++];
        try {
          histories.set(
            indexName,
            await fetchIndexHistory(indexName, tradingName, startDate, endDate),
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
    console.warn("Some Nifty Indices history requests failed", {
      failedIndexes,
      cause: firstError,
    });
  }
  return histories;
}
