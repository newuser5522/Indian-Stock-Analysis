export interface PortfolioCagrInput {
  invested: number;
  currentValue: number | null;
  purchaseDate: string | null;
}

const DAYS_PER_YEAR = 365.25;

export function calculatePortfolioCagr(
  holdings: PortfolioCagrInput[],
  asOf = new Date(),
): number | null {
  if (holdings.length === 0 || !Number.isFinite(asOf.getTime())) return null;

  const endTime = asOf.getTime();
  const flows = holdings.map((holding) => {
    if (
      holding.purchaseDate == null ||
      !Number.isFinite(holding.invested) ||
      holding.invested <= 0 ||
      holding.currentValue == null ||
      !Number.isFinite(holding.currentValue) ||
      holding.currentValue <= 0
    ) {
      return null;
    }
    const time = new Date(`${holding.purchaseDate.slice(0, 10)}T00:00:00.000Z`).getTime();
    if (!Number.isFinite(time) || time >= endTime) return null;
    return { time, amount: -holding.invested };
  });
  if (flows.some((flow) => flow == null)) return null;

  const cashFlows = flows.filter((flow): flow is { time: number; amount: number } => flow != null);
  const terminalValue = holdings.reduce(
    (total, holding) => total + (holding.currentValue ?? 0),
    0,
  );
  const startTime = Math.min(...cashFlows.map((flow) => flow.time));
  const yearsToEnd = (endTime - startTime) / (DAYS_PER_YEAR * 24 * 60 * 60 * 1000);
  if (yearsToEnd <= 0.01 || terminalValue <= 0) return null;

  const netPresentValue = (rate: number) => {
    const base = 1 + rate;
    const investedValue = cashFlows.reduce((total, flow) => {
      const years = (flow.time - startTime) / (DAYS_PER_YEAR * 24 * 60 * 60 * 1000);
      return total + flow.amount / Math.pow(base, years);
    }, 0);
    return investedValue + terminalValue / Math.pow(base, yearsToEnd);
  };

  let low = -0.9999;
  let high = 1;
  while (high < 1_000_000 && netPresentValue(high) > 0) high = high * 2 + 1;
  if (netPresentValue(low) < 0 || netPresentValue(high) > 0) return null;

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const midpoint = (low + high) / 2;
    if (netPresentValue(midpoint) > 0) low = midpoint;
    else high = midpoint;
  }
  const rate = ((low + high) / 2) * 100;
  return Number.isFinite(rate) ? rate : null;
}
