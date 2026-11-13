/** One daily OHLCV bar. `date` is the New York session date, YYYY-MM-DD. Prices are split/dividend adjusted. */
export interface Bar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** A numeric series aligned to a bar array. NaN means "not available yet" (warm-up). */
export type Series = number[];
