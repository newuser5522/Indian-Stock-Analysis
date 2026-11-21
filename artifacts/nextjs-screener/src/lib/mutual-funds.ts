import { cache } from "./cache";

const MFAPI_BASE_URL = "https://api.mfapi.in/mf";
const SEARCH_CACHE_TTL_MS = 60 * 60 * 1000;
const FUND_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export interface MutualFundSearchResult {
  schemeCode: number;
  schemeName: string;
}

export interface MutualFundNavPoint {
  date: string;
  timestamp: number;
  nav: number;
}

export interface MutualFundHistory {
  schemeCode: number;
  schemeName: string;
  fundHouse: string;
  schemeType: string;
  schemeCategory: string;
  history: MutualFundNavPoint[];
}

export interface MutualFundLatestNav {
  schemeCode: number;
  schemeName: string;
  fundHouse: string;
  schemeType: string;
  schemeCategory: string;
  latest: MutualFundNavPoint;
}

interface MfApiMeta {
  scheme_code?: number;
  scheme_name?: string;
  fund_house?: string;
  scheme_type?: string;
  scheme_category?: string;
}

interface MfApiNav {
  date?: string;
  nav?: string;
}

interface MfApiResponse {
  meta?: MfApiMeta;
  data?: MfApiNav[];
  status?: string;
}

function parseNavDate(value: string): MutualFundNavPoint["date"] | null {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCDate() !== Number(day) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCFullYear() !== Number(year)
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

async function fetchMfApi<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw new Error(`MFAPI request failed with HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function searchMutualFunds(
  query: string,
): Promise<MutualFundSearchResult[]> {
  const normalizedQuery = query.trim().replace(/\s+/g, " ");
  if (normalizedQuery.length < 2) return [];

  return cache.getOrSet(
    `mutual-funds:search:${normalizedQuery.toLowerCase()}`,
    async () => {
      const url = new URL(`${MFAPI_BASE_URL}/search`);
      url.searchParams.set("q", normalizedQuery);
      const response = await fetchMfApi<unknown>(url.toString());
      if (!Array.isArray(response)) {
        throw new Error("MFAPI returned an invalid fund-search response");
      }

      const seen = new Set<number>();
      return response
        .flatMap((item): MutualFundSearchResult[] => {
          if (typeof item !== "object" || item === null) return [];
          const record = item as Record<string, unknown>;
          const schemeCode = record.schemeCode;
          const schemeName = record.schemeName;
          if (
            typeof schemeCode !== "number" ||
            !Number.isSafeInteger(schemeCode) ||
            schemeCode <= 0 ||
            typeof schemeName !== "string" ||
            !schemeName.trim() ||
            seen.has(schemeCode)
          ) {
            return [];
          }
          seen.add(schemeCode);
          return [{ schemeCode, schemeName: schemeName.trim() }];
        })
        .slice(0, 20);
    },
    SEARCH_CACHE_TTL_MS,
  );
}

export async function fetchMutualFundHistory(
  schemeCode: number,
): Promise<MutualFundHistory> {
  if (!Number.isSafeInteger(schemeCode) || schemeCode <= 0) {
    throw new Error("A valid mutual-fund scheme code is required");
  }

  return cache.getOrSet(
    `mutual-funds:history:${schemeCode}`,
    async () => {
      const response = await fetchMfApi<MfApiResponse>(
        `${MFAPI_BASE_URL}/${schemeCode}`,
      );
      const meta = response.meta;
      if (
        !meta ||
        meta.scheme_code !== schemeCode ||
        typeof meta.scheme_name !== "string" ||
        !Array.isArray(response.data)
      ) {
        throw new Error("MFAPI returned invalid mutual-fund history");
      }

      const history = response.data.flatMap((point) => {
        if (typeof point.date !== "string" || point.nav == null) return [];
        const date = parseNavDate(point.date);
        const nav = Number(point.nav);
        if (!date || !Number.isFinite(nav) || nav <= 0) return [];
        return [
          {
            date,
            timestamp: Date.parse(`${date}T00:00:00.000Z`) / 1000,
            nav,
          },
        ];
      });
      history.sort((left, right) => left.timestamp - right.timestamp);
      if (history.length === 0) {
        throw new Error("MFAPI returned no valid NAV history for this fund");
      }

      return {
        schemeCode,
        schemeName: meta.scheme_name,
        fundHouse: meta.fund_house ?? "",
        schemeType: meta.scheme_type ?? "",
        schemeCategory: meta.scheme_category ?? "",
        history,
      };
    },
    FUND_CACHE_TTL_MS,
  );
}

export async function fetchMutualFundLatestNav(
  schemeCode: number,
): Promise<MutualFundLatestNav> {
  if (!Number.isSafeInteger(schemeCode) || schemeCode <= 0) {
    throw new Error("A valid mutual-fund scheme code is required");
  }

  return cache.getOrSet(
    `mutual-funds:latest:${schemeCode}`,
    async () => {
      const response = await fetchMfApi<MfApiResponse>(
        `${MFAPI_BASE_URL}/${schemeCode}/latest`,
      );
      const meta = response.meta;
      const point = response.data?.[0];
      if (
        !meta ||
        meta.scheme_code !== schemeCode ||
        typeof meta.scheme_name !== "string" ||
        !point ||
        typeof point.date !== "string" ||
        point.nav == null
      ) {
        throw new Error("MFAPI returned invalid latest mutual-fund NAV");
      }
      const date = parseNavDate(point.date);
      const nav = Number(point.nav);
      if (!date || !Number.isFinite(nav) || nav <= 0) {
        throw new Error("MFAPI returned an invalid latest mutual-fund NAV");
      }
      return {
        schemeCode,
        schemeName: meta.scheme_name,
        fundHouse: meta.fund_house ?? "",
        schemeType: meta.scheme_type ?? "",
        schemeCategory: meta.scheme_category ?? "",
        latest: {
          date,
          timestamp: Date.parse(`${date}T00:00:00.000Z`) / 1000,
          nav,
        },
      };
    },
    FUND_CACHE_TTL_MS,
  );
}
