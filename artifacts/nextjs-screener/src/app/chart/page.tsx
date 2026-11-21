"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignJustify,
  Activity,
  Bell,
  BriefcaseBusiness,
  Download,
  Eye,
  EyeOff,
  GitCompareArrows,
  GitBranch,
  Grid3X3,
  Hash,
  Lock,
  Magnet,
  Maximize2,
  MessageSquare,
  Moon,
  MousePointer2,
  PanelRightClose,
  Plus,
  Ruler,
  Search,
  Settings2,
  Sparkles,
  Square,
  Star,
  Sun,
  Trash2,
  TrendingUp,
  Unlock,
  X,
  Waves,
  Bookmark,
} from "lucide-react";
import { apiUrl } from "@/lib/api-url";
import {
  buildSumSpreadSeries,
  MAX_SPREAD_SYMBOLS,
  normalizeClosesInTimeRange,
} from "@/lib/chart-comparison";
import {
  isStockAlertTriggered,
  loadStockAlerts,
  saveStockAlerts,
  type StockAlert,
  type StockAlertQuote,
} from "@/lib/stock-alerts";
import {
  calculateIndicator,
  calculateIndicatorComponents,
  findChartPatterns,
  findSupportResistance,
  findWeeklyBases,
  INDICATORS,
  scanCandlestickPatterns,
  simpleMovingAverage,
  type CandlePattern,
  type IndicatorId,
  type PriceLevel,
  type WeeklyBase,
} from "@/lib/chart-analysis";

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type Period = "1D" | "5D" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "5Y" | "All";
type ChartInterval = "1m" | "2m" | "5m" | "15m" | "30m" | "60m" | "90m" | "1h" | "1d" | "5d" | "1wk" | "1mo" | "3mo";
type ChartStyle = "Candles" | "Line" | "Area" | "Bars" | "Baseline";
type DrawPoint = { index: number; price: number };
type Drawing = { id: string; tool: string; points: DrawPoint[]; text?: string };
type MagicTab = "Signals" | "Patterns" | "Candles" | "Levels" | "Base";
type AxisType = "Linear" | "Logarithmic";
type ChartPanel = "watchlist" | "portfolio" | "alerts" | "compare" | null;

interface ChartWatchlistItem {
  symbol: string;
  currentPrice?: number;
  regularMarketChangePercent?: number;
  shortName?: string;
}

interface ChartPortfolioGroup {
  id: number;
  name: string;
}

interface ChartHolding {
  symbol: string;
  quantity: number;
  currentPrice: number | null;
  currentValue: number | null;
  pnlPct: number | null;
  cagr: number | null;
}

const DRAWING_GROUPS = [
  { name: "Lines", icon: TrendingUp, tools: ["Trend Line", "Ray", "Extended Line", "H. Straight Line", "V. Straight Line", "H. Ray Line", "V. Ray Line", "H. Segment", "V. Segment", "Arrow"] },
  { name: "Channels", icon: AlignJustify, tools: ["Price Channel", "Parallel Lines", "Price Line", "Brush"] },
  { name: "Fibonacci", icon: GitBranch, tools: ["Fib Retracement", "Fib Segment", "Fib Extension", "Fib Circles", "Fib Spiral", "Speed Resistance Fan"] },
  { name: "Shapes", icon: Square, tools: ["Circle", "Rectangle", "Triangle", "Parallelogram"] },
  { name: "Waves", icon: Waves, tools: ["3-Wave", "5-Wave", "8-Wave", "Any Wave"] },
  { name: "Harmonic", icon: Hash, tools: ["ABCD", "XABCD"] },
  { name: "Gann", icon: Grid3X3, tools: ["Gann Box"] },
  { name: "Annotations", icon: MessageSquare, tools: ["Annotation", "Price Tag", "Measure"] },
] as const;

const FAVORITE_DRAWING_TOOLS = [
  { tool: "Trend Line", icon: TrendingUp },
  { tool: "H. Ray Line", icon: Activity },
  { tool: "Fib Retracement", icon: GitBranch },
  { tool: "Rectangle", icon: Square },
  { tool: "Measure", icon: Ruler },
  { tool: "XABCD", icon: Hash },
] as const;

const mean = (values: number[]) =>
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;

const PERIOD_QUERY: Record<Period, { range: string; interval: ChartInterval }> = {
  "1D": { range: "1d", interval: "5m" },
  "5D": { range: "5d", interval: "15m" },
  "1M": { range: "1mo", interval: "1h" },
  "3M": { range: "3mo", interval: "1d" },
  "6M": { range: "6mo", interval: "1d" },
  YTD: { range: "ytd", interval: "1d" },
  "1Y": { range: "1y", interval: "1d" },
  "5Y": { range: "5y", interval: "1wk" },
  All: { range: "max", interval: "1mo" },
};

const INTERVAL_OPTIONS: Record<Period, ChartInterval[]> = {
  "1D": ["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d"],
  "5D": ["2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d"],
  "1M": ["5m", "15m", "30m", "60m", "90m", "1h", "1d"],
  "3M": ["1h", "1d", "1wk"],
  "6M": ["1h", "1d", "1wk"],
  YTD: ["1d", "1wk"],
  "1Y": ["1d", "1wk"],
  "5Y": ["1wk", "1mo"],
  All: ["1mo", "3mo"],
};

const WIDTH = 1100;
const HEIGHT = 600;
const LEFT = 24;
const RIGHT = 84;
const TOP = 24;
const PRICE_BOTTOM = 440;
const VOLUME_TOP = 456;
const VOLUME_BOTTOM = 570;

function getSma(data: Candle[], period: number): (number | null)[] {
  return data.map((_, index) => {
    if (index + 1 < period) return null;
    const window = data.slice(index + 1 - period, index + 1);
    return window.reduce((sum, item) => sum + item.close, 0) / period;
  });
}

function getVolumeSma(data: Candle[], period: number): (number | null)[] {
  return data.map((_, index) => {
    if (index + 1 < period) return null;
    const window = data.slice(index + 1 - period, index + 1);
    return window.reduce((sum, item) => sum + item.volume, 0) / period;
  });
}

function formatPrice(value: number): string {
  return `₹${value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function providerSymbol(value: string, exchange: "NSE" | "BSE"): string {
  const ticker = value.trim().toUpperCase().replace(/\s+/g, "");
  if (!ticker) return "";
  if (/\.(NS|BO)$/i.test(ticker)) return ticker;
  return `${ticker}.${exchange === "NSE" ? "NS" : "BO"}`;
}

function symbolLabel(value: string): string {
  return value.replace(/\.(NS|BO)$/i, "");
}

function formatVolume(value: number): string {
  if (value >= 10_000_000) return `${(value / 10_000_000).toFixed(1)}Cr`;
  if (value >= 100_000) return `${(value / 100_000).toFixed(1)}L`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toString();
}

function formatDate(timestamp: number, interval: string): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-IN", {
    day: interval === "1mo" ? undefined : "2-digit",
    month: "short",
    year: interval === "1mo" || interval === "1wk" ? "2-digit" : undefined,
  });
}

export default function ChartPage() {
  const [symbolInput, setSymbolInput] = useState("RELIANCE");
  const [exchange, setExchange] = useState<"NSE" | "BSE">("NSE");
  const [period, setPeriod] = useState<Period>("1Y");
  const [selectedInterval, setSelectedInterval] = useState<ChartInterval | null>(null);
  const [chartStyle, setChartStyle] = useState<ChartStyle>("Candles");
  const [candleStyle, setCandleStyle] = useState<"Solid" | "Hollow">("Solid");
  const [indicators, setIndicators] = useState<IndicatorId[]>(["ma", "vol"]);
  const [showIndicators, setShowIndicators] = useState(false);
  const [indicatorSearch, setIndicatorSearch] = useState("");
  const [indicatorGroup, setIndicatorGroup] = useState<"All" | "Main" | "Sub">("All");
  const [showSettings, setShowSettings] = useState(false);
  const [chartTheme, setChartTheme] = useState<"dark" | "light">("dark");
  const [showLatestPrice, setShowLatestPrice] = useState(true);
  const [showHighLow, setShowHighLow] = useState(true);
  const [showLatestIndicator, setShowLatestIndicator] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [axisType, setAxisType] = useState<AxisType>("Linear");
  const [invertAxis, setInvertAxis] = useState(false);
  const [percentScale, setPercentScale] = useState(false);
  const [priceZoom, setPriceZoom] = useState(1);
  const [priceOffset, setPriceOffset] = useState(0);
  const [symbol, setSymbol] = useState("RELIANCE.NS");
  const [basketSymbols, setBasketSymbols] = useState<string[]>([]);
  const [data, setData] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadSequence, setReloadSequence] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverY, setHoverY] = useState<number | null>(null);
  const [hoverSnap, setHoverSnap] = useState<DrawPoint | null>(null);
  const [horizontalLevels, setHorizontalLevels] = useState<number[]>([]);
  const [drawingLevel, setDrawingLevel] = useState(false);
  const [drawingTool, setDrawingTool] = useState<string | null>(null);
  const [openDrawingMenu, setOpenDrawingMenu] = useState<string | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [pendingDrawingPoints, setPendingDrawingPoints] = useState<DrawPoint[]>([]);
  const [drawingsLocked, setDrawingsLocked] = useState(false);
  const [magnetSnapping, setMagnetSnapping] = useState(false);
  const [drawingsHidden, setDrawingsHidden] = useState(false);
  const [overlaySymbol, setOverlaySymbol] = useState<string | null>(null);
  const [chartPanel, setChartPanel] = useState<ChartPanel>(null);
  const [watchlistItems, setWatchlistItems] = useState<ChartWatchlistItem[]>([]);
  const [portfolioGroups, setPortfolioGroups] = useState<ChartPortfolioGroup[]>([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);
  const [portfolioHoldings, setPortfolioHoldings] = useState<ChartHolding[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState("");
  const [compareInput, setCompareInput] = useState("");
  const [compareSymbols, setCompareSymbols] = useState<string[]>([]);
  const [comparisonData, setComparisonData] = useState<{ symbol: string; candles: Candle[] }[]>([]);
  const [comparisonError, setComparisonError] = useState("");
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [chartAlerts, setChartAlerts] = useState<StockAlert[]>([]);
  const [alertNote, setAlertNote] = useState("");
  const [placingAlert, setPlacingAlert] = useState(false);
  const [alertError, setAlertError] = useState("");
  const [magicOpen, setMagicOpen] = useState(false);
  const [magicTab, setMagicTab] = useState<MagicTab>("Patterns");
  const [magicResult, setMagicResult] = useState(false);
  const [selectedHighlight, setSelectedHighlight] = useState<{ start: number; end: number } | null>(null);
  const [signalStart, setSignalStart] = useState<DrawPoint | null>(null);
  const [signalEnd, setSignalEnd] = useState<DrawPoint | null>(null);
  const [signalDrawing, setSignalDrawing] = useState(false);
  const [visibleRange, setVisibleRange] = useState<{ start: number; end: number } | null>(null);
  const [panOffsetX, setPanOffsetX] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [baseFiltersOpen, setBaseFiltersOpen] = useState(false);
  const [showBaseOverlay, setShowBaseOverlay] = useState(true);
  const [breakoutBasesOnly, setBreakoutBasesOnly] = useState(true);
  const [baseMinWeeks, setBaseMinWeeks] = useState(4);
  const [baseMaxWeeks, setBaseMaxWeeks] = useState(26);
  const [baseMaxDepth, setBaseMaxDepth] = useState(15);
  const [minimumBaseQuality, setMinimumBaseQuality] = useState<"High" | "Medium" | "Low">("High");
  const [breakoutBuffer, setBreakoutBuffer] = useState(0.5);
  const [minimumBreakoutVolume, setMinimumBreakoutVolume] = useState(0);
  const [includeFailedBases, setIncludeFailedBases] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef<{
    pointerId: number;
    startClientX: number;
    boundsWidth: number;
    startIndex: number;
    barCount: number;
    offsetX: number;
    moved: boolean;
  } | null>(null);
  const priceScaleDragRef = useRef<{
    pointerId: number;
    startClientY: number;
    boundsHeight: number;
    offset: number;
  } | null>(null);
  const skipClickRef = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("fintrack-chart-theme");
      setChartTheme(
        saved === "light" || saved === "dark"
          ? saved
          : document.documentElement.getAttribute("data-theme") === "light"
            ? "light"
            : "dark",
      );
    } catch (error) {
      console.warn("Unable to load the chart theme preference.", error);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const querySymbol = params.get("symbol");
    const queryExchange = params.get("exchange")?.toUpperCase();
    const nextExchange = queryExchange === "BSE" ? "BSE" : "NSE";
    if (!querySymbol) return;
    const basketTickers = querySymbol.split("+").map((part) =>
      part.trim().toUpperCase().replace(/\s+/g, ""),
    );
    if (basketTickers.length > 1 && basketTickers.length <= MAX_SPREAD_SYMBOLS) {
      const constituents = basketTickers.map((ticker) => providerSymbol(ticker, nextExchange));
      setExchange(nextExchange);
      setBasketSymbols(constituents);
      setSymbolInput(constituents.map(symbolLabel).join("+"));
      setSymbol(`BASKET:${constituents.join("+")}`);
      setPercentScale(true);
      return;
    }
    const ticker = querySymbol.toUpperCase().replace(/\s+/g, "").replace(/\.(NS|BO)$/i, "");
    const symbolExchange = /\.BO$/i.test(querySymbol)
      ? "BSE"
      : /\.NS$/i.test(querySymbol)
        ? "NSE"
        : nextExchange;
    setExchange(symbolExchange);
    setSymbolInput(ticker);
    setSymbol(
      /\.(NS|BO)$/i.test(querySymbol)
        ? `${ticker}.${symbolExchange === "NSE" ? "NS" : "BO"}`
        : `${ticker}.${symbolExchange === "NSE" ? "NS" : "BO"}`,
    );
  }, []);

  useEffect(() => {
    const onFullscreenChange = () =>
      setFullscreen(document.fullscreenElement === chartRef.current);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    let active = true;
    fetch(apiUrl("/account/me"))
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          const message = typeof body?.error === "string" ? body.error : "Could not load account";
          throw new Error(message);
        }
        return body as { user?: { id?: string } };
      })
      .then(({ user }) => {
        if (!active || !user?.id) return;
        const key = `fintrack_alerts:${user.id}`;
        setStorageKey(key);
        if (localStorage.getItem(key) != null) {
          setChartAlerts(loadStockAlerts(key));
        } else if (user.id === "1") {
          const legacy = loadStockAlerts("fintrack_alerts");
          setChartAlerts(legacy);
          if (legacy.length) saveStockAlerts(key, legacy);
        } else {
          setChartAlerts([]);
        }
      })
      .catch((cause: unknown) => {
        if (active) setAlertError(cause instanceof Error ? cause.message : "Could not load account");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!storageKey) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) setChartAlerts(loadStockAlerts(storageKey));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      saveStockAlerts(storageKey, chartAlerts);
    } catch (cause) {
      console.error("Unable to save chart alerts.", cause);
      setAlertError("Unable to save alerts in this browser.");
    }
  }, [chartAlerts, storageKey]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`fintrack-chart-drawings:${symbol}`);
      setDrawings(saved ? (JSON.parse(saved) as Drawing[]) : []);
      const savedLevels = localStorage.getItem(`fintrack-chart-levels:${symbol}`);
      setHorizontalLevels(savedLevels ? (JSON.parse(savedLevels) as number[]) : []);
    } catch (cause) {
      console.warn("Unable to load saved chart overlays.", cause);
      setDrawings([]);
      setHorizontalLevels([]);
    }
    setOverlaySymbol(symbol);
    setPendingDrawingPoints([]);
    setSignalStart(null);
    setSignalEnd(null);
  }, [symbol]);

  useEffect(() => {
    if (overlaySymbol !== symbol) return;
    try {
      localStorage.setItem(`fintrack-chart-drawings:${symbol}`, JSON.stringify(drawings));
      localStorage.setItem(`fintrack-chart-levels:${symbol}`, JSON.stringify(horizontalLevels));
    } catch (cause) {
      console.warn("Unable to save chart overlays.", cause);
    }
  }, [drawings, horizontalLevels, overlaySymbol, symbol]);

  useEffect(() => {
    const controller = new AbortController();
    const query = {
      ...PERIOD_QUERY[period],
      interval: selectedInterval ?? PERIOD_QUERY[period].interval,
    };
    setLoading(true);
    setError(null);
    setHoverIndex(null);
    const fetchCandles = async (ticker: string): Promise<Candle[]> => {
      const response = await fetch(
        apiUrl(
          `/stocks/history/${encodeURIComponent(ticker)}?period=${query.range}&interval=${query.interval}`,
        ),
        { signal: controller.signal },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: unknown }
          | null;
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : `Chart data unavailable (HTTP ${response.status})`,
        );
      }
      return (await response.json()) as Candle[];
    };
    const history = basketSymbols.length
      ? Promise.all(basketSymbols.map(fetchCandles)).then((histories) =>
          buildSumSpreadSeries(
            histories.map((candles, index) => ({
              symbol: basketSymbols[index]!,
              candles,
            })),
          ),
        )
      : fetchCandles(symbol);
    history
      .then((candles) => {
        if (candles.length === 0)
          throw new Error(
            basketSymbols.length
              ? "The spread symbols have no matching historical timestamps."
              : "No price history is available for this symbol.",
          );
        setData(candles);
        setPanOffsetX(0);
        setPriceZoom(1);
        setPriceOffset(0);
        const visibleBars = 100;
        setVisibleRange(
          candles.length > visibleBars
            ? { start: candles.length - visibleBars, end: candles.length - 1 }
            : null,
        );
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError")
          return;
        setError(
          cause instanceof Error ? cause.message : "Unable to load chart data.",
        );
        setData([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [symbol, basketSymbols, period, selectedInterval, reloadSequence]);

  useEffect(() => {
    if (chartPanel !== "watchlist" && chartPanel !== "portfolio") return;
    const controller = new AbortController();
    const loadPanel = async () => {
      setPanelLoading(true);
      setPanelError("");
      try {
        if (chartPanel === "watchlist") {
          const response = await fetch(apiUrl("/watchlist"), { signal: controller.signal });
          const body: unknown = await response.json();
          if (!response.ok) {
            const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
              ? body.error
              : `Watchlist unavailable (HTTP ${response.status})`;
            throw new Error(message);
          }
          setWatchlistItems(body as ChartWatchlistItem[]);
        } else {
          const groupsResponse = await fetch(apiUrl("/portfolio/collections"), { signal: controller.signal });
          const groupsBody: unknown = await groupsResponse.json();
          if (!groupsResponse.ok) {
            const message = typeof groupsBody === "object" && groupsBody !== null && "error" in groupsBody && typeof groupsBody.error === "string"
              ? groupsBody.error
              : `Portfolios unavailable (HTTP ${groupsResponse.status})`;
            throw new Error(message);
          }
          const groups = groupsBody as ChartPortfolioGroup[];
          setPortfolioGroups(groups);
          const targetId = selectedPortfolioId ?? groups[0]?.id;
          if (!targetId) {
            setPortfolioHoldings([]);
            setSelectedPortfolioId(null);
            return;
          }
          if (targetId !== selectedPortfolioId) setSelectedPortfolioId(targetId);
          const holdingsResponse = await fetch(
            apiUrl(`/portfolio?portfolioId=${targetId}`),
            { signal: controller.signal },
          );
          const holdingsBody: unknown = await holdingsResponse.json();
          if (!holdingsResponse.ok) {
            const message = typeof holdingsBody === "object" && holdingsBody !== null && "error" in holdingsBody && typeof holdingsBody.error === "string"
              ? holdingsBody.error
              : `Portfolio unavailable (HTTP ${holdingsResponse.status})`;
            throw new Error(message);
          }
          setPortfolioHoldings(holdingsBody as ChartHolding[]);
        }
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setPanelError(cause instanceof Error ? cause.message : "Unable to load chart panel.");
      } finally {
        if (!controller.signal.aborted) setPanelLoading(false);
      }
    };
    void loadPanel();
    return () => controller.abort();
  }, [chartPanel, selectedPortfolioId]);

  useEffect(() => {
    if (compareSymbols.length === 0) {
      setComparisonData([]);
      setComparisonError("");
      return;
    }
    const controller = new AbortController();
    const query = {
      ...PERIOD_QUERY[period],
      interval: selectedInterval ?? PERIOD_QUERY[period].interval,
    };
    const loadComparisons = async () => {
      setComparisonError("");
      try {
        const loaded = await Promise.all(compareSymbols.map(async (compareSymbol) => {
          const response = await fetch(
            apiUrl(`/stocks/history/${encodeURIComponent(compareSymbol)}?period=${query.range}&interval=${query.interval}`),
            { signal: controller.signal },
          );
          const body: unknown = await response.json();
          if (!response.ok) {
            const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
              ? body.error
              : `Comparison data unavailable for ${compareSymbol} (HTTP ${response.status})`;
            throw new Error(message);
          }
          return { symbol: compareSymbol, candles: body as Candle[] };
        }));
        if (!controller.signal.aborted) setComparisonData(loaded);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setComparisonError(cause instanceof Error ? cause.message : "Unable to load comparison data.");
      }
    };
    void loadComparisons();
    return () => controller.abort();
  }, [compareSymbols, period, selectedInterval, reloadSequence]);

  useEffect(() => {
    const activeAlerts = chartAlerts.filter((alert) => !alert.triggered);
    if (activeAlerts.length === 0) return;
    let stopped = false;
    const checkLiveAlerts = async () => {
      const symbols = [...new Set(activeAlerts.map((alert) => alert.symbol))];
      const results = await Promise.all(symbols.map(async (ticker) => {
        try {
          const response = await fetch(apiUrl(`/stocks/quote/${encodeURIComponent(ticker)}`));
          if (!response.ok) throw new Error(`Quote unavailable (HTTP ${response.status})`);
          return await response.json() as StockAlertQuote;
        } catch (cause) {
          console.error(`Unable to check chart alert for ${ticker}.`, cause);
          setAlertError(`Live alert quotes are temporarily unavailable for ${symbolLabel(ticker)}.`);
          return null;
        }
      }));
      if (stopped) return;
      const quotes = new Map(results.filter((quote): quote is StockAlertQuote => quote != null).map((quote) => [quote.symbol, quote]));
      setChartAlerts((current) => {
        let changed = false;
        const updated = current.map((alert) => {
          const quote = quotes.get(alert.symbol);
          if (alert.triggered || !quote || !isStockAlertTriggered(alert, quote)) return alert;
          changed = true;
          return { ...alert, triggered: true, triggeredAt: new Date().toISOString() };
        });
        return changed ? updated : current;
      });
    };
    void checkLiveAlerts();
    const timer = window.setInterval(() => void checkLiveAlerts(), 30_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [chartAlerts]);

  const indicatorSeries = useMemo(
    () => new Map(indicators.map((indicator) => [indicator, calculateIndicator(data, indicator)])),
    [data, indicators],
  );
  const indicatorComponents = useMemo(
    () => new Map(indicators.map((indicator) => [indicator, calculateIndicatorComponents(data, indicator)])),
    [data, indicators],
  );

  const activeCandle =
    hoverIndex == null ? data[data.length - 1] : data[hoverIndex];
  const query = {
    ...PERIOD_QUERY[period],
    interval: selectedInterval ?? PERIOD_QUERY[period].interval,
  };
  const hasVolume = indicators.includes("vol") && basketSymbols.length === 0;
  const priceBottom = hasVolume ? PRICE_BOTTOM : VOLUME_BOTTOM + 24;
  const highs = data.map((candle) => candle.high);
  const lows = data.map((candle) => candle.low);
  const visibleStart = Math.max(0, Math.min(visibleRange?.start ?? 0, Math.max(0, data.length - 1)));
  const visibleEnd = Math.max(visibleStart, Math.min(visibleRange?.end ?? data.length - 1, data.length - 1));
  const visibleCount = Math.max(1, visibleEnd - visibleStart + 1);
  const priceMin = Math.min(...lows.slice(visibleStart, visibleEnd + 1));
  const priceMax = Math.max(...highs.slice(visibleStart, visibleEnd + 1));
  const pricePad = (priceMax - priceMin) * 0.06 || priceMax * 0.01 || 1;
  const minPrice = priceMin - pricePad;
  const maxPrice = priceMax + pricePad;
  const percentBasePrice = data[visibleStart]?.close || data[0]?.close || 1;
  const toScaleValue = (value: number) =>
    percentScale ? ((value / percentBasePrice) - 1) * 100 : value;
  const firstVisibleTimestamp = data[visibleStart]?.timestamp ?? 0;
  const lastVisibleTimestamp = data[visibleEnd]?.timestamp ?? 0;
  const comparisonScaleValues = comparisonData.flatMap((item) =>
    normalizeClosesInTimeRange(item.candles, firstVisibleTimestamp, lastVisibleTimestamp)
      .map((point) => percentScale
        ? point.changePct
        : percentBasePrice * (1 + point.changePct / 100)),
  );
  const baseAxisMin = toScaleValue(minPrice);
  const baseAxisMax = toScaleValue(maxPrice);
  const axisValueMin = Math.min(baseAxisMin, ...comparisonScaleValues);
  const axisValueMax = Math.max(baseAxisMax, ...comparisonScaleValues);
  const comparisonPad = comparisonScaleValues.length
    ? (axisValueMax - axisValueMin) * 0.06
    : 0;
  const plotWidth = WIDTH - LEFT - RIGHT;
  const step = plotWidth / visibleCount;
  const xAt = (index: number) => LEFT + step * (index - visibleStart + 0.5) + panOffsetX;
  const axisTransform = (value: number) =>
    !percentScale && axisType === "Logarithmic"
      ? Math.log(Math.max(value, Number.MIN_VALUE))
      : value;
  const axisMin = axisTransform(axisValueMin - comparisonPad);
  const axisMax = axisTransform(axisValueMax + comparisonPad);
  const priceCenterY = (TOP + priceBottom) / 2;
  const yForScaleValue = (value: number) => {
    const ratio = (axisTransform(value) - axisMin) / (axisMax - axisMin || 1);
    const baseY = TOP + (invertAxis ? ratio : 1 - ratio) * (priceBottom - TOP);
    return priceCenterY + (baseY - priceCenterY) * priceZoom + priceOffset;
  };
  const yPrice = (value: number) => {
    return yForScaleValue(toScaleValue(value));
  };
  const yToPrice = (y: number) => {
    const baseY = priceCenterY + (y - priceCenterY - priceOffset) / priceZoom;
    const ratio = (baseY - TOP) / (priceBottom - TOP);
    const value = axisMin + (invertAxis ? ratio : 1 - ratio) * (axisMax - axisMin);
    const scaled = !percentScale && axisType === "Logarithmic" ? Math.exp(value) : value;
    return percentScale ? percentBasePrice * (1 + scaled / 100) : scaled;
  };
  const formatScaleValue = (value: number) =>
    percentScale ? `${toScaleValue(value).toFixed(2)}%` : formatPrice(value);
  const maxVolume = Math.max(...data.slice(visibleStart, visibleEnd + 1).map((candle) => candle.volume), 1);
  const yVolume = (value: number) =>
    VOLUME_BOTTOM - (value / maxVolume) * (VOLUME_BOTTOM - VOLUME_TOP);
  const volumeAverageLines = [5, 10, 20].map((periodValue, seriesIndex) => {
    const values = getVolumeSma(data, periodValue);
    const path = values
      .slice(visibleStart, visibleEnd + 1)
      .map((value, localIndex) =>
        value == null
          ? ""
          : `${localIndex === 0 || values[visibleStart + localIndex - 1] == null ? "M" : "L"}${xAt(visibleStart + localIndex)},${yVolume(value)}`,
      )
      .filter(Boolean)
      .join(" ");
    return {
      period: periodValue,
      color: ["#f59e0b", "#a855f7", "#3b82f6"][seriesIndex],
      path,
    };
  });
  const pathFor = (values: (number | null)[]) =>
    values.slice(visibleStart, visibleEnd + 1)
      .map((value, localIndex, visibleValues) => {
        const index = visibleStart + localIndex;
        return (
        value == null
          ? ""
          : `${localIndex === 0 || visibleValues[localIndex - 1] == null ? "M" : "L"}${xAt(index)},${yPrice(value)}`
        );
      })
      .filter(Boolean)
      .join(" ");
  const chartIndicesByTimestamp = new Map(data.map((candle, index) => [candle.timestamp, index]));
  const comparisonLines = comparisonData.map((item, index) => {
    const color = ["#60a5fa", "#f472b6", "#fbbf24", "#a78bfa", "#34d399"][index % 5]!;
    const normalized = normalizeClosesInTimeRange(item.candles, firstVisibleTimestamp, lastVisibleTimestamp);
    const points = normalized
      .flatMap((point) => {
        const chartIndex = chartIndicesByTimestamp.get(point.timestamp);
        if (chartIndex == null || chartIndex < visibleStart || chartIndex > visibleEnd) return [];
        const value = percentScale
          ? point.changePct
          : percentBasePrice * (1 + point.changePct / 100);
        const y = percentScale ? yForScaleValue(value) : yPrice(value);
        return [{ x: xAt(chartIndex), y, changePct: point.changePct }];
      });
    return {
      symbol: item.symbol,
      color,
      latestPct: points[points.length - 1]?.changePct,
      path: points.map((point, pointIndex) =>
        `${pointIndex === 0 ? "M" : "L"}${point.x},${point.y}`,
      ).join(" "),
    };
  });
  const lowerIndicators = indicators.filter(
    (indicator) =>
      indicator !== "vol" &&
      INDICATORS.find((item) => item.id === indicator)?.group === "Sub",
  );
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (data.length < 2 || step === 0) return;
      const bounds = svg.getBoundingClientRect();
      const axisLeft = bounds.left + (bounds.width * (WIDTH - RIGHT)) / WIDTH;
      const deltaPixels =
        event.deltaY *
        (event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? bounds.height
            : 1);
      if (event.clientX >= axisLeft) {
        const pointerY = ((event.clientY - bounds.top) / bounds.height) * HEIGHT;
        if (pointerY < TOP || pointerY > priceBottom) return;
        const nextZoom = Math.max(0.1, Math.min(12, priceZoom * Math.exp(-deltaPixels * 0.00075)));
        const anchorOffset = (pointerY - priceCenterY - priceOffset) / priceZoom;
        setPriceZoom(nextZoom);
        setPriceOffset(pointerY - priceCenterY - anchorOffset * nextZoom);
        return;
      }
      const x = ((event.clientX - bounds.left) / bounds.width) * WIDTH - panOffsetX;
      const centerIndex = Math.max(
        visibleStart,
        Math.min(visibleEnd, visibleStart + Math.floor((x - LEFT) / step)),
      );
      const nextCount = Math.max(
        20,
        Math.min(data.length, Math.round(visibleCount * Math.exp(deltaPixels * 0.00075))),
      );
      const ratio = (centerIndex - visibleStart) / visibleCount;
      const start = Math.max(
        0,
        Math.min(data.length - nextCount, Math.round(centerIndex - nextCount * ratio)),
      );
      setPanOffsetX(0);
      setVisibleRange(nextCount >= data.length ? null : { start, end: start + nextCount - 1 });
    };
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [data.length, panOffsetX, priceBottom, priceCenterY, priceOffset, priceZoom, step, visibleCount, visibleEnd, visibleStart]);
  const mainIndicatorLines: { key: string; color: string; values: (number | null)[] }[] = [];
  for (const indicator of indicators) {
    const definition = INDICATORS.find((item) => item.id === indicator);
    if (!definition || definition.group !== "Main") continue;
    if (indicator === "ma") {
      for (const [periodValue, color] of [[5, "#f59e0b"], [10, "#a855f7"], [30, "#3b82f6"], [60, "#ec4899"]] as const) {
        mainIndicatorLines.push({ key: `MA ${periodValue}`, color, values: getSma(data, periodValue) });
      }
    } else if (indicator === "boll") {
      const middle = simpleMovingAverage(data.map((bar) => bar.close), 20);
      const upper = middle.map((value, index) => {
        if (value == null) return null;
        const sample = data.slice(index - 19, index + 1).map((bar) => bar.close);
        const deviation = Math.sqrt(sample.reduce((sum, item) => sum + (item - value) ** 2, 0) / sample.length);
        return value + 2 * deviation;
      });
      const lower = middle.map((value, index) => {
        if (value == null) return null;
        const sample = data.slice(index - 19, index + 1).map((bar) => bar.close);
        const deviation = Math.sqrt(sample.reduce((sum, item) => sum + (item - value) ** 2, 0) / sample.length);
        return value - 2 * deviation;
      });
      mainIndicatorLines.push({ key: "BOLL upper", color: "#a78bfa", values: upper });
      mainIndicatorLines.push({ key: "BOLL middle", color: "#818cf8", values: middle });
      mainIndicatorLines.push({ key: "BOLL lower", color: "#a78bfa", values: lower });
    } else if (
      indicator === "ema20" ||
      indicator === "ema50" ||
      indicator === "ema100" ||
      indicator === "ema200"
    ) {
      const periodValue = Number(indicator.slice(3));
      const colors: Record<number, string> = {
        20: "#f97316",
        50: "#22d3ee",
        100: "#a855f7",
        200: "#f59e0b",
      };
      mainIndicatorLines.push({
        key: `EMA ${periodValue}`,
        color: colors[periodValue],
        values: indicatorSeries.get(indicator) ?? [],
      });
    } else {
      mainIndicatorLines.push({
        key: definition.label.split(" ")[0],
        color: indicator === "sar" ? "#22d3ee" : "#f59e0b",
        values: indicatorSeries.get(indicator) ?? [],
      });
    }
  }
  const candlePatterns = useMemo(() => scanCandlestickPatterns(data), [data]);
  const chartPatterns = useMemo(() => findChartPatterns(data), [data]);
  const supportResistance = useMemo(() => findSupportResistance(data), [data]);
  const monthlyInterval = query.interval === "1mo" || query.interval === "3mo";
  const weeklyBases = useMemo(
    () => monthlyInterval ? [] : findWeeklyBases(data, breakoutBuffer),
    [data, monthlyInterval, breakoutBuffer],
  );
  const patternForDisplay = chartPatterns.filter((pattern) => pattern.endIndex >= Math.max(0, data.length - 250));
  const signalMovePct = signalStart && signalEnd && data[signalStart.index]
    ? ((signalEnd.price - signalStart.price) / signalStart.price) * 100
    : null;
  const signalBars = signalStart && signalEnd ? Math.abs(signalEnd.index - signalStart.index) + 1 : 0;
  const signalVolumeMultiple = signalStart && signalEnd && signalBars > 0
    ? mean(data.slice(Math.min(signalStart.index, signalEnd.index), Math.max(signalStart.index, signalEnd.index) + 1).map((bar) => bar.volume)) /
      Math.max(mean(data.slice(Math.max(0, Math.min(signalStart.index, signalEnd.index) - 20), Math.min(signalStart.index, signalEnd.index)).map((bar) => bar.volume)), 1)
    : null;
  const qualityRank = { Low: 0, Medium: 1, High: 2 };
  const visibleWeeklyBases = weeklyBases.filter((base) =>
    base.weeks >= baseMinWeeks &&
    base.weeks <= baseMaxWeeks &&
    base.depthPct <= baseMaxDepth &&
    qualityRank[base.quality] >= qualityRank[minimumBaseQuality] &&
    base.breakoutVolumeMultiple >= minimumBreakoutVolume &&
    (includeFailedBases || base.breakout !== "Failed breakout") &&
    (!breakoutBasesOnly || base.breakout === "Confirmed breakout"),
  );

  function applySymbol() {
    const enteredSymbols = symbolInput
      .split("+")
      .map((part) => providerSymbol(part, exchange))
      .filter(Boolean);
    if (enteredSymbols.length > 1) {
      if (enteredSymbols.length > MAX_SPREAD_SYMBOLS) {
        setError(`A custom spread supports up to ${MAX_SPREAD_SYMBOLS} symbols.`);
        return;
      }
      if (new Set(enteredSymbols).size !== enteredSymbols.length) {
        setError("A custom spread cannot contain duplicate symbols.");
        return;
      }
      const expression = enteredSymbols.map(symbolLabel).join("+");
      setBasketSymbols(enteredSymbols);
      setSymbolInput(expression);
      setSymbol(`BASKET:${enteredSymbols.join("+")}`);
      setPercentScale(true);
      window.history.replaceState(
        null,
        "",
        `/chart?symbol=${encodeURIComponent(expression)}&exchange=${exchange}`,
      );
      return;
    }
    const ticker = enteredSymbols[0];
    if (!ticker) return;
    setBasketSymbols([]);
    setSymbolInput(symbolLabel(ticker));
    setSymbol(ticker);
    setPercentScale(compareSymbols.length > 0);
    window.history.replaceState(
      null,
      "",
      `/chart?symbol=${encodeURIComponent(symbolLabel(ticker))}&exchange=${exchange}`,
    );
  }

  function loadChartSymbol(value: string) {
    const nextSymbol = providerSymbol(value, exchange);
    if (!nextSymbol) return;
    const nextExchange = /\.BO$/i.test(nextSymbol) ? "BSE" : "NSE";
    setExchange(nextExchange);
    setBasketSymbols([]);
    setSymbolInput(symbolLabel(nextSymbol));
    setSymbol(nextSymbol);
    setPercentScale(compareSymbols.length > 0);
    window.history.replaceState(
      null,
      "",
      `/chart?symbol=${encodeURIComponent(symbolLabel(nextSymbol))}&exchange=${nextExchange}`,
    );
  }

  function addComparisonSymbol() {
    const nextSymbol = providerSymbol(compareInput, exchange);
    if (!nextSymbol) {
      setComparisonError("Enter a stock symbol to compare.");
      return;
    }
    if (compareSymbols.includes(nextSymbol)) {
      setComparisonError(`${symbolLabel(nextSymbol)} is already in the comparison.`);
      return;
    }
    if (compareSymbols.length >= MAX_SPREAD_SYMBOLS) {
      setComparisonError(`Compare up to ${MAX_SPREAD_SYMBOLS} stocks at once.`);
      return;
    }
    setComparisonError("");
    setCompareSymbols((current) => [...current, nextSymbol]);
    setCompareInput("");
    setPercentScale(true);
  }

  function openCustomSpread() {
    if (compareSymbols.length < 2) {
      setComparisonError("Add at least two stocks to create a sum spread.");
      return;
    }
    const expression = compareSymbols.map(symbolLabel).join("+");
    setBasketSymbols(compareSymbols);
    setSymbolInput(expression);
    setSymbol(`BASKET:${compareSymbols.join("+")}`);
    setPercentScale(true);
    setError(null);
    window.history.replaceState(
      null,
      "",
      `/chart?symbol=${encodeURIComponent(expression)}&exchange=${exchange}`,
    );
  }

  function removeChartAlert(id: string) {
    setChartAlerts((alerts) => alerts.filter((alert) => alert.id !== id));
  }

  function toggleIndicator(indicator: IndicatorId) {
    setIndicators((current) =>
      current.includes(indicator)
        ? current.filter((value) => value !== indicator)
        : [...current, indicator],
    );
  }

  function selectDrawingTool(tool: string) {
    setDrawingTool(tool);
    setPendingDrawingPoints([]);
    setDrawingLevel(false);
    setOpenDrawingMenu(null);
    setMagicOpen(false);
  }

  function onChartPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || data.length < 2) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
    const pointerY = ((event.clientY - bounds.top) / bounds.height) * HEIGHT;
    if (pointerX >= WIDTH - RIGHT && pointerY >= TOP && pointerY <= priceBottom) {
      priceScaleDragRef.current = {
        pointerId: event.pointerId,
        startClientY: event.clientY,
        boundsHeight: bounds.height,
        offset: priceOffset,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (
      drawingTool ||
      drawingLevel ||
      placingAlert ||
      signalDrawing
    ) return;
    panRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      boundsWidth: event.currentTarget.getBoundingClientRect().width,
      startIndex: visibleStart,
      barCount: visibleCount,
      offsetX: panOffsetX,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onChartPointer(event: React.PointerEvent<SVGSVGElement>) {
    if (data.length === 0 || step === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const scaleDrag = priceScaleDragRef.current;
    if (scaleDrag?.pointerId === event.pointerId) {
      const deltaY = ((event.clientY - scaleDrag.startClientY) / scaleDrag.boundsHeight) * HEIGHT;
      setPriceOffset(scaleDrag.offset + deltaY);
      return;
    }
    const pan = panRef.current;
    if (pan?.pointerId === event.pointerId) {
      const deltaX = ((event.clientX - pan.startClientX) / pan.boundsWidth) * WIDTH;
      pan.moved ||= Math.abs(deltaX) > 3;
      if (pan.moved) {
        skipClickRef.current = true;
        setIsPanning(true);
        const totalOffset = pan.offsetX + deltaX;
        const barShift = Math.trunc(totalOffset / step);
        const maxStart = Math.max(0, data.length - pan.barCount);
        let nextStart = pan.startIndex - barShift;
        let nextOffset = totalOffset - barShift * step;
        if (nextStart < 0 || (nextStart === 0 && totalOffset > 0)) {
          nextStart = 0;
          nextOffset = 0;
        } else if (nextStart > maxStart || (nextStart === maxStart && totalOffset < 0)) {
          nextStart = maxStart;
          nextOffset = 0;
        }
        setVisibleRange({ start: nextStart, end: nextStart + pan.barCount - 1 });
        setPanOffsetX(nextOffset);
        setHoverIndex(null);
        setHoverY(null);
        setHoverSnap(null);
        return;
      }
    }
    const x = ((event.clientX - bounds.left) / bounds.width) * WIDTH - panOffsetX;
    const y = ((event.clientY - bounds.top) / bounds.height) * HEIGHT;
    setHoverY(y >= TOP && y <= priceBottom ? y : null);
    const index = Math.max(
      visibleStart,
      Math.min(visibleEnd, visibleStart + Math.floor((x - LEFT) / step)),
    );
    setHoverIndex(index);
    if (magnetSnapping && y >= TOP && y <= priceBottom) {
      const candle = data[index];
      const nearestPrice = [candle.open, candle.high, candle.low, candle.close]
        .reduce((nearest, value) =>
          Math.abs(yPrice(value) - y) < Math.abs(yPrice(nearest) - y)
            ? value
            : nearest,
        );
      setHoverSnap({ index, price: nearestPrice });
    } else {
      setHoverSnap(null);
    }
  }

  function finishChartPan(event: React.PointerEvent<SVGSVGElement>) {
    if (priceScaleDragRef.current?.pointerId === event.pointerId) {
      priceScaleDragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }
    if (panRef.current?.pointerId !== event.pointerId) return;
    const moved = panRef.current.moved;
    panRef.current = null;
    setIsPanning(false);
    if (moved) skipClickRef.current = true;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onChartClick(event: React.MouseEvent<SVGSVGElement>) {
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }
    if (data.length === 0 || step === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * WIDTH - panOffsetX;
    const y = ((event.clientY - bounds.top) / bounds.height) * HEIGHT;
    const index = Math.max(
      visibleStart,
      Math.min(visibleEnd, visibleStart + Math.floor((x - LEFT) / step)),
    );
    const candle = data[index];
    const point = {
      index,
      price: magnetSnapping
        ? [candle.open, candle.high, candle.low, candle.close].reduce(
            (nearest, value) =>
              Math.abs(yPrice(value) - y) < Math.abs(yPrice(nearest) - y)
                ? value
                : nearest,
          )
        : yToPrice(y),
    };
    if (x < LEFT || x > WIDTH - RIGHT || y < TOP || y > priceBottom) return;
    if (placingAlert) {
      if (!storageKey || basketSymbols.length > 0) {
        setAlertError(
          !storageKey
            ? "Sign in to save chart alerts."
            : "Price alerts are only available on a single-stock chart.",
        );
        setPlacingAlert(false);
        return;
      }
      const lastPrice = data[data.length - 1]?.close ?? point.price;
      const alert: StockAlert = {
        id: crypto.randomUUID(),
        symbol,
        condition: point.price >= lastPrice ? "above" : "below",
        value: point.price,
        notes: alertNote.trim(),
        createdAt: new Date().toISOString(),
        triggered: false,
      };
      setChartAlerts((alerts) => [alert, ...alerts]);
      setAlertError("");
      setPlacingAlert(false);
      setChartPanel("alerts");
      return;
    }
    if (signalDrawing) {
      if (!signalStart) setSignalStart(point);
      else {
        setSignalEnd(point);
        setSignalDrawing(false);
      }
      return;
    }
    if (drawingsLocked) return;
    if (drawingTool && !drawingsLocked) {
      const singleClickTools = ["H. Straight Line", "V. Straight Line", "H. Ray Line", "V. Ray Line", "Price Line", "Price Tag", "Annotation"];
      if (singleClickTools.includes(drawingTool)) {
        const text = drawingTool === "Annotation"
          ? window.prompt("Annotation text", "Note") ?? undefined
          : drawingTool === "Price Tag"
            ? formatPrice(point.price)
            : undefined;
        if (drawingTool !== "Annotation" || text) {
          setDrawings((items) => [...items, { id: crypto.randomUUID(), tool: drawingTool, points: [point], text }]);
        }
        setDrawingTool(null);
        return;
      }
      const requiredPoints =
        drawingTool === "3-Wave" ? 3 :
        drawingTool === "5-Wave" || drawingTool === "Any Wave" ? 5 :
        drawingTool === "8-Wave" ? 8 :
        drawingTool === "ABCD" ? 4 :
        drawingTool === "XABCD" ? 5 :
        drawingTool === "Triangle" ||
        drawingTool === "Parallelogram" ||
        drawingTool === "Price Channel" ||
        drawingTool === "Parallel Lines" ? 3 :
        drawingTool === "Fib Extension" ? 3 : 2;
      const nextPoints = [...pendingDrawingPoints, point];
      if (nextPoints.length < requiredPoints) {
        setPendingDrawingPoints(nextPoints);
        return;
      }
      const start = nextPoints[0];
      const delta = point.price - start.price;
      const text = drawingTool === "Measure"
        ? `${delta >= 0 ? "+" : "−"}${formatPrice(Math.abs(delta))} · ${delta >= 0 ? "+" : ""}${((delta / start.price) * 100).toFixed(2)}% · ${Math.abs(point.index - start.index)} bars`
        : undefined;
      setDrawings((items) => [...items, { id: crypto.randomUUID(), tool: drawingTool, points: nextPoints, text }]);
      setPendingDrawingPoints([]);
      setDrawingTool(null);
      return;
    }
    if (!drawingLevel) return;
    const value = point.price;
    if (value >= minPrice && value <= maxPrice) {
      setHorizontalLevels((levels) => [...levels, value]);
    }
    setDrawingLevel(false);
  }

  function zoomChart(direction: "in" | "out", centerIndex = visibleEnd) {
    if (data.length < 2) return;
    const currentCount = visibleCount;
    const nextCount = Math.max(20, Math.min(data.length, Math.round(currentCount * (direction === "in" ? 0.75 : 1.33))));
    const ratio = (centerIndex - visibleStart) / currentCount;
    const start = Math.max(0, Math.min(data.length - nextCount, Math.round(centerIndex - nextCount * ratio)));
    setPanOffsetX(0);
    setVisibleRange(nextCount >= data.length ? null : { start, end: start + nextCount - 1 });
  }

  function resetPriceScale() {
    setPriceZoom(1);
    setPriceOffset(0);
  }

  function scanMagicTab() {
    setMagicResult(true);
    setSelectedHighlight(null);
    if (magicTab === "Signals") {
      setSignalStart(null);
      setSignalEnd(null);
      setSignalDrawing(true);
    }
  }

  async function toggleFullscreen() {
    if (!chartRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await chartRef.current.requestFullscreen();
    }
  }

  function downloadChart() {
    if (!svgRef.current) return;
    setDownloadError(null);
    const chartComputedStyle = getComputedStyle(chartRef.current ?? document.body);
    const svg = new XMLSerializer()
      .serializeToString(svgRef.current)
      .replaceAll("currentColor", chartComputedStyle.color)
      .replaceAll("var(--card)", chartComputedStyle.backgroundColor)
      .replaceAll(
        "var(--chart-grid)",
        chartComputedStyle.getPropertyValue("--chart-grid").trim(),
      )
      .replaceAll(
        "var(--chart-crosshair)",
        chartComputedStyle.getPropertyValue("--chart-crosshair").trim(),
      )
      .replaceAll(
        "var(--chart-accent)",
        chartComputedStyle.getPropertyValue("--chart-accent").trim(),
      )
      .replaceAll(
        "var(--chart-label-text)",
        chartComputedStyle.getPropertyValue("--chart-label-text").trim(),
      )
      .replaceAll(
        "var(--chart-bg-surface)",
        chartComputedStyle.getPropertyValue("--chart-bg-surface").trim(),
      );
    const sourceUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = WIDTH * 2;
        canvas.height = HEIGHT * 2;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Unable to create an image canvas.");
        context.scale(2, 2);
        context.fillStyle = chartComputedStyle.backgroundColor;
        context.fillRect(0, 0, WIDTH, HEIGHT);
        context.drawImage(image, 0, 0, WIDTH, HEIGHT);
        canvas.toBlob((blob) => {
          if (!blob) {
            setDownloadError("Unable to encode the chart screenshot.");
            return;
          }
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = `${symbol.replace(".", "-")}-chart.png`;
          anchor.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        }, "image/png");
      } catch (cause) {
        console.error("Unable to download chart screenshot.", cause);
        setDownloadError("Unable to download the chart screenshot.");
      } finally {
        URL.revokeObjectURL(sourceUrl);
      }
    };
    image.onerror = (cause) => {
      console.error("Unable to render chart screenshot.", cause);
      setDownloadError("Unable to render the chart screenshot.");
      URL.revokeObjectURL(sourceUrl);
    };
    image.src = sourceUrl;
  }

  const changeBaseline = data[percentScale ? visibleStart : 0];
  const latestCandle = data[data.length - 1];
  const change =
    data.length > 1 && changeBaseline && latestCandle
      ? ((latestCandle.close - changeBaseline.close) / changeBaseline.close) * 100
      : 0;

  return (
    <div className="h-full w-full">
      <section
        ref={chartRef}
        data-chart-theme={chartTheme}
        className={`chart-shell relative flex h-full min-h-0 flex-col overflow-hidden border border-[#292a2d] bg-[#0f0f10] text-[#f6f7f9] ${fullscreen ? "rounded-none" : ""}`}
        aria-label={`${symbolInput} stock chart`}
      >
        <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-1.5 border-b border-[#303135] px-2 py-1.5 sm:px-3">
          <form
            className="flex h-8 shrink-0 items-center gap-1 rounded border border-[#34363a] bg-[#17181a] px-2"
            onSubmit={(event) => {
              event.preventDefault();
              applySymbol();
            }}
          >
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              aria-label="Stock symbol"
              value={symbolInput}
              onChange={(event) => setSymbolInput(event.target.value)}
              className="w-24 bg-transparent py-1 text-sm font-semibold outline-none"
            />
            <select
              aria-label="Exchange"
              value={exchange}
              onChange={(event) =>
                setExchange(event.target.value as "NSE" | "BSE")
              }
              className="bg-transparent text-xs text-[#b8bbc2] outline-none"
            >
              <option value="NSE">NSE</option>
              <option value="BSE">BSE</option>
            </select>
            <button
              type="submit"
              className="rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Load symbol"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          </form>
          <div
            className="flex shrink-0 items-center border-l border-[#34363a] pl-2"
            role="group"
            aria-label="Chart period"
          >
            {(["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y", "All"] as Period[]).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={period === value}
                onClick={() => {
                  setPeriod(value);
                  setSelectedInterval(null);
                }}
                className={`rounded px-2 py-1.5 text-[11px] font-medium sm:px-2.5 sm:text-xs ${
                  period === value
                    ? "bg-[#292b30] text-[#66a3ff]"
                    : "text-[#a6acb5] hover:bg-[#24262a] hover:text-white"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
          <label className="flex h-8 shrink-0 items-center gap-1.5 rounded border border-[#34363a] bg-[#17181a] px-2 text-[10px] text-[#a6acb5]">
            Interval
            <select
              aria-label="Chart interval"
              value={query.interval}
              onChange={(event) =>
                setSelectedInterval(event.target.value as ChartInterval)
              }
              className="max-w-16 bg-transparent text-xs text-[#f6f7f9] outline-none"
            >
              {INTERVAL_OPTIONS[period].map((interval) => (
                <option key={interval} value={interval}>{interval}</option>
              ))}
            </select>
          </label>
          <select
            aria-label="Chart type"
            value={chartStyle}
            onChange={(event) => setChartStyle(event.target.value as ChartStyle)}
            className="h-8 shrink-0 rounded border border-[#34363a] bg-[#17181a] px-2 text-xs"
          >
            {(["Candles", "Bars", "Line", "Area", "Baseline"] as ChartStyle[]).map((style) => (
              <option key={style} value={style}>{style}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowIndicators(true)}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded border border-[#34363a] px-2.5 text-xs text-[#c2c5cb] hover:bg-[#24262a]"
          >
            <Activity className="h-3.5 w-3.5" /> Indicator ({indicators.length})
          </button>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded border border-[#34363a] px-2.5 text-xs text-[#c2c5cb] hover:bg-[#24262a]"
          >
            <Settings2 className="h-3.5 w-3.5" /> Settings
          </button>
          <button
            type="button"
            aria-pressed={percentScale}
            onClick={() => setPercentScale((enabled) => !enabled)}
            className={`inline-flex h-8 shrink-0 items-center rounded border px-2.5 text-xs ${percentScale ? "border-[#66a3ff] text-[#66a3ff]" : "border-[#34363a] text-[#c2c5cb] hover:bg-[#24262a]"}`}
            title="Show percentage change from the first visible bar"
          >
            %
          </button>
          <button
            type="button"
            aria-label={`Switch chart to ${chartTheme === "dark" ? "light" : "dark"} theme`}
            title={`Switch chart to ${chartTheme === "dark" ? "light" : "dark"} theme`}
            onClick={() => {
              const nextTheme = chartTheme === "dark" ? "light" : "dark";
              setChartTheme(nextTheme);
              try {
                localStorage.setItem("fintrack-chart-theme", nextTheme);
              } catch (error) {
                console.error("Unable to save the chart theme preference.", error);
              }
            }}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded border border-[#34363a] px-2.5 text-xs text-[#c2c5cb] hover:bg-[#24262a]"
          >
            {chartTheme === "dark" ? (
              <Sun className="h-3.5 w-3.5" />
            ) : (
              <Moon className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">
              {chartTheme === "dark" ? "Light" : "Dark"}
            </span>
          </button>
          {([
            ["watchlist", "Watchlist", Bookmark],
            ["portfolio", "Portfolio", BriefcaseBusiness],
            ["alerts", "Alerts", Bell],
            ["compare", "Compare / basket", GitCompareArrows],
          ] as const).map(([panel, label, Icon]) => (
            <button
              key={panel}
              type="button"
              aria-label={label}
              aria-pressed={chartPanel === panel}
              title={label}
              onClick={() => setChartPanel((current) => current === panel ? null : panel)}
              className={`inline-flex h-8 shrink-0 items-center gap-1 rounded border px-2 text-xs ${chartPanel === panel ? "border-[#66a3ff] text-[#66a3ff]" : "border-[#34363a] text-[#c2c5cb] hover:bg-[#24262a]"}`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">{label}</span>
            </button>
          ))}
          {chartPanel && (
            <button
              type="button"
              aria-label="Close chart side panel"
              title="Close side panel"
              onClick={() => setChartPanel(null)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-[#a6acb5] hover:bg-[#24262a]"
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
          )}
          {showIndicators && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="presentation" onMouseDown={(event) => {
              if (event.target === event.currentTarget) setShowIndicators(false);
            }}>
              <section role="dialog" aria-modal="true" aria-labelledby="indicator-dialog-title" className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-card shadow-2xl">
                <header className="flex items-start justify-between border-b p-4">
                  <div>
                    <h2 id="indicator-dialog-title" className="font-semibold">Indicators</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Select indicators computed from the chart’s OHLCV history.</p>
                  </div>
                  <button type="button" aria-label="Close indicators" onClick={() => setShowIndicators(false)}><X className="h-4 w-4" /></button>
                </header>
                <div className="flex flex-wrap items-center gap-2 border-b p-3">
                  <label className="flex min-w-56 flex-1 items-center gap-2 rounded-md border px-2.5">
                    <Search className="h-3.5 w-3.5 text-muted-foreground" />
                    <input aria-label="Search indicators" value={indicatorSearch} onChange={(event) => setIndicatorSearch(event.target.value)} placeholder="Search indicators" className="w-full bg-transparent py-2 text-sm outline-none" />
                  </label>
                  {(["All", "Main", "Sub"] as const).map((group) => (
                    <button key={group} type="button" aria-pressed={indicatorGroup === group} onClick={() => setIndicatorGroup(group)} className={`rounded-md px-3 py-2 text-xs ${indicatorGroup === group ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{group}</button>
                  ))}
                </div>
                <div className="grid gap-4 overflow-y-auto p-4 sm:grid-cols-2">
                  {(["Main", "Sub"] as const).map((group) => {
                    const options = INDICATORS.filter((indicator) =>
                      indicator.group === group &&
                      (indicatorGroup === "All" || indicatorGroup === group) &&
                      indicator.label.toLowerCase().includes(indicatorSearch.toLowerCase()),
                    );
                    if (options.length === 0) return null;
                    return (
                      <fieldset key={group} className="space-y-1">
                        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group === "Main" ? "Main indicator" : "Sub indicator"}</legend>
                        {options.map((indicator) => (
                          <label key={indicator.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent">
                            <input type="checkbox" checked={indicators.includes(indicator.id)} onChange={() => toggleIndicator(indicator.id)} />
                            <span>{indicator.label}</span>
                          </label>
                        ))}
                      </fieldset>
                    );
                  })}
                </div>
                <footer className="flex justify-between border-t p-3">
                  <button type="button" onClick={() => setIndicators([])} className="text-xs text-muted-foreground hover:text-foreground">Clear indicators</button>
                  <button type="button" onClick={() => setShowIndicators(false)} className="rounded-md bg-primary px-4 py-2 text-xs text-primary-foreground">Done</button>
                </footer>
              </section>
            </div>
          )}
          {showSettings && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="presentation" onMouseDown={(event) => {
              if (event.target === event.currentTarget) setShowSettings(false);
            }}>
              <section role="dialog" aria-modal="true" aria-labelledby="chart-settings-title" className="w-full max-w-lg rounded-xl border bg-card shadow-2xl">
                <header className="flex items-start justify-between border-b p-4">
                  <div>
                    <h2 id="chart-settings-title" className="font-semibold">Chart settings</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Changes apply to this chart immediately.</p>
                  </div>
                  <button type="button" aria-label="Close settings" onClick={() => setShowSettings(false)}><X className="h-4 w-4" /></button>
                </header>
                <div className="space-y-3 p-4">
                  <label className="flex items-center justify-between gap-4 text-sm">
                    Candlestick type
                    <select aria-label="Candlestick type" value={candleStyle} onChange={(event) => setCandleStyle(event.target.value as "Solid" | "Hollow")} className="rounded border bg-background px-2 py-1 text-xs">
                      <option>Solid</option><option>Hollow</option>
                    </select>
                  </label>
                  <label className="flex items-center justify-between gap-4 text-sm">
                    Price axis type
                    <select aria-label="Price axis type" value={axisType} onChange={(event) => setAxisType(event.target.value as AxisType)} className="rounded border bg-background px-2 py-1 text-xs">
                      <option>Linear</option><option>Logarithmic</option>
                    </select>
                  </label>
                  {[
                    ["Show latest price", showLatestPrice, setShowLatestPrice],
                    ["Show highest and lowest prices", showHighLow, setShowHighLow],
                    ["Show latest indicator values", showLatestIndicator, setShowLatestIndicator],
                    ["Invert axis", invertAxis, setInvertAxis],
                    ["Show grid lines", showGrid, setShowGrid],
                  ].map(([label, checked, setter]) => (
                    <label key={label as string} className="flex items-center justify-between gap-4 text-sm">
                      {label as string}
                      <input type="checkbox" checked={checked as boolean} onChange={(event) => (setter as (value: boolean) => void)(event.target.checked)} />
                    </label>
                  ))}
                </div>
                <footer className="flex justify-between border-t p-3">
                  <button type="button" onClick={() => {
                    setCandleStyle("Solid"); setAxisType("Linear"); setShowLatestPrice(true);
                    setShowHighLow(true); setShowLatestIndicator(true); setInvertAxis(false); setShowGrid(true);
                  }} className="text-xs text-muted-foreground hover:text-foreground">Restore defaults</button>
                  <button type="button" onClick={() => setShowSettings(false)} className="rounded-md bg-primary px-4 py-2 text-xs text-primary-foreground">Done</button>
                </footer>
              </section>
            </div>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button type="button" onClick={downloadChart} className="rounded p-1.5 text-[#a6acb5] hover:bg-[#24262a] hover:text-white" aria-label="Download screenshot" title="Download screenshot"><Download className="h-4 w-4" /></button>
            <button type="button" onClick={() => void toggleFullscreen()} className="rounded p-1.5 text-[#a6acb5] hover:bg-[#24262a] hover:text-white" aria-label={fullscreen ? "Exit full screen" : "Full screen"} title={fullscreen ? "Exit full screen" : "Full screen"}>
              {fullscreen ? <X className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {downloadError && <p role="alert" className="px-3 py-2 text-xs text-destructive">{downloadError}</p>}
        <div className="flex min-h-0 flex-1">
          <div className="relative z-20 flex w-10 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-[#34363a] bg-[#212326] py-1.5 sm:w-11" role="toolbar" aria-label="Drawing tools">
            <button type="button" onClick={() => { setDrawingTool(null); setDrawingLevel(false); setPendingDrawingPoints([]); }} aria-label="Pointer: stop drawing" aria-pressed={!drawingTool && !drawingLevel} className={`flex h-8 w-8 items-center justify-center rounded ${!drawingTool && !drawingLevel ? "bg-[#2e3035] text-[#66a3ff]" : "text-[#a6acb5] hover:bg-[#2b2d31]"}`} title="Pointer"><MousePointer2 className="h-4 w-4" /></button>
            <div className="my-1 flex w-6 items-center justify-center border-t border-[#45474c] pt-1" title="Favorite drawing tools">
              <Star className="h-3 w-3 text-amber-400" />
            </div>
            {FAVORITE_DRAWING_TOOLS.map(({ tool, icon: Icon }) => (
              <button
                key={tool}
                type="button"
                onClick={() => selectDrawingTool(tool)}
                aria-label={`Favorite tool: ${tool}`}
                aria-pressed={drawingTool === tool}
                title={tool}
                className={`flex h-8 w-8 items-center justify-center rounded ${drawingTool === tool ? "bg-[#2e3035] text-[#66a3ff]" : "text-[#a6acb5] hover:bg-[#2b2d31]"}`}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
            <div className="my-1 w-6 border-t border-[#45474c]" />
            {DRAWING_GROUPS.map((group) => {
              const Icon = group.icon;
              return (
                <div key={group.name} className="relative">
                  <button type="button" aria-label={group.name} title={group.name} aria-expanded={openDrawingMenu === group.name} onClick={() => setOpenDrawingMenu((current) => current === group.name ? null : group.name)} className={`flex h-8 w-8 items-center justify-center rounded ${openDrawingMenu === group.name ? "bg-[#2e3035] text-[#66a3ff]" : "text-[#a6acb5] hover:bg-[#2b2d31]"}`}>
                    <Icon className="h-4 w-4" />
                  </button>
                  {openDrawingMenu === group.name && (
                    <div className="absolute left-full top-0 z-30 ml-1 max-h-[70vh] w-52 overflow-y-auto rounded-md border border-[#34363a] bg-[#212326] p-1 text-[#f6f7f9] shadow-xl">
                      <p className="px-2 py-1.5 text-[10px] font-semibold uppercase text-[#9298a2]">{group.name}</p>
                      {group.tools.map((tool) => (
                        <button key={tool} type="button" onClick={() => selectDrawingTool(tool)} className="block w-full rounded px-2 py-2 text-left text-xs hover:bg-[#2b2d31]">{tool}</button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <button type="button" disabled={drawingsLocked} onClick={() => { setDrawingTool(null); setDrawingLevel((active) => !active); }} aria-label="Horizontal level" aria-pressed={drawingLevel} title="Horizontal level" className={`flex h-8 w-8 items-center justify-center rounded disabled:opacity-40 ${drawingLevel ? "bg-[#2e3035] text-[#66a3ff]" : "text-[#a6acb5] hover:bg-[#2b2d31]"}`}><Activity className="h-4 w-4" /></button>
            <button type="button" onClick={() => setMagnetSnapping((enabled) => !enabled)} aria-label={magnetSnapping ? "Disable magnet snapping" : "Enable magnet snapping"} aria-pressed={magnetSnapping} title="Snap drawings to nearest candle OHLC" className={`flex h-8 w-8 items-center justify-center rounded ${magnetSnapping ? "bg-[#2e3035] text-[#66a3ff]" : "text-[#a6acb5] hover:bg-[#2b2d31]"}`}><Magnet className="h-4 w-4" /></button>
            <div className="my-1 w-6 border-t border-[#45474c]" />
            <button type="button" onClick={() => setDrawingsLocked((locked) => !locked)} aria-label={drawingsLocked ? "Unlock drawings" : "Lock all drawings"} title={drawingsLocked ? "Unlock drawings" : "Lock all drawings"} className="flex h-8 w-8 items-center justify-center rounded text-[#a6acb5] hover:bg-[#2b2d31]">{drawingsLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}</button>
            <button type="button" onClick={() => setDrawingsHidden((hidden) => !hidden)} aria-label={drawingsHidden ? "Show all drawings" : "Hide all drawings"} title={drawingsHidden ? "Show all drawings" : "Hide all drawings"} className="flex h-8 w-8 items-center justify-center rounded text-[#a6acb5] hover:bg-[#2b2d31]">{drawingsHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            <button type="button" onClick={() => { setDrawings([]); setHorizontalLevels([]); }} aria-label="Clear all drawings" title="Clear all drawings" className="flex h-8 w-8 items-center justify-center rounded text-[#a6acb5] hover:bg-[#2b2d31] hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
            <div className="mt-auto flex flex-col gap-1">
              <button type="button" onClick={() => zoomChart("in")} aria-label="Zoom in" title="Zoom in" className="flex h-8 w-8 items-center justify-center rounded text-sm text-[#a6acb5] hover:bg-[#2b2d31]">+</button>
              <button type="button" onClick={() => zoomChart("out")} aria-label="Zoom out" title="Zoom out" className="flex h-8 w-8 items-center justify-center rounded text-sm text-[#a6acb5] hover:bg-[#2b2d31]">−</button>
              {visibleRange && <button type="button" onClick={() => { setPanOffsetX(0); setVisibleRange(null); }} aria-label="Reset zoom" title="Reset zoom" className="flex h-8 w-8 items-center justify-center rounded text-[10px] text-[#a6acb5] hover:bg-[#2b2d31]">1:1</button>}
            </div>
          </div>
          <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-[#26272a] px-3 py-2">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-sm font-bold">{symbolInput}</span>
              <span className="text-xs text-[#8b9099]">
                {exchange} · {query.interval}
                {basketSymbols.length > 0 && " · Sum spread"}
                {percentScale && " · % from first visible bar"}
              </span>
              {data.length > 0 && (
                <span className="ml-1 text-[11px] font-semibold tabular-nums text-[#b8bbc2]">
                  {formatPrice(data[data.length - 1].close)}
                  <span className={`ml-1 ${change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                  </span>
                </span>
              )}
            </div>
            {activeCandle && (
              <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-[10px] tabular-nums text-[#a6acb5]">
                <span>
                  {formatDate(activeCandle.timestamp, query.interval)}
                </span>
                <span>O {formatPrice(activeCandle.open)}</span>
                <span>H {formatPrice(activeCandle.high)}</span>
                <span>L {formatPrice(activeCandle.low)}</span>
                <span className="font-semibold text-[#f6f7f9]">
                  C {formatPrice(activeCandle.close)}
                </span>
                {hasVolume && (
                  <span>Vol {formatVolume(activeCandle.volume)}</span>
                )}
              </div>
            )}
          </div>
          {loading ? (
            <div className="flex min-h-80 flex-1 animate-pulse items-center justify-center bg-[#111214] text-sm text-[#9298a2]" role="status">
              Loading chart data…
            </div>
          ) : error ? (
            <div
              className="flex min-h-80 flex-1 flex-col items-center justify-center gap-2 text-sm text-[#9298a2]"
              role="alert"
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setReloadSequence((current) => current + 1)}
                className="text-primary hover:underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className={`flex min-h-0 flex-1 overflow-hidden ${isPanning ? "cursor-grabbing" : drawingTool || drawingLevel || placingAlert ? "cursor-crosshair" : "cursor-grab"}`}>
              <svg
                ref={svgRef}
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                preserveAspectRatio="none"
                className="block h-full min-h-75 w-full touch-none"
                role="img"
                aria-label={`${symbolInput} ${chartStyle.toLowerCase()} chart${percentScale ? " on percentage scale" : ""}`}
                onPointerDown={onChartPointerDown}
                onPointerMove={onChartPointer}
                onPointerLeave={() => { setHoverIndex(null); setHoverY(null); setHoverSnap(null); }}
                onPointerUp={finishChartPan}
                onPointerCancel={(event) => {
                  finishChartPan(event);
                  skipClickRef.current = false;
                }}
                onClick={onChartClick}
                onDoubleClick={(event) => {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  const x = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
                  if (x >= WIDTH - RIGHT) resetPriceScale();
                }}
              >
                <rect width={WIDTH} height={HEIGHT} fill="transparent" />
              {showLatestIndicator && mainIndicatorLines.map((line, index) => {
                const value = line.values[hoverIndex ?? data.length - 1];
                if (value == null) return null;
                return (
                  <text key={`latest-${line.key}`} x={LEFT + index * 138} y={TOP + 12} fill={line.color} fontSize="11">
                    {line.key}: {formatPrice(value)}
                  </text>
                );
              })}
              {[0, 1, 2, 3, 4].map((line) => {
                  const y = TOP + ((priceBottom - TOP) * line) / 4;
                  const value = yToPrice(y);
                  return (
                    <g key={line}>
                      {showGrid && <line x1={LEFT} x2={WIDTH - RIGHT} y1={y} y2={y} stroke="var(--chart-grid)" strokeDasharray="3 4" opacity="0.55" />}
                      <text
                        x={WIDTH - RIGHT + 8}
                        y={y + 4}
                        fill="currentColor"
                        opacity="0.6"
                        fontSize="11"
                      >
                        {formatScaleValue(value)}
                      </text>
                    </g>
                  );
                })}
                {data.map((candle, index) => {
                  if (index < visibleStart || index > visibleEnd) return null;
                  const x = xAt(index);
                  const rising = candle.close >= candle.open;
                  const color = rising ? "#22c55e" : "#ef4444";
                  const bodyTop = yPrice(Math.max(candle.open, candle.close));
                  const bodyBottom = yPrice(
                    Math.min(candle.open, candle.close),
                  );
                  const candleWidth = Math.max(1.5, Math.min(12, step * 0.62));
                  if (chartStyle === "Candles") {
                    return (
                      <g key={candle.timestamp} stroke={color} fill={candleStyle === "Hollow" && rising ? "var(--card)" : color}>
                        <line x1={x} x2={x} y1={yPrice(candle.high)} y2={yPrice(candle.low)} strokeWidth="1" />
                        <rect x={x - candleWidth / 2} y={bodyTop} width={candleWidth} height={Math.max(1, bodyBottom - bodyTop)} strokeWidth="1" />
                      </g>
                    );
                  }
                  if (chartStyle === "Bars") {
                    return (
                      <g key={candle.timestamp} stroke={color} strokeWidth="1.2">
                        <line x1={x} x2={x} y1={yPrice(candle.high)} y2={yPrice(candle.low)} />
                        <line x1={x - candleWidth / 2} x2={x} y1={yPrice(candle.open)} y2={yPrice(candle.open)} />
                        <line x1={x} x2={x + candleWidth / 2} y1={yPrice(candle.close)} y2={yPrice(candle.close)} />
                      </g>
                    );
                  }
                  return null;
                })}
                {(chartStyle === "Line" || chartStyle === "Baseline" || chartStyle === "Area") && (
                  <path
                    d={chartStyle === "Area"
                      ? `${pathFor(data.map((candle) => candle.close))} L${xAt(visibleEnd)},${priceBottom} L${xAt(visibleStart)},${priceBottom} Z`
                      : pathFor(data.map((candle) => candle.close))}
                    fill={chartStyle === "Area" ? "rgba(56,189,248,0.12)" : "none"}
                    stroke={chartStyle === "Baseline" && change < 0 ? "#ef4444" : "#38bdf8"}
                    strokeWidth={chartStyle === "Baseline" ? "1.5" : "2"}
                  />
                )}
                {mainIndicatorLines.map((line) => (
                  <path key={line.key} d={pathFor(line.values)} fill="none" stroke={line.color} strokeWidth="1.5" />
                ))}
                {comparisonLines.map((line) => (
                  <path
                    key={`comparison-${line.symbol}`}
                    d={line.path}
                    fill="none"
                    stroke={line.color}
                    strokeWidth="2"
                    pointerEvents="none"
                  />
                ))}
                {hasVolume &&
                  data.map((candle, index) => {
                    if (index < visibleStart || index > visibleEnd) return null;
                    const x = xAt(index);
                    const candleWidth = Math.max(
                      1.5,
                      Math.min(12, step * 0.62),
                    );
                    const color =
                      candle.close >= candle.open ? "#22c55e" : "#ef4444";
                    return (
                      <rect
                        key={`volume-${candle.timestamp}`}
                        x={x - candleWidth / 2}
                        y={yVolume(candle.volume)}
                        width={candleWidth}
                        height={VOLUME_BOTTOM - yVolume(candle.volume)}
                        fill={color}
                        opacity="0.45"
                      />
                    );
                  })}
                {hasVolume && volumeAverageLines.map((line) => (
                  <path key={`volume-average-${line.period}`} d={line.path} fill="none" stroke={line.color} strokeWidth="1.25" />
                ))}
                {hasVolume && <>
                  <text x={LEFT} y={VOLUME_TOP - 5} fill="#858a93" fontSize="10">VOL (5, 10, 20)</text>
                  {volumeAverageLines.map((line, index) => {
                    const value = getVolumeSma(data, line.period)[hoverIndex ?? data.length - 1];
                    return value == null ? null : (
                      <text key={`volume-label-${line.period}`} x={LEFT + 145 + index * 120} y={VOLUME_TOP - 5} fill={line.color} fontSize="10">
                        MA{line.period}: {formatVolume(value)}
                      </text>
                    );
                  })}
                  <text x={LEFT + 505} y={VOLUME_TOP - 5} fill="#42a989" fontSize="10">
                    VOLUME: {formatVolume((hoverIndex == null ? data[data.length - 1] : data[hoverIndex])?.volume ?? 0)}
                  </text>
                </>}
                {!drawingsHidden && horizontalLevels.map((level, index) => (
                  <g key={`level-${index}`}>
                    <line
                      x1={LEFT}
                      x2={WIDTH - RIGHT}
                      y1={yPrice(level)}
                      y2={yPrice(level)}
                      stroke="#f59e0b"
                      strokeDasharray="5 4"
                    />
                    <text
                      x={WIDTH - RIGHT + 8}
                      y={yPrice(level) - 4}
                      fill="#f59e0b"
                      fontSize="10"
                    >
                      {formatScaleValue(level)}
                    </text>
                  </g>
                ))}
                {!drawingsHidden && chartAlerts
                  .filter((alert) => !alert.triggered && alert.symbol === symbol && (alert.condition === "above" || alert.condition === "below"))
                  .map((alert) => (
                    <g key={`alert-${alert.id}`}>
                      <line
                        x1={LEFT}
                        x2={WIDTH - RIGHT}
                        y1={yPrice(alert.value)}
                        y2={yPrice(alert.value)}
                        stroke="#facc15"
                        strokeDasharray="7 4"
                        strokeWidth="1.5"
                      />
                      <text
                        x={WIDTH - RIGHT + 7}
                        y={yPrice(alert.value) - 4}
                        fill="#facc15"
                        fontSize="9"
                      >
                        Alert {formatScaleValue(alert.value)}
                      </text>
                    </g>
                  ))}
                {showHighLow && data.length > 0 && [
                  { name: "High", value: priceMax, color: "#f97316" },
                  { name: "Low", value: priceMin, color: "#38bdf8" },
                ].map((level) => (
                  <g key={level.name}>
                    <line x1={LEFT} x2={WIDTH - RIGHT} y1={yPrice(level.value)} y2={yPrice(level.value)} stroke={level.color} strokeDasharray="2 5" opacity="0.55" />
                    <text x={WIDTH - RIGHT + 7} y={yPrice(level.value) - 3} fill={level.color} fontSize="9">{level.name} {formatScaleValue(level.value)}</text>
                  </g>
                ))}
                {showLatestPrice && data.length > 0 && (
                  <g>
                    <line x1={LEFT} x2={WIDTH - RIGHT} y1={yPrice(data[data.length - 1].close)} y2={yPrice(data[data.length - 1].close)} stroke="#14b8a6" strokeDasharray="4 4" opacity="0.8" />
                    <rect x={WIDTH - RIGHT + 2} y={yPrice(data[data.length - 1].close) - 9} width={RIGHT - 5} height="18" rx="3" fill="#14b8a6" />
                    <text x={WIDTH - RIGHT + 6} y={yPrice(data[data.length - 1].close) + 4} fill="white" fontSize="9">{formatScaleValue(data[data.length - 1].close)}</text>
                  </g>
                )}
                {!drawingsHidden && drawings.map((drawing) => {
                  const first = drawing.points[0];
                  const second = drawing.points[1] ?? first;
                  if (!first || !data.length) return null;
                  if (drawing.points.every((point) => point.index < visibleStart) || drawing.points.every((point) => point.index > visibleEnd)) return null;
                  const coordinates = drawing.points.map((point) => [xAt(point.index), yPrice(point.price)] as const);
                  const x1 = xAt(first.index);
                  const x2 = xAt(second.index);
                  const y1 = yPrice(first.price);
                  const y2 = yPrice(second.price);
                  const third = drawing.points[2];
                  const x3 = third ? xAt(third.index) : x2;
                  const y3 = third ? yPrice(third.price) : y2;
                  const stroke = drawing.tool === "Price Tag" ? "#f59e0b" : "#38bdf8";
                  if (drawing.tool === "Measure") {
                    const change = second.price - first.price;
                    const isPositive = change >= 0;
                    const measureColor = isPositive ? "#22c55e" : "#ef4444";
                    const labelWidth = 190;
                    const labelX = Math.max(
                      LEFT,
                      Math.min(WIDTH - RIGHT - labelWidth, (x1 + x2) / 2 - labelWidth / 2),
                    );
                    const labelY = Math.max(
                      TOP + 14,
                      Math.min(priceBottom - 4, Math.min(y1, y2) - 8),
                    );
                    return (
                      <g key={drawing.id}>
                        <rect
                          x={Math.min(x1, x2)}
                          y={Math.min(y1, y2)}
                          width={Math.max(1, Math.abs(x2 - x1))}
                          height={Math.max(1, Math.abs(y2 - y1))}
                          fill={isPositive ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)"}
                          stroke={measureColor}
                          strokeDasharray="4 3"
                        />
                        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={measureColor} strokeWidth="1.5" />
                        <circle cx={x1} cy={y1} r="3" fill={measureColor} />
                        <circle cx={x2} cy={y2} r="3" fill={measureColor} />
                        <rect x={labelX} y={labelY - 13} width={labelWidth} height="18" rx="3" fill="var(--chart-bg-surface)" stroke={measureColor} />
                        <text x={labelX + 6} y={labelY} fill={measureColor} fontSize="9">{drawing.text}</text>
                      </g>
                    );
                  }
                  if (drawing.tool === "Rectangle" || drawing.tool === "Gann Box") {
                    return <g key={drawing.id}>
                      <rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.max(1, Math.abs(x2 - x1))} height={Math.max(1, Math.abs(y2 - y1))} fill="rgba(56,189,248,0.08)" stroke={stroke} strokeDasharray={drawing.tool === "Gann Box" ? "4 3" : undefined} />
                      {drawing.tool === "Gann Box" && <>
                        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} opacity="0.7" />
                        <line x1={x1} y1={y2} x2={x2} y2={y1} stroke={stroke} opacity="0.7" />
                        <line x1={(x1 + x2) / 2} y1={Math.min(y1, y2)} x2={(x1 + x2) / 2} y2={Math.max(y1, y2)} stroke={stroke} opacity="0.45" />
                        <line x1={Math.min(x1, x2)} y1={(y1 + y2) / 2} x2={Math.max(x1, x2)} y2={(y1 + y2) / 2} stroke={stroke} opacity="0.45" />
                      </>}
                    </g>;
                  }
                  if (drawing.tool === "Price Channel" || drawing.tool === "Parallel Lines") {
                    if (!third) return null;
                    const parallelEndX = x3 + x2 - x1;
                    const parallelEndY = y3 + y2 - y1;
                    return <g key={drawing.id}>
                      {drawing.tool === "Price Channel" && <polygon points={`${x1},${y1} ${x2},${y2} ${parallelEndX},${parallelEndY} ${x3},${y3}`} fill="rgba(56,189,248,0.08)" stroke="none" />}
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} />
                      <line x1={x3} y1={y3} x2={parallelEndX} y2={parallelEndY} stroke={stroke} />
                    </g>;
                  }
                  if (drawing.tool === "Circle") {
                    return <ellipse key={drawing.id} cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} rx={Math.max(2, Math.abs(x2 - x1) / 2)} ry={Math.max(2, Math.abs(y2 - y1) / 2)} fill="none" stroke={stroke} />;
                  }
                  if (drawing.tool === "Fib Circles") {
                    return <g key={drawing.id}>
                      {[0.25, 0.382, 0.5, 0.618, 0.786, 1].map((ratio) => (
                        <ellipse key={ratio} cx={x1} cy={y1} rx={Math.max(2, Math.abs(x2 - x1) * ratio)} ry={Math.max(2, Math.abs(y2 - y1) * ratio)} fill="none" stroke={stroke} opacity="0.8" />
                      ))}
                    </g>;
                  }
                  if (drawing.tool === "Fib Spiral") {
                    const centerX = (x1 + x2) / 2;
                    const centerY = (y1 + y2) / 2;
                    const radiusX = Math.max(2, Math.abs(x2 - x1) / 2);
                    const radiusY = Math.max(2, Math.abs(y2 - y1) / 2);
                    const points = Array.from({ length: 81 }, (_, index) => {
                      const progress = index / 80;
                      const angle = progress * Math.PI * 4;
                      return `${centerX + Math.cos(angle) * radiusX * progress},${centerY + Math.sin(angle) * radiusY * progress}`;
                    }).join(" ");
                    return <polyline key={drawing.id} points={points} fill="none" stroke={stroke} />;
                  }
                  if (drawing.tool === "Triangle") {
                    if (!third) return null;
                    return <polygon key={drawing.id} points={`${x1},${y1} ${x2},${y2} ${x3},${y3}`} fill="none" stroke={stroke} />;
                  }
                  if (drawing.tool === "Parallelogram") {
                    if (!third) return null;
                    return <polygon key={drawing.id} points={`${x1},${y1} ${x2},${y2} ${x3},${y3} ${x1 + x3 - x2},${y1 + y3 - y2}`} fill="none" stroke={stroke} />;
                  }
                  if (drawing.tool.includes("Wave") || drawing.tool === "ABCD" || drawing.tool === "XABCD" || drawing.tool === "Brush") {
                    const points = coordinates.map(([x, y]) => `${x},${y}`).join(" ");
                    return <polyline key={drawing.id} points={points} fill="none" stroke={stroke} />;
                  }
                  if (drawing.tool === "Speed Resistance Fan") {
                    return <g key={drawing.id}>
                      {[0.382, 0.5, 0.618].map((ratio) => (
                        <g key={ratio}>
                          <line x1={x1} y1={y1} x2={x2} y2={y1 + (y2 - y1) * ratio} stroke={stroke} />
                          <text x={x2 + 3} y={y1 + (y2 - y1) * ratio - 2} fill={stroke} fontSize="8">{(ratio * 100).toFixed(1)}%</text>
                        </g>
                      ))}
                    </g>;
                  }
                  if (drawing.tool.startsWith("Fib")) {
                    const extensionAnchor = drawing.points[2]?.price ?? second.price;
                    return <g key={drawing.id}>
                      {[0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map((ratio) => {
                        const level = drawing.tool === "Fib Extension"
                          ? extensionAnchor + (second.price - first.price) * ratio
                          : first.price + (second.price - first.price) * ratio;
                        return <g key={ratio}><line x1={x1} x2={x2} y1={yPrice(level)} y2={yPrice(level)} stroke={stroke} opacity="0.7" /><text x={x2 + 3} y={yPrice(level) - 2} fill={stroke} fontSize="8">{(ratio * 100).toFixed(1)}%</text></g>;
                      })}
                    </g>;
                  }
                  if (drawing.tool.startsWith("V.")) {
                    const isFullLine = drawing.tool === "V. Straight Line" || drawing.tool === "V. Ray Line";
                    return <line key={drawing.id} x1={x1} x2={x1} y1={isFullLine ? TOP : Math.min(y1, y2)} y2={isFullLine ? priceBottom : Math.max(y1, y2)} stroke={stroke} strokeDasharray={drawing.tool.includes("Ray") ? "5 4" : undefined} />;
                  }
                  if (drawing.tool === "H. Straight Line" || drawing.tool === "H. Ray Line" || drawing.tool === "H. Segment" || drawing.tool === "Price Line") {
                    const isFullLine = drawing.tool === "H. Straight Line" || drawing.tool === "Price Line";
                    const isRay = drawing.tool === "H. Ray Line";
                    return <line key={drawing.id} x1={isFullLine ? LEFT : x1} x2={isFullLine || isRay ? WIDTH - RIGHT : x2} y1={y1} y2={y1} stroke={stroke} strokeDasharray={isRay ? "5 4" : undefined} />;
                  }
                  if (drawing.tool === "Price Tag") {
                    return <g key={drawing.id}>
                      <line x1={x1} x2={WIDTH - RIGHT} y1={y1} y2={y1} stroke={stroke} strokeDasharray="4 4" />
                      <rect x={WIDTH - RIGHT + 2} y={y1 - 9} width={RIGHT - 5} height="18" rx="3" fill={stroke} />
                      <text x={WIDTH - RIGHT + 5} y={y1 + 4} fill="white" fontSize="9">{drawing.text}</text>
                    </g>;
                  }
                  if (drawing.tool === "Annotation") {
                    return <text key={drawing.id} x={x1 + 4} y={y1 - 5} fill={stroke} fontSize="11">{drawing.text}</text>;
                  }
                  if (drawing.tool === "Arrow") {
                    const angle = Math.atan2(y2 - y1, x2 - x1);
                    const arrowX1 = x2 - 10 * Math.cos(angle - Math.PI / 6);
                    const arrowY1 = y2 - 10 * Math.sin(angle - Math.PI / 6);
                    const arrowX2 = x2 - 10 * Math.cos(angle + Math.PI / 6);
                    const arrowY2 = y2 - 10 * Math.sin(angle + Math.PI / 6);
                    return <g key={drawing.id}>
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} />
                      <polygon points={`${x2},${y2} ${arrowX1},${arrowY1} ${arrowX2},${arrowY2}`} fill={stroke} />
                    </g>;
                  }
                  return <g key={drawing.id}>
                    <line
                      x1={drawing.tool === "Extended Line" || (drawing.tool === "Ray" && x2 < x1) ? LEFT : x1}
                      x2={drawing.tool === "Extended Line" || (drawing.tool === "Ray" && x2 >= x1) ? WIDTH - RIGHT : x2}
                      y1={drawing.tool === "Extended Line" || (drawing.tool === "Ray" && x2 < x1) ? y1 + ((drawing.tool === "Extended Line" ? LEFT : LEFT) - x1) * ((y2 - y1) / (x2 - x1 || 1)) : y1}
                      y2={drawing.tool === "Extended Line" || (drawing.tool === "Ray" && x2 >= x1) ? y1 + ((WIDTH - RIGHT) - x1) * ((y2 - y1) / (x2 - x1 || 1)) : y2}
                      stroke={stroke}
                      strokeDasharray={drawing.tool === "Ray" || drawing.tool === "Extended Line" ? "5 4" : undefined}
                    />
                    {drawing.text && <text x={x1 + 5} y={y1 - 5} fill={stroke} fontSize="10">{drawing.text}</text>}
                  </g>;
                })}
                {!drawingsHidden && magicResult && magicTab === "Levels" && supportResistance.map((level) => (
                  <g key={`${level.price}-${level.kind}`}>
                    <line x1={LEFT} x2={WIDTH - RIGHT} y1={yPrice(level.price)} y2={yPrice(level.price)} stroke={level.kind === "Support" ? "#22c55e" : "#ef4444"} strokeDasharray="4 4" opacity="0.8" />
                    <text x={WIDTH - RIGHT + 5} y={yPrice(level.price) - 4} fill={level.kind === "Support" ? "#22c55e" : "#ef4444"} fontSize="9">{level.kind} {formatPrice(level.price)}</text>
                  </g>
                ))}
                {!drawingsHidden && magicResult && selectedHighlight && (
                  <rect x={xAt(Math.max(visibleStart, selectedHighlight.start)) - step / 2} y={TOP} width={Math.max(step, step * (Math.min(visibleEnd, selectedHighlight.end) - Math.max(visibleStart, selectedHighlight.start) + 1))} height={priceBottom - TOP} fill="rgba(59,130,246,0.10)" stroke="#3b82f6" />
                )}
                {!drawingsHidden && magicResult && magicTab === "Base" && showBaseOverlay && visibleWeeklyBases.map((base, index) => {
                  const rawStart = data.findIndex((bar) => bar.timestamp >= base.startTimestamp);
                  const rawEnd = data.findIndex((bar) => bar.timestamp >= base.endTimestamp);
                  if (rawStart < 0 || rawEnd < 0 || rawEnd < visibleStart || rawStart > visibleEnd) return null;
                  const start = Math.max(visibleStart, rawStart);
                  const end = Math.min(visibleEnd, rawEnd);
                  return <g key={`base-overlay-${base.startTimestamp}-${index}`}>
                    <rect x={xAt(start) - step / 2} y={yPrice(base.high)} width={Math.max(step, (end - start + 1) * step)} height={Math.max(1, yPrice(base.low) - yPrice(base.high))} fill="rgba(34,197,94,0.08)" stroke="#22c55e" strokeDasharray="4 3" />
                  </g>;
                })}
                {drawingTool && pendingDrawingPoints.map((point, index) => (
                  <circle key={`${point.index}-${index}`} cx={xAt(point.index)} cy={yPrice(point.price)} r="4" fill="#f59e0b" />
                ))}
                {signalStart && signalEnd && (
                  <g>
                    <line x1={xAt(signalStart.index)} x2={xAt(signalEnd.index)} y1={yPrice(signalStart.price)} y2={yPrice(signalEnd.price)} stroke="#f59e0b" strokeWidth="2" />
                    <text x={xAt(signalEnd.index)} y={yPrice(signalEnd.price) - 8} fill="#f59e0b" fontSize="10">{signalMovePct?.toFixed(2)}%</text>
                  </g>
                )}
                {hoverIndex != null && data[hoverIndex] && (
                  <g pointerEvents="none">
                    <line
                      x1={xAt(hoverIndex)}
                      x2={xAt(hoverIndex)}
                      y1={TOP}
                      y2={hasVolume ? VOLUME_BOTTOM : priceBottom}
                      stroke="currentColor"
                      strokeDasharray="3 4"
                      opacity="0.45"
                    />
                  </g>
                )}
                {hoverIndex != null && hoverY != null && data[hoverIndex] && (
                  <g pointerEvents="none">
                    <line
                      x1={LEFT}
                      x2={WIDTH - RIGHT}
                      y1={hoverY}
                      y2={hoverY}
                      stroke="var(--chart-crosshair)"
                      strokeDasharray="3 4"
                      opacity="0.7"
                    />
                    <rect
                      x={WIDTH - RIGHT}
                      y={hoverY - 10}
                      width={RIGHT}
                      height="20"
                      rx="2"
                      fill="var(--chart-accent)"
                    />
                    <text
                      x={WIDTH - RIGHT + 4}
                      y={hoverY + 4}
                      fill="var(--chart-label-text)"
                      fontSize="10"
                    >
                      {formatScaleValue(yToPrice(hoverY))}
                    </text>
                    <rect
                      x={Math.max(
                        LEFT,
                        Math.min(WIDTH - RIGHT - 76, xAt(hoverIndex) - 38),
                      )}
                      y={HEIGHT - 20}
                      width="76"
                      height="20"
                      rx="2"
                      fill="var(--chart-accent)"
                    />
                    <text
                      x={Math.max(
                        LEFT,
                        Math.min(WIDTH - RIGHT - 76, xAt(hoverIndex) - 38),
                      ) + 38}
                      y={HEIGHT - 6}
                      fill="var(--chart-label-text)"
                      fontSize="10"
                      textAnchor="middle"
                    >
                      {formatDate(data[hoverIndex].timestamp, query.interval)}
                    </text>
                  </g>
                )}
                {hoverSnap && (
                  <g pointerEvents="none">
                    <line
                      x1={LEFT}
                      x2={WIDTH - RIGHT}
                      y1={yPrice(hoverSnap.price)}
                      y2={yPrice(hoverSnap.price)}
                      stroke="#f59e0b"
                      strokeDasharray="3 4"
                      opacity="0.75"
                    />
                    <circle
                      cx={xAt(hoverSnap.index)}
                      cy={yPrice(hoverSnap.price)}
                      r="4"
                      fill="#f59e0b"
                      stroke="#17181a"
                      strokeWidth="1.5"
                    />
                  </g>
                )}
                {Array.from({ length: 6 }, (_, index) => {
                  const candleIndex = Math.min(visibleEnd, Math.floor(visibleStart + (visibleCount - 1) * index / 5));
                  const candle = data[candleIndex];
                  if (!candle) return null;
                  return (
                    <text
                      key={`date-${index}`}
                      x={xAt(candleIndex)}
                      y={HEIGHT - 8}
                      fill="currentColor"
                      opacity="0.55"
                      fontSize="10"
                      textAnchor="middle"
                    >
                      {formatDate(candle.timestamp, query.interval)}
                    </text>
                  );
                })}
                <rect
                  x={WIDTH - RIGHT}
                  y={TOP}
                  width={RIGHT}
                  height={priceBottom - TOP}
                  fill="transparent"
                  className="cursor-ns-resize"
                  aria-label="Drag to pan price scale; scroll to zoom; double-click to reset"
                />
              </svg>
            </div>
          )}
          <div className="flex h-7 shrink-0 flex-wrap items-center gap-4 border-t border-[#292a2d] px-3 text-[10px] text-[#9298a2]">
            <span className={chartStyle === "Candles" ? "text-foreground" : ""}>
              {chartStyle === "Candles" ? `${candleStyle} candles · Green up / red down` : chartStyle}
            </span>
            {mainIndicatorLines.map((line) => <span key={line.key} style={{ color: line.color }}>{line.key}</span>)}
            {comparisonLines.map((line) => <span key={`legend-${line.symbol}`} style={{ color: line.color }}>{symbolLabel(line.symbol)} · % return</span>)}
            {hasVolume && <span>Volume</span>}
            <span className="ml-auto">
            {basketSymbols.length > 0
              ? "Spread: summed OHLC at matching provider timestamps · volume unavailable"
              : "Source: Yahoo Finance · NSE/BSE listed symbols"}
            </span>
          </div>
          {lowerIndicators.length > 0 && (
            <div className="max-h-40 shrink-0 space-y-2 overflow-y-auto border-t border-[#292a2d] p-2">
              {lowerIndicators.map((indicator) => {
                const components = indicatorComponents.get(indicator) ?? [];
                const visibleValues = components.flatMap((component) =>
                  component.values.slice(visibleStart, visibleEnd + 1)
                    .filter((value): value is number => value != null),
                );
                const min = Math.min(0, ...visibleValues);
                const max = Math.max(0, ...visibleValues);
                const label = INDICATORS.find((item) => item.id === indicator)?.label ?? indicator;
                const valueToY = (value: number) =>
                  36 - ((value - min) / (max - min || 1)) * 27;
                const currentIndex = hoverIndex ?? data.length - 1;
                return (
                  <div key={indicator} className="rounded border bg-background/50 px-3 py-2">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{label}</span>
                      <span className="flex flex-wrap justify-end gap-x-2 tabular-nums">
                        {components.map((component) => {
                          const current = component.values[currentIndex];
                          return (
                            <span key={component.name} style={{ color: component.color }}>
                              {component.name}: {current == null ? "—" : current.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                            </span>
                          );
                        })}
                      </span>
                    </div>
                    <svg viewBox={`0 0 ${WIDTH} 44`} className="mt-1 h-10 w-full" aria-label={`${label} indicator panel`}>
                      <line x1={LEFT} x2={WIDTH - RIGHT} y1="9" y2="9" stroke="currentColor" opacity="0.08" />
                      <line x1={LEFT} x2={WIDTH - RIGHT} y1="36" y2="36" stroke="currentColor" opacity="0.08" />
                      {components.map((component) => {
                        const values = component.values.slice(visibleStart, visibleEnd + 1);
                        if (component.style === "histogram") {
                          return values.map((value, index) => {
                            if (value == null) return null;
                            const zeroY = valueToY(0);
                            const valueY = valueToY(value);
                            return (
                              <rect
                                key={`${component.name}-${visibleStart + index}`}
                                x={xAt(visibleStart + index) - Math.max(1, step * 0.3)}
                                y={Math.min(zeroY, valueY)}
                                width={Math.max(1, step * 0.6)}
                                height={Math.max(1, Math.abs(zeroY - valueY))}
                                fill={value >= 0 ? component.color : "#ef4444"}
                                opacity="0.65"
                              />
                            );
                          });
                        }
                        const path = values.map((value, index) => {
                          if (value == null) return "";
                          const x = xAt(visibleStart + index);
                          const y = valueToY(value);
                          return `${index === 0 || values[index - 1] == null ? "M" : "L"}${x},${y}`;
                        }).filter(Boolean).join(" ");
                        return <path key={component.name} d={path} fill="none" stroke={component.color} strokeWidth="1.5" />;
                      })}
                    </svg>
                  </div>
                );
              })}
            </div>
          )}
          <button type="button" onClick={() => setMagicOpen((open) => !open)} className={`absolute bottom-4 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-[#44464b] bg-[#33363b] px-5 py-2.5 text-sm font-semibold text-white shadow-xl hover:bg-[#41444a] ${magicOpen ? "hidden" : ""}`}>
            <Sparkles className="h-4 w-4" /> Magic
          </button>
        </div>
        {magicOpen && (
          <section aria-label="Magic chart analysis" className="absolute bottom-16 left-1/2 z-30 flex max-h-[70dvh] w-[min(760px,calc(100%-4rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-[#45474c] bg-[#1d1e20] text-[#f6f7f9] shadow-2xl">
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#34363a] px-4 py-3">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Magic analysis</h2>
                <p className="mt-1 text-[10px] text-muted-foreground">Transparent OHLCV-based heuristics. Results describe historical patterns, not predictions.</p>
              </div>
              <button type="button" onClick={() => setMagicOpen(false)} aria-label="Close Magic analysis"><X className="h-4 w-4" /></button>
            </header>
            <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[#34363a] px-3 py-2" role="tablist" aria-label="Magic analysis tabs">
              {(["Signals", "Patterns", "Candles", "Levels", "Base"] as MagicTab[]).map((tab) => (
                <button key={tab} type="button" role="tab" aria-selected={magicTab === tab} onClick={() => { setMagicTab(tab); setMagicResult(false); setSelectedHighlight(null); setSignalDrawing(false); }} className={`rounded-md px-3 py-1.5 text-xs ${magicTab === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}>{tab}</button>
              ))}
            </div>
            <div className="min-h-0 space-y-3 overflow-y-auto p-4">
              {magicTab === "Signals" && (
                <>
                  <p className="text-xs text-muted-foreground">Mark two points on the chart to measure price move, elapsed bars and relative volume.</p>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={scanMagicTab} className="rounded-md border px-3 py-2 text-xs hover:bg-accent">{signalDrawing ? "Click two points on chart…" : "Draw a range"}</button>
                    {signalStart && <button type="button" onClick={() => { setSignalStart(null); setSignalEnd(null); setSignalDrawing(false); }} className="text-xs text-muted-foreground hover:text-foreground">Clear measurement</button>}
                  </div>
                  {signalEnd && <div className="grid gap-2 text-xs sm:grid-cols-3">
                    <div className="rounded border p-3">Move <strong className={signalMovePct != null && signalMovePct >= 0 ? "text-emerald-500" : "text-rose-500"}>{signalMovePct?.toFixed(2)}%</strong></div>
                    <div className="rounded border p-3">Duration <strong>{signalBars} bars</strong></div>
                    <div className="rounded border p-3">Relative volume <strong>{signalVolumeMultiple?.toFixed(2)}×</strong></div>
                  </div>}
                </>
              )}
              {magicTab === "Patterns" && (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">Rule-based ranges include rectangles, triangles, and double tops/bottoms.</p>
                    <button type="button" onClick={scanMagicTab} className="rounded-md border px-3 py-2 text-xs hover:bg-accent">{magicResult ? "Re-scan" : "Scan patterns"}</button>
                  </div>
                  {magicResult && <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{patternForDisplay.length} pattern candidates</span>
                    <button type="button" onClick={() => setSelectedHighlight(null)} className="text-xs text-muted-foreground hover:text-foreground">Clear highlights</button>
                  </div>}
                  {magicResult && <ul className="max-h-64 space-y-1 overflow-y-auto">
                    {patternForDisplay.map((pattern, index) => (
                      <li key={`${pattern.name}-${pattern.startIndex}-${index}`}>
                        <button type="button" onClick={() => setSelectedHighlight({ start: pattern.startIndex, end: pattern.endIndex })} className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left hover:bg-accent">
                          <span><strong className="text-xs">{pattern.name}</strong><span className="ml-2 text-[10px] text-muted-foreground">{pattern.bias} · {formatDate(data[pattern.startIndex]?.timestamp ?? 0, query.interval)} – {formatDate(data[pattern.endIndex]?.timestamp ?? 0, query.interval)}</span></span>
                          <span className="text-xs text-primary">Highlight</span>
                        </button>
                      </li>
                    ))}
                    {patternForDisplay.length === 0 && <li className="p-3 text-xs text-muted-foreground">No pattern candidates in the current range.</li>}
                  </ul>}
                </>
              )}
              {magicTab === "Candles" && (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">Scan the last 60 bars for standard single-, double- and triple-candle formations.</p>
                    <button type="button" onClick={scanMagicTab} className="rounded-md border px-3 py-2 text-xs hover:bg-accent">{magicResult ? "Re-scan" : "Scan candlesticks"}</button>
                  </div>
                  {magicResult && <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{candlePatterns.length} formations found</span>
                    <button type="button" onClick={() => setSelectedHighlight(null)} className="text-xs text-muted-foreground hover:text-foreground">Clear highlights</button>
                  </div>}
                  {magicResult && <ul className="max-h-64 space-y-1 overflow-y-auto">
                    {candlePatterns.map((pattern: CandlePattern, index) => (
                      <li key={`${pattern.name}-${pattern.index}-${index}`}>
                        <button type="button" onClick={() => setSelectedHighlight({ start: Math.max(0, pattern.index - pattern.bars + 1), end: pattern.index })} className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left hover:bg-accent">
                          <span><strong className="text-xs">{pattern.name}</strong><span className="ml-2 text-[10px] text-muted-foreground">{formatDate(data[pattern.index]?.timestamp ?? 0, query.interval)} · {pattern.bars} bar{pattern.bars === 1 ? "" : "s"} · {pattern.description}</span></span>
                          <span className={`text-[10px] ${pattern.bias === "Bullish" ? "text-emerald-500" : pattern.bias === "Bearish" ? "text-rose-500" : "text-muted-foreground"}`}>{pattern.bias}</span>
                        </button>
                      </li>
                    ))}
                    {candlePatterns.length === 0 && <li className="p-3 text-xs text-muted-foreground">No matching formations in the last 60 bars.</li>}
                  </ul>}
                </>
              )}
              {magicTab === "Levels" && (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">Cluster swing highs/lows into nearby support and resistance levels.</p>
                    <button type="button" onClick={scanMagicTab} className="rounded-md border px-3 py-2 text-xs hover:bg-accent">{magicResult ? "Re-scan" : "Find support and resistance"}</button>
                  </div>
                  {magicResult && <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{supportResistance.length} levels found</span>
                    <button type="button" onClick={() => setHorizontalLevels([])} className="text-xs text-muted-foreground hover:text-foreground">Clear lines</button>
                  </div>}
                  {magicResult && <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {supportResistance.map((level: PriceLevel) => (
                      <li key={`${level.kind}-${level.price}`}><button type="button" onClick={() => setHorizontalLevels((current) => [...current, level.price])} className="flex w-full items-center justify-between rounded-md border p-3 text-left hover:bg-accent">
                        <span className={`text-xs font-semibold ${level.kind === "Support" ? "text-emerald-500" : "text-rose-500"}`}>{level.kind}</span>
                        <span className="text-xs tabular-nums">{formatPrice(level.price)}</span>
                        <span className="text-[10px] text-muted-foreground">{level.touches} touches</span>
                        <span className="text-[10px] tabular-nums">{level.distancePct >= 0 ? "+" : ""}{level.distancePct.toFixed(1)}%</span>
                      </button></li>
                    ))}
                    {supportResistance.length === 0 && <li className="text-xs text-muted-foreground">No clustered swing levels found for this range.</li>}
                  </ul>}
                </>
              )}
              {magicTab === "Base" && (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">Detect sideways weekly bases and estimate depth, quality and breakout status.</p>
                    <button type="button" onClick={scanMagicTab} className="rounded-md border px-3 py-2 text-xs hover:bg-accent">{magicResult ? "Re-scan" : "Find weekly bases"}</button>
                  </div>
                  <button type="button" aria-expanded={baseFiltersOpen} onClick={() => setBaseFiltersOpen((open) => !open)} className="text-xs text-primary hover:underline">Filters</button>
                  {baseFiltersOpen && <div className="grid gap-3 rounded-md border p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={showBaseOverlay} onChange={(event) => setShowBaseOverlay(event.target.checked)} />Show bases on chart</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={breakoutBasesOnly} onChange={(event) => setBreakoutBasesOnly(event.target.checked)} />Breakout bases only</label>
                    <label className="flex items-center justify-between gap-2">Minimum weeks<input type="number" min="4" max="26" value={baseMinWeeks} onChange={(event) => setBaseMinWeeks(Number(event.target.value))} className="w-16 rounded border bg-background px-2 py-1" /></label>
                    <label className="flex items-center justify-between gap-2">Maximum weeks<input type="number" min="4" max="52" value={baseMaxWeeks} onChange={(event) => setBaseMaxWeeks(Number(event.target.value))} className="w-16 rounded border bg-background px-2 py-1" /></label>
                    <label className="flex items-center justify-between gap-2">Maximum depth<select value={baseMaxDepth} onChange={(event) => setBaseMaxDepth(Number(event.target.value))} className="rounded border bg-background px-2 py-1"><option value={15}>15%</option><option value={20}>20%</option><option value={25}>25%</option></select></label>
                    <label className="flex items-center justify-between gap-2">Minimum quality<select value={minimumBaseQuality} onChange={(event) => setMinimumBaseQuality(event.target.value as "High" | "Medium" | "Low")} className="rounded border bg-background px-2 py-1"><option>High</option><option>Medium</option><option>Low</option></select></label>
                    <label className="flex items-center justify-between gap-2">Breakout buffer %<input type="number" step="0.1" min="0" max="5" value={breakoutBuffer} onChange={(event) => setBreakoutBuffer(Number(event.target.value))} className="w-16 rounded border bg-background px-2 py-1" /></label>
                    <label className="flex items-center justify-between gap-2">Minimum breakout volume<input type="number" step="0.1" min="0" value={minimumBreakoutVolume} onChange={(event) => setMinimumBreakoutVolume(Number(event.target.value))} className="w-16 rounded border bg-background px-2 py-1" /></label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={includeFailedBases} onChange={(event) => setIncludeFailedBases(event.target.checked)} />Include failed/broken bases</label>
                  </div>}
                  {magicResult && <>
                    <p className="text-xs text-muted-foreground">{visibleWeeklyBases.length} bases match filters · {monthlyInterval ? "Choose a daily or weekly interval to analyze weekly bases." : "Weekly data aggregated from available OHLCV bars."}</p>
                    <ul className="max-h-64 space-y-1 overflow-y-auto">
                      {visibleWeeklyBases.map((base: WeeklyBase, index) => {
                        const rawStartIndex = data.findIndex((bar) => bar.timestamp >= base.startTimestamp);
                        const rawEndIndex = data.findIndex((bar) => bar.timestamp >= base.endTimestamp);
                        const startIndex = rawStartIndex < 0 ? 0 : rawStartIndex;
                        const endIndex = rawEndIndex < startIndex ? startIndex : rawEndIndex;
                        return <li key={`${base.startTimestamp}-${index}`}><button type="button" onClick={() => setSelectedHighlight({ start: startIndex, end: endIndex })} className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left hover:bg-accent">
                          <span className="text-xs font-semibold">{base.breakout}</span>
                          <span className="text-[10px] text-muted-foreground">{base.weeks}-week · Depth {base.depthPct.toFixed(1)}% · Quality {base.quality} · Vol {base.breakoutVolumeMultiple.toFixed(1)}×</span>
                          <span className="text-[10px] text-muted-foreground">{formatDate(base.startTimestamp, "1wk")} – {formatDate(base.endTimestamp, "1wk")}</span>
                        </button></li>;
                      })}
                      {visibleWeeklyBases.length === 0 && <li className="p-3 text-xs text-muted-foreground">No weekly bases match these filters.</li>}
                    </ul>
                  </>}
                  {magicResult && monthlyInterval && <p className="text-[10px] text-amber-500">The monthly chart has no weekly bars; switch to a daily or weekly interval for this analysis.</p>}
                </>
              )}
            </div>
          </section>
        )}
        {chartPanel && (
          <aside className="flex w-72 shrink-0 flex-col border-l border-[#34363a] bg-[#17181a] text-[#f6f7f9] sm:w-80" aria-label={`${chartPanel} chart panel`}>
            <header className="flex h-11 shrink-0 items-center justify-between border-b border-[#34363a] px-3">
              <h2 className="text-sm font-semibold capitalize">{chartPanel === "compare" ? "Compare & custom spread" : chartPanel}</h2>
              <button type="button" aria-label="Close chart side panel" onClick={() => setChartPanel(null)} className="rounded p-1 text-[#a6acb5] hover:bg-[#2b2d31]">
                <X className="h-4 w-4" />
              </button>
            </header>
            {chartPanel === "watchlist" && (
              <div className="min-h-0 flex-1 overflow-y-auto">
                {panelLoading && <p className="p-3 text-xs text-[#9298a2]" role="status">Loading watchlist…</p>}
                {panelError && <p className="p-3 text-xs text-rose-400" role="alert">{panelError}</p>}
                {!panelLoading && !panelError && watchlistItems.length === 0 && <p className="p-3 text-xs text-[#9298a2]">Your watchlist is empty.</p>}
                {watchlistItems.map((item) => (
                  <button
                    key={item.symbol}
                    type="button"
                    onClick={() => loadChartSymbol(item.symbol)}
                    className="flex w-full items-center justify-between gap-2 border-b border-[#292a2d] px-3 py-2 text-left hover:bg-[#24262a]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold">{symbolLabel(item.symbol)}</span>
                      {item.shortName && <span className="block truncate text-[10px] text-[#9298a2]">{item.shortName}</span>}
                    </span>
                    <span className="shrink-0 text-right text-[10px] tabular-nums">
                      <span className="block">{item.currentPrice == null ? "—" : formatPrice(item.currentPrice)}</span>
                      <span className={(item.regularMarketChangePercent ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        {item.regularMarketChangePercent == null ? "—" : `${item.regularMarketChangePercent >= 0 ? "+" : ""}${item.regularMarketChangePercent.toFixed(2)}%`}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {chartPanel === "portfolio" && (
              <div className="min-h-0 flex-1 overflow-y-auto">
                {portfolioGroups.length > 0 && (
                  <label className="block border-b border-[#34363a] p-3 text-[10px] text-[#9298a2]">
                    Portfolio
                    <select
                      aria-label="Portfolio"
                      value={selectedPortfolioId ?? ""}
                      onChange={(event) => setSelectedPortfolioId(Number(event.target.value))}
                      className="mt-1 w-full rounded border border-[#34363a] bg-[#212326] px-2 py-1.5 text-xs text-[#f6f7f9]"
                    >
                      {portfolioGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                    </select>
                  </label>
                )}
                {panelLoading && <p className="p-3 text-xs text-[#9298a2]" role="status">Loading portfolio…</p>}
                {panelError && <p className="p-3 text-xs text-rose-400" role="alert">{panelError}</p>}
                {!panelLoading && !panelError && portfolioHoldings.length === 0 && <p className="p-3 text-xs text-[#9298a2]">This portfolio has no holdings.</p>}
                {portfolioHoldings.map((holding) => (
                  <button
                    key={holding.symbol}
                    type="button"
                    onClick={() => loadChartSymbol(holding.symbol)}
                    className="flex w-full items-center justify-between gap-2 border-b border-[#292a2d] px-3 py-2 text-left hover:bg-[#24262a]"
                  >
                    <span>
                      <span className="block text-xs font-semibold">{symbolLabel(holding.symbol)}</span>
                      <span className="block text-[10px] text-[#9298a2]">{holding.quantity} shares</span>
                    </span>
                    <span className="text-right text-[10px] tabular-nums">
                      <span className="block">{holding.currentPrice == null ? "—" : formatPrice(holding.currentPrice)}</span>
                      <span className={(holding.pnlPct ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        {holding.pnlPct == null ? "—" : `${holding.pnlPct >= 0 ? "+" : ""}${holding.pnlPct.toFixed(2)}%`}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {chartPanel === "alerts" && (
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                <div className="space-y-2 rounded border border-[#34363a] p-3">
                  <p className="text-xs font-semibold">Place alert on chart</p>
                  <p className="text-[10px] leading-relaxed text-[#9298a2]">
                    {placingAlert ? "Click a price level on the chart. The alert direction is chosen relative to the latest close." : "Choose a level on the chart, then it will appear here and on the Alerts page."}
                  </p>
                  <textarea
                    aria-label="Chart alert note"
                    value={alertNote}
                    onChange={(event) => setAlertNote(event.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="Why are you setting this alert? (optional)"
                    className="w-full resize-y rounded border border-[#34363a] bg-[#212326] px-2 py-1.5 text-xs outline-none focus:border-[#66a3ff]"
                  />
                  <button
                    type="button"
                    disabled={!storageKey || basketSymbols.length > 0}
                    aria-pressed={placingAlert}
                    onClick={() => {
                      setAlertError("");
                      setPlacingAlert((placing) => !placing);
                    }}
                    className={`w-full rounded px-2 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${placingAlert ? "bg-amber-400 text-black" : "bg-[#2d5c9e] text-white hover:bg-[#376eb8]"}`}
                  >
                    {placingAlert ? "Cancel placement" : "Place price alert"}
                  </button>
                  {basketSymbols.length > 0 && <p className="text-[10px] text-amber-300">Price alerts require a single stock chart.</p>}
                  {!storageKey && <p className="text-[10px] text-amber-300">Sign in to save alerts.</p>}
                  {alertError && <p className="text-[10px] text-rose-400" role="alert">{alertError}</p>}
                </div>
                <div>
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#9298a2]">Active alerts</h3>
                  {chartAlerts.filter((alert) => !alert.triggered).length === 0 && <p className="text-xs text-[#9298a2]">No active alerts.</p>}
                  <ul className="space-y-2">
                    {chartAlerts.filter((alert) => !alert.triggered).map((alert) => (
                      <li key={alert.id} className="rounded border border-[#34363a] p-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-semibold">{symbolLabel(alert.symbol)}</span>
                          <button type="button" onClick={() => removeChartAlert(alert.id)} aria-label={`Remove alert for ${symbolLabel(alert.symbol)}`} className="text-[#9298a2] hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                        <p className="mt-1 text-[10px] text-amber-300">
                          {alert.condition === "above"
                            ? `Price ≥ ${formatPrice(alert.value)}`
                            : alert.condition === "below"
                              ? `Price ≤ ${formatPrice(alert.value)}`
                              : alert.condition === "change_pct_above"
                                ? `Change ≥ ${alert.value}%`
                                : `Change ≤ ${alert.value}%`}
                        </p>
                        {alert.notes && <p className="mt-1 whitespace-pre-wrap text-[10px] text-[#b8bbc2]">{alert.notes}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {chartPanel === "compare" && (
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                <div className="space-y-2">
                  <p className="text-[10px] leading-relaxed text-[#9298a2]">
                      Compared stocks are normalized to percentage change from their first visible close. Add 2–10 symbols to open a sum spread.
                  </p>
                  <form
                    className="flex gap-1"
                    onSubmit={(event) => {
                      event.preventDefault();
                      addComparisonSymbol();
                    }}
                  >
                    <input
                      aria-label="Stock to compare"
                      value={compareInput}
                      onChange={(event) => setCompareInput(event.target.value)}
                      placeholder="Add symbol, e.g. TCS"
                      className="min-w-0 flex-1 rounded border border-[#34363a] bg-[#212326] px-2 py-2 text-xs outline-none focus:border-[#66a3ff]"
                    />
                    <button type="submit" className="rounded bg-[#2d5c9e] px-2 text-xs font-semibold text-white hover:bg-[#376eb8]"><Plus className="h-4 w-4" /></button>
                  </form>
                  {comparisonError && <p className="text-[10px] text-rose-400" role="alert">{comparisonError}</p>}
                  {compareSymbols.length > 0 && <ul className="space-y-1">
                    {compareSymbols.map((item) => {
                      const latestPct = comparisonLines.find((line) => line.symbol === item)?.latestPct;
                      return (
                        <li key={item} className="flex items-center justify-between rounded border border-[#34363a] px-2 py-1.5">
                          <span className="text-xs">{symbolLabel(item)}</span>
                          <span className={`mr-2 text-[10px] tabular-nums ${(latestPct ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {latestPct == null ? "—" : `${latestPct >= 0 ? "+" : ""}${latestPct.toFixed(2)}%`}
                          </span>
                          <button type="button" aria-label={`Remove ${symbolLabel(item)} from comparison`} onClick={() => setCompareSymbols((items) => items.filter((symbolItem) => symbolItem !== item))} className="text-[#9298a2] hover:text-rose-400"><X className="h-3.5 w-3.5" /></button>
                        </li>
                      );
                    })}
                  </ul>}
                  {comparisonData.length < compareSymbols.length && compareSymbols.length > 0 && <p className="text-[10px] text-[#9298a2]" role="status">Loading comparison histories…</p>}
                  <button
                    type="button"
                    onClick={openCustomSpread}
                    disabled={compareSymbols.length < 2}
                    className="w-full rounded border border-[#66a3ff] px-2 py-2 text-xs font-semibold text-[#9bc4ff] hover:bg-[#24262a] disabled:opacity-40"
                  >
                    Open sum spread ({compareSymbols.length} symbols)
                  </button>
                  {basketSymbols.length > 0 && <p className="text-[10px] text-[#9298a2]">Formula: add OHLC values at matching provider timestamps. Intrabar highs/lows can occur at different moments; spread volume is not defined.</p>}
                  {comparisonData.length > 0 && comparisonLines.every((line) => line.path.length === 0) && <p className="text-[10px] text-amber-300">These histories have no matching timestamps in the visible range.</p>}
                </div>
              </div>
            )}
          </aside>
        )}
        </div>
      </section>
    </div>
  );
}
