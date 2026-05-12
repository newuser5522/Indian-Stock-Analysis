export function formatPrice(value: number | undefined | null): string {
  if (value == null) return "—";
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatChange(value: number | undefined | null): string {
  if (value == null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

export function formatChangePercent(value: number | undefined | null): string {
  if (value == null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatMarketCap(crores: number | undefined | null): string {
  if (crores == null) return "—";
  if (crores >= 100000) return `₹${(crores / 100000).toFixed(2)}L Cr`;
  if (crores >= 1000) return `₹${(crores / 1000).toFixed(2)}K Cr`;
  return `₹${crores.toFixed(0)} Cr`;
}

export function formatVolume(value: number | undefined | null): string {
  if (value == null) return "—";
  if (value >= 1e7) return `${(value / 1e7).toFixed(2)} Cr`;
  if (value >= 1e5) return `${(value / 1e5).toFixed(2)} L`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toString();
}

export function formatPercent(value: number | undefined | null, decimals = 2): string {
  if (value == null) return "—";
  return `${value.toFixed(decimals)}%`;
}

export function formatRatio(value: number | undefined | null, decimals = 2): string {
  if (value == null) return "—";
  return value.toFixed(decimals);
}

export function displaySymbol(symbol: string): string {
  return symbol.replace(".NS", "").replace(".BO", "");
}

export function stripSymbolSuffix(symbol: string): string {
  return symbol.replace(/\.(NS|BO)$/i, "");
}

export function changeColor(value: number | undefined | null): string {
  if (value == null) return "text-muted-foreground";
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-red-400";
  return "text-muted-foreground";
}

export function changeBg(value: number | undefined | null): string {
  if (value == null) return "bg-muted/40 text-muted-foreground";
  if (value > 0) return "bg-emerald-500/10 text-emerald-400";
  if (value < 0) return "bg-red-500/10 text-red-400";
  return "bg-muted/40 text-muted-foreground";
}
