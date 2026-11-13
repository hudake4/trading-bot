import { addDays } from "@/domain/dates";
import type { Bar } from "@/domain/types";

/** Small deterministic PRNG (mulberry32) so synthetic markets are reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number) {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

/** Weekday dates ending on `end` (inclusive), oldest first. */
export function weekdays(end: string, count: number): string[] {
  const out: string[] = [];
  let d = end;
  while (out.length < count) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) out.unshift(d);
    d = addDays(d, -1);
  }
  return out;
}

/** Random-walk bars with a mild drift: ~2 years by default. */
export function syntheticBars(opts: { n?: number; seed?: number; drift?: number; vol?: number; end?: string } = {}): Bar[] {
  const { n = 500, seed = 42, drift = 0.0004, vol = 0.012, end = "2025-06-12" } = opts;
  const rand = rng(seed);
  const dates = weekdays(end, n);
  let close = 100;
  return dates.map((date) => {
    const open = close * (1 + gaussian(rand) * 0.003);
    close = close * Math.exp(drift + vol * gaussian(rand));
    const high = Math.max(open, close) * (1 + Math.abs(gaussian(rand)) * 0.004);
    const low = Math.min(open, close) * (1 - Math.abs(gaussian(rand)) * 0.004);
    return { date, open, high, low, close, volume: 1_000_000 };
  });
}

/** Bars from an explicit close series (open = close of the same day, tight high/low). */
export function barsFromCloses(closes: number[], end = "2025-06-12"): Bar[] {
  const dates = weekdays(end, closes.length);
  return closes.map((close, i) => ({ date: dates[i], open: close, high: close * 1.005, low: close * 0.995, close, volume: 1 }));
}
