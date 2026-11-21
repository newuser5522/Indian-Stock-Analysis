export interface PortfolioInput {
  portfolioId: number;
  symbol: string;
  name: string;
  exchange: string;
  quantity: number;
  avgPrice: number;
  purchaseDate: string | null;
  notes: string | null;
}

export interface PortfolioUpdate {
  quantity?: number;
  avgPrice?: number;
  purchaseDate?: string | null;
  notes?: string | null;
}

type ValidationResult<T> = { value: T } | { error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidSymbol(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9.^&=_-]{1,50}$/.test(value.trim())
  );
}

function parseFinitePositiveNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const numericValue = Number(trimmed);
    return Number.isFinite(numericValue) ? numericValue : null;
  }
  return null;
}

function isValidQuantity(value: unknown): value is number {
  const parsed = parseFinitePositiveNumber(value);
  return parsed != null && parsed > 0 && parsed <= 1_000_000_000_000;
}

function isValidPrice(value: unknown): value is number {
  const parsed = parseFinitePositiveNumber(value);
  return parsed != null && parsed > 0 && parsed <= 1_000_000_000;
}

function isValidPurchaseDate(value: unknown): value is string | null {
  if (value === null || value === "") return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return false;
  }
  const todayInIndia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return value <= todayInIndia;
}

function isOptionalText(
  value: unknown,
  maxLength: number,
): value is string | null | undefined {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.length <= maxLength)
  );
}

export function validatePortfolioInput(
  input: unknown,
): ValidationResult<PortfolioInput> {
  if (!isRecord(input)) return { error: "Request body must be an object" };
  const portfolioId = input.portfolioId ?? 1;
  if (
    typeof portfolioId !== "number" ||
    !Number.isSafeInteger(portfolioId) ||
    portfolioId < 1
  ) {
    return { error: "portfolioId must be a positive integer" };
  }
  if (!isValidSymbol(input.symbol)) {
    return { error: "symbol must be a valid stock symbol" };
  }
  if (!isValidQuantity(input.quantity)) {
    return { error: "quantity must be positive and no greater than 1,000,000,000,000" };
  }
  if (!isValidPrice(input.avgPrice)) {
    return { error: "avgPrice must be positive and no greater than 1,000,000,000" };
  }
  if (!isOptionalText(input.name, 120)) {
    return { error: "name must be 120 characters or fewer" };
  }
  if (!isOptionalText(input.exchange, 30)) {
    return { error: "exchange must be 30 characters or fewer" };
  }
  if (!isValidPurchaseDate(input.purchaseDate ?? null)) {
    return { error: "purchaseDate must be a valid YYYY-MM-DD date or null" };
  }
  const purchaseDate = input.purchaseDate;
  if (!isOptionalText(input.notes, 2000)) {
    return { error: "notes must be 2000 characters or fewer" };
  }
  const notes = input.notes;

  const symbol = input.symbol.trim().toUpperCase();
  const normalizedQuantity = parseFinitePositiveNumber(input.quantity) ?? 0;
  const normalizedAvgPrice = parseFinitePositiveNumber(input.avgPrice) ?? 0;
  const normalizedPurchaseDate = purchaseDate === "" ? null : typeof purchaseDate === "string" ? purchaseDate : null;
  return {
    value: {
      portfolioId,
      symbol,
      name: typeof input.name === "string" ? input.name.trim() || symbol : symbol,
      exchange:
        typeof input.exchange === "string" ? input.exchange.trim() || "NSE" : "NSE",
      quantity: normalizedQuantity,
      avgPrice: normalizedAvgPrice,
      purchaseDate: normalizedPurchaseDate,
      notes: typeof notes === "string" ? notes : null,
    },
  };
}

export function validatePortfolioUpdate(
  input: unknown,
): ValidationResult<PortfolioUpdate> {
  if (!isRecord(input)) return { error: "Request body must be an object" };
  const allowedFields = new Set(["quantity", "avgPrice", "purchaseDate", "notes"]);
  const fields = Object.keys(input);
  if (fields.length === 0 || fields.some((field) => !allowedFields.has(field))) {
    return { error: "Provide only quantity, avgPrice, purchaseDate, or notes" };
  }

  const update: PortfolioUpdate = {};
  if ("quantity" in input) {
    const parsed = parseFinitePositiveNumber(input.quantity);
    if (parsed == null || parsed <= 0 || parsed > 1_000_000_000_000) {
      return { error: "quantity must be positive and no greater than 1,000,000,000,000" };
    }
    update.quantity = parsed;
  }
  if ("avgPrice" in input) {
    const parsed = parseFinitePositiveNumber(input.avgPrice);
    if (parsed == null || parsed <= 0 || parsed > 1_000_000_000) {
      return { error: "avgPrice must be positive and no greater than 1,000,000,000" };
    }
    update.avgPrice = parsed;
  }
  if ("purchaseDate" in input) {
    const purchaseDateValue = input.purchaseDate;
    if (purchaseDateValue !== null && purchaseDateValue !== undefined && purchaseDateValue !== "" && !isValidPurchaseDate(purchaseDateValue)) {
      return { error: "purchaseDate must be a valid YYYY-MM-DD date or null" };
    }
    update.purchaseDate = purchaseDateValue === "" ? null : purchaseDateValue ?? null;
  }
  if ("notes" in input) {
    if (!isOptionalText(input.notes, 2000)) {
      return { error: "notes must be 2000 characters or fewer" };
    }
    update.notes = input.notes === "" ? null : input.notes ?? null;
  }
  return { value: update };
}

export function parsePortfolioId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}
