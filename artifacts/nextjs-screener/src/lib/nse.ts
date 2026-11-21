import { execFile } from "node:child_process";
import { promisify } from "node:util";

/** Shared NSE transport with an HTTP/1.1 curl fallback for blocked Node requests. */

const execFileAsync = promisify(execFile);
const CURL_STATUS_MARKER = "\n__NSE_HTTP_STATUS__=";

class NseApiHttpError extends Error {
  constructor(
    readonly status: number,
    path: string,
  ) {
    super(`NSE API ${path}: ${status}`);
    this.name = "NseApiHttpError";
  }
}

function findNseApiHttpStatus(error: unknown): number | null {
  if (error instanceof NseApiHttpError) return error.status;
  if (error instanceof AggregateError) {
    for (const nestedError of error.errors) {
      const status = findNseApiHttpStatus(nestedError);
      if (status !== null) return status;
    }
  }
  return null;
}

export const NSE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
  Referer: "https://www.nseindia.com/",
};

function nseFetch(input: string | URL | Request, init: RequestInit = {}) {
  const timeout = AbortSignal.timeout(10_000);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
}

/** Establish NSE session cookie string */
async function getNseSession(): Promise<string> {
  const sessionRes = await nseFetch("https://www.nseindia.com", {
    headers: NSE_HEADERS,
    next: { revalidate: 0 },
  });
  return sessionRes.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

async function fetchNseApiWithCurl<T>(path: string): Promise<T> {
  const url = new URL(path, "https://www.nseindia.com/api/");
  if (url.origin !== "https://www.nseindia.com") {
    throw new Error("NSE API path must stay on www.nseindia.com");
  }
  const executable = process.platform === "win32" ? "curl.exe" : "curl";
  const { stdout } = await execFileAsync(
    executable,
    [
      "--http1.1",
      "--silent",
      "--show-error",
      "--location",
      "--connect-timeout",
      "5",
      "--max-time",
      "10",
      "--user-agent",
      NSE_HEADERS["User-Agent"],
      "--header",
      `Accept: ${NSE_HEADERS.Accept}`,
      "--header",
      `Referer: ${NSE_HEADERS.Referer}`,
      "--output",
      "-",
      "--write-out",
      `${CURL_STATUS_MARKER}%{http_code}`,
      url.toString(),
    ],
    {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: 12_000,
      windowsHide: true,
    },
  );
  const statusMarker = stdout.lastIndexOf(CURL_STATUS_MARKER);
  if (statusMarker < 0) {
    throw new Error(`NSE curl response did not include an HTTP status for ${path}`);
  }
  const status = Number(stdout.slice(statusMarker + CURL_STATUS_MARKER.length));
  if (!Number.isInteger(status) || status < 200 || status >= 300) {
    if (Number.isInteger(status)) throw new NseApiHttpError(status, path);
    throw new Error(`NSE curl returned an invalid HTTP status for ${path}`);
  }
  return JSON.parse(stdout.slice(0, statusMarker)) as T;
}

async function fetchNseApiWithSession<T>(
  path: string,
  cookieStr: string,
  delayMs: number,
): Promise<T> {
  await new Promise((r) => setTimeout(r, delayMs));
  if (!cookieStr) return fetchNseApiWithCurl<T>(path);

  try {
    const res = await nseFetch(`https://www.nseindia.com/api/${path}`, {
      headers: { ...NSE_HEADERS, Cookie: cookieStr },
      next: { revalidate: 0 },
    });
    if (!res.ok) throw new NseApiHttpError(res.status, path);
    return (await res.json()) as T;
  } catch (fetchError) {
    try {
      return await fetchNseApiWithCurl<T>(path);
    } catch (curlError) {
      throw new AggregateError(
        [fetchError, curlError],
        `NSE API ${path} failed with both fetch and curl transports`,
      );
    }
  }
}

/** Fetch a JSON endpoint from NSE India with session cookies when available. */
export async function fetchNseApi<T = unknown>(
  path: string,
  delayMs = 350,
): Promise<T> {
  let cookieStr = "";
  try {
    cookieStr = await getNseSession();
  } catch (error) {
    console.warn("NSE session setup failed; using direct API transport", error);
  }
  return fetchNseApiWithSession<T>(path, cookieStr, delayMs);
}

export interface NseIndexHistoryPoint {
  timestamp: number;
  close: number;
}

interface NseIndexHistoryRow {
  EOD_TIMESTAMP?: unknown;
  TIMESTAMP?: unknown;
  EOD_CLOSE_INDEX_VAL?: unknown;
  CLOSE_INDEX_VAL?: unknown;
}

function parseIndexHistoryDate(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const date = value.trim();
  const match =
    /^(\d{2})[-\s]([A-Za-z]{3}|\d{2})[-\s](\d{4})$/.exec(date);
  if (!match) return null;

  const day = Number(match[1]);
  const month = /^\d{2}$/.test(match[2])
    ? Number(match[2]) - 1
    : new Date(`${match[2]} 1, 2000`).getMonth();
  const year = Number(match[3]);
  const timestamp = Date.UTC(year, month, day) / 1000;
  const parsed = new Date(timestamp * 1000);
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month &&
    parsed.getUTCDate() === day
    ? timestamp
    : null;
}

function parseNseIndexHistory(response: unknown): NseIndexHistoryPoint[] {
  if (typeof response !== "object" || response === null) return [];
  const data = (response as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];

  const points = data.flatMap((item): NseIndexHistoryPoint[] => {
    if (typeof item !== "object" || item === null) return [];
    const row = item as NseIndexHistoryRow;
    const timestamp = parseIndexHistoryDate(row.EOD_TIMESTAMP ?? row.TIMESTAMP);
    const rawClose = row.EOD_CLOSE_INDEX_VAL ?? row.CLOSE_INDEX_VAL;
    const close =
      typeof rawClose === "number"
        ? rawClose
        : typeof rawClose === "string"
          ? Number(rawClose.replaceAll(",", ""))
          : Number.NaN;
    return timestamp != null && Number.isFinite(close) && close > 0
      ? [{ timestamp, close }]
      : [];
  });
  points.sort((left, right) => left.timestamp - right.timestamp);
  return points;
}

export async function fetchNseIndexHistories(
  indexNames: string[],
  fromDate: string,
  toDate: string,
): Promise<Map<string, NseIndexHistoryPoint[]>> {
  const histories = new Map<string, NseIndexHistoryPoint[]>();
  if (indexNames.length === 0) return histories;

  let cookieStr = "";
  try {
    cookieStr = await getNseSession();
  } catch (error) {
    console.warn("NSE session setup failed; using direct API transport", error);
  }
  let nextIndex = 0;
  const failedNames: string[] = [];
  let firstError: unknown;
  let stopAfterServerError = false;
  await Promise.all(
    Array.from({ length: Math.min(5, indexNames.length) }, async () => {
      while (nextIndex < indexNames.length && !stopAfterServerError) {
        const indexName = indexNames[nextIndex++];
        const query = new URLSearchParams({
          indexType: indexName.toUpperCase(),
          from: fromDate,
          to: toDate,
        });
        try {
          const response = await fetchNseApiWithSession<unknown>(
            `historical/indicesHistory?${query}`,
            cookieStr,
            350,
          );
          histories.set(indexName, parseNseIndexHistory(response));
        } catch (error) {
          failedNames.push(indexName);
          firstError ??= error;
          const status = findNseApiHttpStatus(error);
          if (status !== null && status >= 500) stopAfterServerError = true;
          histories.set(indexName, []);
        }
      }
    }),
  );
  while (nextIndex < indexNames.length) {
    failedNames.push(indexNames[nextIndex]);
    histories.set(indexNames[nextIndex], []);
    nextIndex++;
  }
  if (failedNames.length > 0) {
    console.warn("Some NSE index history requests failed", {
      failedNames,
      cause: firstError,
    });
  }
  return histories;
}

export interface NseBulkDeal {
  date?: string;
  symbol?: string;
  secName?: string;
  clientName?: string;
  buySell?: string;
  buyOrSellFlag?: string;
  quantityTraded?: number | string;
  wgtAvgPrice?: number | string;
  tradePrice?: number | string;
  remarks?: string;
}

type NseBulkDealResponse =
  | {
      data?: NseBulkDeal[];
      deals?: NseBulkDeal[];
      bulkDeals?: NseBulkDeal[];
    }
  | NseBulkDeal[];

export async function fetchNseBulkDeals(
  fromDate: string,
  toDate: string,
): Promise<NseBulkDeal[]> {
  const start = parseNseDate(fromDate);
  const end = parseNseDate(toDate);
  if (start > end) throw new Error("Bulk deal start date is after end date");

  const failures: string[] = [];
  let cookieStr = "";
  try {
    cookieStr = await getNseSession();
  } catch (error) {
    console.warn("NSE session setup failed; using direct API transport", error);
  }
  for (const from of dateVariants(fromDate)) {
    for (const to of dateVariants(toDate)) {
      const historyQuery = new URLSearchParams({ from, to });
      try {
        const response = await fetchNseApiWithSession<NseBulkDealResponse>(
          `historical/bulk-deals?${historyQuery}`,
          cookieStr,
          350,
        );
        const deals = getNseBulkDealRows(response);
        if (deals?.length) return deals;
        if (!deals) failures.push("historical/bulk-deals: unexpected response format");
      } catch (error) {
        failures.push(`historical/bulk-deals: ${errorMessage(error)}`);
      }
    }
  }

  try {
    const response = await fetchNseApiWithSession<NseBulkDealResponse>(
      "bulk-deals",
      cookieStr,
      350,
    );
    const deals = getNseBulkDealRows(response);
    if (deals) {
      const inRange = filterDealsByDate(deals, start, end);
      if (inRange.length) return inRange;
      failures.push("bulk-deals: no dated records in the requested range");
    }
    failures.push("bulk-deals: unexpected response format");
  } catch (error) {
    failures.push(`bulk-deals: ${errorMessage(error)}`);
  }

  const archiveQuery = new URLSearchParams({
    number: "500",
    series: "EQ",
    from: fromDate,
    to: toDate,
    symbol: "",
    csv: "false",
  });
  try {
    const response = await fetchNseApiWithSession<NseBulkDealResponse>(
      `bulk-deal-archives?${archiveQuery}`,
      cookieStr,
      350,
    );
    const deals = getNseBulkDealRows(response);
    if (!deals) {
      failures.push("bulk-deal-archives: unexpected response format");
    } else {
      return filterDealsByDate(deals, start, end);
    }
  } catch (error) {
    failures.push(`bulk-deal-archives: ${errorMessage(error)}`);
  }
  throw new Error(`NSE bulk deal endpoints failed: ${failures.join("; ")}`);
}

function filterDealsByDate(
  deals: NseBulkDeal[],
  start: number,
  end: number,
): NseBulkDeal[] {
  return deals.filter((deal) => {
    if (!deal.date) return false;
    try {
      const date = parseNseDate(deal.date);
      return date >= start && date <= end;
    } catch {
      return false;
    }
  });
}

function parseNseDate(value: string): number {
  const numericDate = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (numericDate) {
    return Date.UTC(
      Number(numericDate[3]),
      Number(numericDate[2]) - 1,
      Number(numericDate[1]),
    );
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error("Invalid NSE deal date");
  }
  return timestamp;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function dateVariants(value: string): string[] {
  const dayFirst = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (dayFirst) {
    return [value, `${dayFirst[3]}-${dayFirst[2]}-${dayFirst[1]}`];
  }
  const yearFirst = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (yearFirst) {
    return [value, `${yearFirst[3]}-${yearFirst[2]}-${yearFirst[1]}`];
  }
  return [value];
}

function getNseBulkDealRows(
  response: NseBulkDealResponse,
): NseBulkDeal[] | null {
  if (Array.isArray(response)) return response;
  const rows = response.data ?? response.deals ?? response.bulkDeals;
  return Array.isArray(rows) ? rows : null;
}

/** Today and N days ago as "DD-MM-YYYY" strings */
export function nseDate(daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}
