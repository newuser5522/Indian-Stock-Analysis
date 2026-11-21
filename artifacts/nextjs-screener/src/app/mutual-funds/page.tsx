"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Check,
  GitCompareArrows,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiUrl } from "@/lib/api-url";

interface MutualFundSearchResult {
  schemeCode: number;
  schemeName: string;
}

interface MutualFundNavPoint {
  date: string;
  timestamp: number;
  nav: number;
}

interface MutualFundHistory {
  schemeCode: number;
  schemeName: string;
  fundHouse: string;
  schemeType: string;
  schemeCategory: string;
  latest: MutualFundNavPoint;
  history: MutualFundNavPoint[];
}

type ComparePeriod = "1y" | "3y" | "5y";

const PERIOD_LABELS: Record<ComparePeriod, string> = {
  "1y": "1Y",
  "3y": "3Y",
  "5y": "5Y",
};

const LINE_COLORS = [
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#ef4444",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNavPoint(value: unknown): value is MutualFundNavPoint {
  return (
    isRecord(value) &&
    typeof value.date === "string" &&
    typeof value.timestamp === "number" &&
    Number.isFinite(value.timestamp) &&
    typeof value.nav === "number" &&
    Number.isFinite(value.nav) &&
    value.nav > 0
  );
}

function isMutualFundHistory(value: unknown): value is MutualFundHistory {
  return (
    isRecord(value) &&
    typeof value.schemeCode === "number" &&
    typeof value.schemeName === "string" &&
    typeof value.fundHouse === "string" &&
    typeof value.schemeType === "string" &&
    typeof value.schemeCategory === "string" &&
    isNavPoint(value.latest) &&
    Array.isArray(value.history) &&
    value.history.every(isNavPoint)
  );
}

function formatNav(value: number): string {
  return `₹${value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}`;
}

function periodReturn(
  history: MutualFundNavPoint[],
  period: ComparePeriod,
): number | null {
  const latest = history.at(-1);
  if (!latest) return null;
  const years = Number.parseInt(period, 10);
  const targetTimestamp = latest.timestamp - years * 365.25 * 24 * 60 * 60;
  const base = history.find((point) => point.timestamp >= targetTimestamp);
  if (
    !base ||
    base.timestamp - targetTimestamp > 14 * 24 * 60 * 60 ||
    latest.timestamp - base.timestamp < years * 365 * 24 * 60 * 60 - 14 * 24 * 60 * 60
  ) {
    return null;
  }
  return (Math.pow(latest.nav / base.nav, 1 / years) - 1) * 100;
}

export default function MutualFundsPage() {
  const [query, setQuery] = useState("");
  const [searchText, setSearchText] = useState("");
  const [searchError, setSearchError] = useState("");
  const [period, setPeriod] = useState<ComparePeriod>("1y");
  const [selectedFunds, setSelectedFunds] = useState<MutualFundSearchResult[]>([]);

  const {
    data: searchResults = [],
    isFetching,
    error: searchQueryError,
  } = useQuery<
    MutualFundSearchResult[]
  >({
    queryKey: ["mutual-funds-search", query],
    enabled: query.length >= 2,
    queryFn: async () => {
      const response = await fetch(
        apiUrl(`/mutual-funds/search?q=${encodeURIComponent(query)}`),
      );
      const body: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : "Mutual-fund search is unavailable";
        throw new Error(message);
      }
      if (!Array.isArray(body)) {
        throw new Error("Mutual-fund search returned invalid data");
      }
      return body.flatMap((item): MutualFundSearchResult[] => {
        if (
          !isRecord(item) ||
          typeof item.schemeCode !== "number" ||
          !Number.isSafeInteger(item.schemeCode) ||
          typeof item.schemeName !== "string"
        ) {
          return [];
        }
        return [{ schemeCode: item.schemeCode, schemeName: item.schemeName }];
      });
    },
    retry: false,
  });

  const {
    data: comparisonFunds = [],
    isLoading: isComparisonLoading,
    isError: comparisonError,
  } = useQuery<MutualFundHistory[]>({
    queryKey: [
      "mutual-fund-comparison",
      period,
      selectedFunds.map((fund) => fund.schemeCode).join(","),
    ],
    enabled: selectedFunds.length > 0,
    queryFn: async () => {
      return Promise.all(
        selectedFunds.map(async (fund) => {
          const response = await fetch(
            apiUrl(`/mutual-funds/${fund.schemeCode}?period=${period}`),
          );
          const body: unknown = await response.json();
          if (!response.ok) {
            const message =
              typeof body === "object" &&
              body !== null &&
              "error" in body &&
              typeof body.error === "string"
                ? body.error
                : `Could not load NAV history for ${fund.schemeName}`;
            throw new Error(message);
          }
          if (!isMutualFundHistory(body)) {
            throw new Error(`NAV history for ${fund.schemeName} is invalid`);
          }
          return body;
        }),
      );
    },
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const chartData = useMemo(() => {
    const dates = [
      ...new Set(
        comparisonFunds.flatMap((fund) => fund.history.map((point) => point.date)),
      ),
    ].sort();
    const byFundAndDate = new Map(
      comparisonFunds.map((fund) => [
        fund.schemeCode,
        new Map(fund.history.map((point) => [point.date, point.nav])),
      ]),
    );
    const firstNav = new Map(
      comparisonFunds.map((fund) => [
        fund.schemeCode,
        fund.history[0]?.nav ?? null,
      ]),
    );

    return dates.map((date) => {
      const row: Record<string, string | number | null> = { date };
      for (const fund of comparisonFunds) {
        const nav = byFundAndDate.get(fund.schemeCode)?.get(date);
        const base = firstNav.get(fund.schemeCode);
        row[String(fund.schemeCode)] =
          nav != null && base != null ? ((nav - base) / base) * 100 : null;
      }
      return row;
    });
  }, [comparisonFunds]);

  async function searchFunds(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = searchText.trim().replace(/\s+/g, " ");
    if (normalized.length < 2) {
      setSearchError("Enter at least two characters to search.");
      setQuery("");
      return;
    }
    setSearchError("");
    setQuery(normalized);
  }

  function toggleFund(fund: MutualFundSearchResult) {
    setSelectedFunds((current) => {
      if (current.some((item) => item.schemeCode === fund.schemeCode)) {
        return current.filter((item) => item.schemeCode !== fund.schemeCode);
      }
      if (current.length >= LINE_COLORS.length) return current;
      return [...current, fund];
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <BarChart3 className="h-6 w-6 text-primary" />
            Mutual Funds
          </h1>
          <p className="text-sm text-muted-foreground">
            Search Indian schemes and compare their published NAV performance.
            NAVs are end-of-day values, not live market quotes.
          </p>
        </div>
        <Link
          href="/portfolio"
          className="rounded-md border px-3 py-2 text-xs font-medium hover:bg-accent"
        >
          Add a fund to portfolio
        </Link>
      </header>

      <section className="rounded-lg border bg-card p-4">
        <form onSubmit={searchFunds} className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="mutual-fund-search">
            Search mutual funds
          </label>
          <input
            id="mutual-fund-search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search by fund name, AMC, or category…"
            className="h-10 min-w-56 flex-1 rounded-md border bg-background px-3 text-sm"
          />
          <button
            type="submit"
            disabled={isFetching}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            <Search className="h-4 w-4" />
            {isFetching ? "Searching…" : "Search funds"}
          </button>
        </form>
        {searchError && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {searchError}
          </p>
        )}
        {searchQueryError instanceof Error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {searchQueryError.message}
          </p>
        )}
        {query.length >= 2 && (
          <div className="mt-3 divide-y rounded-md border">
            {searchResults.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                {isFetching ? "Searching schemes…" : "No matching schemes found."}
              </p>
            ) : (
              searchResults.map((fund) => {
                const isSelected = selectedFunds.some(
                  (item) => item.schemeCode === fund.schemeCode,
                );
                const atLimit =
                  selectedFunds.length >= LINE_COLORS.length && !isSelected;
                return (
                  <div
                    key={fund.schemeCode}
                    className="flex items-center gap-3 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {fund.schemeName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Scheme {fund.schemeCode}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleFund(fund)}
                      disabled={atLimit}
                      aria-pressed={isSelected}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
                    >
                      {isSelected ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Comparing
                        </>
                      ) : (
                        <>
                          <GitCompareArrows className="h-3.5 w-3.5" />
                          Compare
                        </>
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="font-semibold">Performance comparison</h2>
            <p className="text-xs text-muted-foreground">
              Up to {LINE_COLORS.length} schemes, normalized to the first
              available NAV in the selected period.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1 rounded-md border p-1">
            {(["1y", "3y", "5y"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={period === value}
                onClick={() => setPeriod(value)}
                className={`rounded px-3 py-1 text-xs ${
                  period === value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {PERIOD_LABELS[value]}
              </button>
            ))}
          </div>
        </div>

        {selectedFunds.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedFunds.map((fund, index) => (
              <span
                key={fund.schemeCode}
                className="inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1 text-xs"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: LINE_COLORS[index] }}
                />
                <span className="max-w-64 truncate">{fund.schemeName}</span>
                <button
                  type="button"
                  aria-label={`Remove ${fund.schemeName} from comparison`}
                  onClick={() => toggleFund(fund)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {isComparisonLoading ? (
          <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
            Loading NAV history…
          </div>
        ) : comparisonError ? (
          <div role="alert" className="flex h-72 items-center justify-center text-sm text-destructive">
            NAV comparison could not be loaded. Try again shortly.
          </div>
        ) : comparisonFunds.length === 0 ? (
          <div className="flex h-72 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            Search for schemes and select Compare to start.
          </div>
        ) : (
          <>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    minTickGap={36}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                    tickFormatter={(value: string) =>
                      new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
                        month: "short",
                        year: "2-digit",
                      })
                    }
                  />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                    tickFormatter={(value: number) => `${value.toFixed(0)}%`}
                    width={48}
                  />
                  <Tooltip
                    labelFormatter={(value) =>
                      new Date(`${String(value)}T00:00:00`).toLocaleDateString(
                        "en-IN",
                        { day: "2-digit", month: "short", year: "numeric" },
                      )
                    }
                    formatter={(value, name) => [
                      value == null ? "—" : `${Number(value).toFixed(2)}%`,
                      comparisonFunds.find(
                        (fund) => String(fund.schemeCode) === String(name),
                      )?.schemeName ?? String(name),
                    ]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      color: "hsl(var(--popover-foreground))",
                      fontSize: 11,
                    }}
                  />
                  {comparisonFunds.map((fund, index) => (
                    <Line
                      key={fund.schemeCode}
                      type="monotone"
                      dataKey={String(fund.schemeCode)}
                      name={String(fund.schemeCode)}
                      stroke={LINE_COLORS[index]}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {comparisonFunds.map((fund, index) => {
                const annualized = periodReturn(fund.history, period);
                return (
                  <article
                    key={fund.schemeCode}
                    className="min-w-0 rounded-md border p-3"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: LINE_COLORS[index] }}
                      />
                      <div className="min-w-0 flex-1">
                        <h3 className="line-clamp-2 text-sm font-medium">
                          {fund.schemeName}
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {fund.schemeCategory || fund.fundHouse || "Mutual fund"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-end justify-between gap-2">
                      <div>
                        <p className="text-[10px] text-muted-foreground">
                          Latest NAV · {fund.latest.date}
                        </p>
                        <p className="font-semibold tabular-nums">
                          {formatNav(fund.latest.nav)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground">
                          {PERIOD_LABELS[period]} CAGR
                        </p>
                        <p
                          className={`font-semibold tabular-nums ${
                            annualized == null
                              ? "text-muted-foreground"
                              : annualized >= 0
                                ? "text-emerald-500"
                                : "text-red-500"
                          }`}
                        >
                          {annualized == null
                            ? "Not enough history"
                            : `${annualized >= 0 ? "+" : ""}${annualized.toFixed(2)}%`}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}

        <p className="text-[11px] text-muted-foreground">
          Source: MFAPI.in, using AMFI-published NAV data. Historical performance
          is not a forecast and does not include taxes or scheme expenses beyond
          those reflected in NAV.
        </p>
      </section>
    </div>
  );
}
