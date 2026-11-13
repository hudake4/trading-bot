/** Display formatting for YYYY-MM-DD strings and ISO instants. Parsed as UTC so the local zone never shifts a date. */
import { format } from "date-fns";

function parse(date: string): Date {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d); // local midnight of that calendar date, so format() prints the same day
}

export function fmtDate(date: string, pattern = "MMM d, yyyy"): string {
  return format(parse(date), pattern);
}

export const fmtShort = (date: string) => fmtDate(date, "MMM d");

/** "Nov 13, 9:35 AM" in the viewer's local time, for run timestamps. */
export function fmtInstant(iso: string): string {
  return format(new Date(iso), "MMM d, h:mm a");
}
