export interface StockRow {
  symbol: string;
  name: string;
  sector: string;
  exchange: string;
  price: number | null;
  change_pct: number | null;
  volume: number | null;
  pe: number | null;
  forward_pe: number | null;
  pb: number | null;
  market_cap: number | null;
  eps: number | null;
  roe: number | null;
  div_yield: number | null;
  week52_high: number | null;
  week52_low: number | null;
}

type NumericField = Exclude<
  keyof StockRow,
  "symbol" | "name" | "sector" | "exchange"
>;

const FIELD_MAP: Record<string, NumericField> = {
  price: "price", close: "price", ltp: "price",
  change: "change_pct", change_pct: "change_pct", chg: "change_pct",
  volume: "volume", vol: "volume",
  pe: "pe", p_e: "pe", trailing_pe: "pe",
  forward_pe: "forward_pe", fwd_pe: "forward_pe",
  pb: "pb", p_b: "pb", price_book: "pb",
  market_cap: "market_cap", mcap: "market_cap", cap: "market_cap",
  eps: "eps", earnings: "eps",
  roe: "roe", return_on_equity: "roe",
  div_yield: "div_yield", dividend: "div_yield", yield: "div_yield",
  week52_high: "week52_high", high52: "week52_high",
  week52_low: "week52_low", low52: "week52_low",
};

type Operator = "<" | ">" | "<=" | ">=" | "=" | "==" | "!=" | "<>";
type Token =
  | { kind: "field"; value: NumericField }
  | { kind: "number"; value: number }
  | { kind: "operator"; value: Operator }
  | { kind: "and" | "or" | "left" | "right" | "multiply" };

type Value =
  | { kind: "number"; value: number }
  | { kind: "field"; field: NumericField; multiplier: number };

type Expression =
  | { kind: "condition"; field: NumericField; operator: Operator; value: Value }
  | { kind: "and"; left: Expression; right: Expression }
  | { kind: "or"; left: Expression; right: Expression };

const TOKEN_PATTERN =
  /\s*(<=|>=|<>|!=|==|[<>=()]|\*|-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_]\w*)/y;

function tokenize(query: string): Token[] {
  const tokens: Token[] = [];
  let position = 0;

  while (position < query.length) {
    TOKEN_PATTERN.lastIndex = position;
    const match = TOKEN_PATTERN.exec(query);
    if (!match) {
      if (/^\s*$/.test(query.slice(position))) break;
      throw new Error(`Unexpected input near "${query.slice(position, position + 12)}"`);
    }

    position = TOKEN_PATTERN.lastIndex;
    const text = match[1];
    const keyword = text.toLowerCase();
    if (keyword === "and" || keyword === "or") {
      tokens.push({ kind: keyword });
    } else if (text === "(") {
      tokens.push({ kind: "left" });
    } else if (text === ")") {
      tokens.push({ kind: "right" });
    } else if (text === "*") {
      tokens.push({ kind: "multiply" });
    } else if (/^(?:<=|>=|<>|!=|==|<|>|=)$/.test(text)) {
      tokens.push({ kind: "operator", value: text as Operator });
    } else if (/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
      const value = Number(text);
      if (!Number.isFinite(value)) throw new Error(`Invalid number: "${text}"`);
      tokens.push({ kind: "number", value });
    } else {
      const field = FIELD_MAP[keyword];
      if (!field) throw new Error(`Unknown field: "${text}"`);
      tokens.push({ kind: "field", value: field });
    }
  }

  return tokens;
}

function parseExpression(tokens: Token[]): Expression {
  let position = 0;
  const peek = () => tokens[position];
  const consume = () => tokens[position++];

  function parsePrimary(): Expression {
    if (peek()?.kind === "left") {
      consume();
      const expression = parseOr();
      if (consume()?.kind !== "right") throw new Error("Missing closing parenthesis");
      return expression;
    }

    const field = consume();
    if (field?.kind !== "field") throw new Error("Expected a field name");
    const operator = consume();
    if (operator?.kind !== "operator") throw new Error("Expected a comparison operator");

    const value = consume();
    if (value?.kind === "number") {
      return {
        kind: "condition",
        field: field.value,
        operator: operator.value,
        value: { kind: "number", value: value.value },
      };
    }
    if (value?.kind !== "field") throw new Error("Expected a field or number");

    let multiplier = 1;
    if (peek()?.kind === "multiply") {
      consume();
      const factor = consume();
      if (factor?.kind !== "number") throw new Error("Expected a number after *");
      multiplier = factor.value;
    }

    return {
      kind: "condition",
      field: field.value,
      operator: operator.value,
      value: { kind: "field", field: value.value, multiplier },
    };
  }

  function parseAnd(): Expression {
    let expression = parsePrimary();
    while (peek()?.kind === "and") {
      consume();
      expression = { kind: "and", left: expression, right: parsePrimary() };
    }
    return expression;
  }

  function parseOr(): Expression {
    let expression = parseAnd();
    while (peek()?.kind === "or") {
      consume();
      expression = { kind: "or", left: expression, right: parseAnd() };
    }
    return expression;
  }

  const expression = parseOr();
  if (position !== tokens.length) throw new Error("Unexpected token after expression");
  return expression;
}

function evaluate(row: StockRow, expression: Expression): boolean {
  if (expression.kind === "and") {
    return evaluate(row, expression.left) && evaluate(row, expression.right);
  }
  if (expression.kind === "or") {
    return evaluate(row, expression.left) || evaluate(row, expression.right);
  }
  if (expression.kind !== "condition") return false;

  const left = row[expression.field];
  const right =
    expression.value.kind === "number"
      ? expression.value.value
      : (row[expression.value.field] ?? Number.NaN) * expression.value.multiplier;
  if (left == null || !Number.isFinite(left) || !Number.isFinite(right)) return false;

  switch (expression.operator) {
    case "<": return left < right;
    case ">": return left > right;
    case "<=": return left <= right;
    case ">=": return left >= right;
    case "=":
    case "==": return Math.abs(left - right) < 0.0001;
    case "!=":
    case "<>": return Math.abs(left - right) >= 0.0001;
    default: return false;
  }
}

export function applyQuery(
  stocks: StockRow[],
  query: string,
): { results: StockRow[]; error?: string } {
  if (!query.trim()) return { results: stocks };
  try {
    const expression = parseExpression(tokenize(query));
    return { results: stocks.filter((row) => evaluate(row, expression)) };
  } catch (error) {
    return {
      results: [],
      error: error instanceof Error ? error.message : "Invalid query",
    };
  }
}

export const PRESETS = [
  { label: "Value Picks", query: "pe < 15 AND pb < 2 AND roe > 12", desc: "Low P/E, low P/B, decent ROE" },
  { label: "Growth Stocks", query: "roe > 20 AND pe < 40 AND market_cap > 5000", desc: "High ROE, reasonable P/E, mid-large cap" },
  { label: "Dividend Plays", query: "div_yield > 2 AND pe < 25 AND market_cap > 10000", desc: "High dividend yield, large cap" },
  { label: "Blue Chips", query: "market_cap > 50000 AND pe < 30", desc: "Large cap with reasonable valuation" },
  { label: "Small Cap Value", query: "market_cap < 5000 AND pe < 20 AND roe > 10", desc: "Small caps trading cheap" },
  { label: "52W Near High", query: "price > week52_high * 0.9", desc: "Within 10% of 52-week high" },
  { label: "Oversold", query: "change_pct < -3", desc: "Fell more than 3% today" },
  { label: "High Momentum", query: "change_pct > 2 AND volume > 500000", desc: "Up 2%+ with high volume" },
  { label: "Quality F&O Stocks", query: "pe < 30 AND roe > 15 AND market_cap > 20000", desc: "Well-valued F&O eligible stocks" },
];
