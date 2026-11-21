export type StockAlertCondition =
  | "above"
  | "below"
  | "change_pct_above"
  | "change_pct_below";

export interface StockAlert {
  id: string;
  symbol: string;
  condition: StockAlertCondition;
  value: number;
  notes?: string;
  createdAt: string;
  triggered: boolean;
  triggeredAt?: string;
}

export interface StockAlertQuote {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  shortName?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCondition(value: unknown): value is StockAlertCondition {
  return value === "above" ||
    value === "below" ||
    value === "change_pct_above" ||
    value === "change_pct_below";
}

export function loadStockAlerts(storageKey: string): StockAlert[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is StockAlert => {
      if (!isRecord(item)) return false;
      return typeof item.id === "string" &&
        typeof item.symbol === "string" &&
        isCondition(item.condition) &&
        typeof item.value === "number" &&
        Number.isFinite(item.value) &&
        typeof item.createdAt === "string" &&
        typeof item.triggered === "boolean" &&
        (item.notes == null || typeof item.notes === "string") &&
        (item.triggeredAt == null || typeof item.triggeredAt === "string");
    });
  } catch {
    return [];
  }
}

export function saveStockAlerts(storageKey: string, alerts: StockAlert[]) {
  localStorage.setItem(storageKey, JSON.stringify(alerts));
}

export function isStockAlertTriggered(
  alert: StockAlert,
  quote: StockAlertQuote,
): boolean {
  const price = quote.regularMarketPrice;
  const changePct = quote.regularMarketChangePercent;
  if (price == null || !Number.isFinite(price) || price <= 0) return false;
  switch (alert.condition) {
    case "above":
      return price >= alert.value;
    case "below":
      return price <= alert.value;
    case "change_pct_above":
      return changePct != null && Number.isFinite(changePct) && changePct >= alert.value;
    case "change_pct_below":
      return changePct != null && Number.isFinite(changePct) && changePct <= alert.value;
    default:
      return false;
  }
}
