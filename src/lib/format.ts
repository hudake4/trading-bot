import { formatCents } from "@/domain/money";

export function money(cents: number, currency = "USD"): string {
  return formatCents(cents, { currency });
}

/** Signed display with a true minus sign: "+$1,200.00" / "−$1,500.00". */
export function signedMoney(cents: number, currency = "USD"): string {
  const abs = formatCents(Math.abs(cents), { currency });
  if (cents > 0) return `+${abs}`;
  if (cents < 0) return `−${abs}`;
  return abs;
}

/** A fraction as a percentage: 0.034 -> "3.4%". */
export function pct(fraction: number | null | undefined, digits = 1): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** Signed percentage with a true minus sign: "+3.4%" / "−1.2%". */
export function signedPct(fraction: number | null | undefined, digits = 1): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return "—";
  const text = Math.abs(fraction * 100).toFixed(digits);
  if (Number(text) === 0) return `${text}%`;
  return `${fraction > 0 ? "+" : "−"}${text}%`;
}

/** Whole dollars for chart axes and hypothetical backtest equity (never used for real money). */
export function dollars(value: number, digits = 0): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}

/** Basis points as a percentage: 1000 -> "10%", 250 -> "2.5%". */
export function bps(value: number): string {
  return `${Number((value / 100).toFixed(2))}%`;
}
