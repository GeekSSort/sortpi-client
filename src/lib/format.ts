/**
 * Money and percentage formatting, in one place — the dashboard was putting a
 * raw float into JSX and rendering "22.050362033542203%". Money arrives as a
 * decimal string, so every helper accepts a string or a number.
 */

const CURRENCY = "৳";

function num(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** One decimal, and no false precision: a whole number stays "25%". */
export function formatPercent(value: unknown, decimals = 1): string {
  const n = num(value);
  const rounded = Number(n.toFixed(decimals));
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(decimals)}%`;
}

/** Full amount, grouped the way Bangladesh and India read numbers: 1,53,907. */
export function formatMoney(value: unknown, opts?: { decimals?: number }): string {
  const n = num(value);
  const decimals = opts?.decimals ?? (Number.isInteger(n) ? 0 : 2);
  return `${CURRENCY} ${n.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * A short amount for a card. Lakh and crore, because that is how the figure is
 * said here; under a lakh it stays in full — ৳ 45,824, not "৳ 45.8K".
 */
export function formatMoneyCompact(value: unknown): string {
  const n = num(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";

  if (abs >= 10_000_000) return `${sign}${CURRENCY} ${trim(abs / 10_000_000)} Cr`;
  if (abs >= 100_000) return `${sign}${CURRENCY} ${trim(abs / 100_000)} L`;
  return formatMoney(n);
}

/** Two decimals at most, and none when the value is round. */
function trim(n: number): string {
  const rounded = Number(n.toFixed(2));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/** A plain count: 1,240 — grouped, never in exponent form. */
export function formatCount(value: unknown): string {
  return Math.round(num(value)).toLocaleString("en-IN");
}
