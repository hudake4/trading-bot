/** Calendar helpers on YYYY-MM-DD strings, computed in UTC so local timezone and DST never shift a date. */

function toUtcMs(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const dt = new Date(toUtcMs(date) + days * 86_400_000);
  return dt.toISOString().slice(0, 10);
}

export function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}
