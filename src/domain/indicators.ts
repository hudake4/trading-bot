/**
 * Technical indicators over plain number arrays. Every function returns an array the same
 * length as its input, with NaN wherever the value is not available yet (warm-up).
 */
import type { Bar, Series } from "./types";

const nanSeries = (n: number): Series => new Array<number>(n).fill(NaN);

export function sma(values: Series, period: number): Series {
  const out = nanSeries(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Exponentially weighted mean seeded with the first value (pandas `ewm(adjust=False)`), with
 * leading NaNs skipped and NaN output until `minPeriods` observations have been seen.
 */
function ewm(values: Series, alpha: number, minPeriods: number): Series {
  const out = nanSeries(values.length);
  let current = NaN;
  let seen = 0;
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    if (Number.isNaN(x)) continue;
    current = seen === 0 ? x : (1 - alpha) * current + alpha * x;
    seen += 1;
    if (seen >= minPeriods) out[i] = current;
  }
  return out;
}

export function ema(values: Series, period: number): Series {
  return ewm(values, 2 / (period + 1), period);
}

/**
 * Wilder's smoothing: seeded with the simple average of the first `period` values,
 * then y = y_prev * (period - 1) / period + x / period. Leading NaNs are skipped.
 */
function wilder(values: Series, period: number): Series {
  const out = nanSeries(values.length);
  let seen = 0;
  let seedSum = 0;
  let current = NaN;
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    if (Number.isNaN(x)) continue;
    seen += 1;
    if (seen < period) {
      seedSum += x;
    } else if (seen === period) {
      current = (seedSum + x) / period;
      out[i] = current;
    } else {
      current = (current * (period - 1) + x) / period;
      out[i] = current;
    }
  }
  return out;
}

/** Wilder's RSI, 0-100. A window with no losses is 100; a perfectly flat window is NaN. */
export function rsi(close: Series, period = 14): Series {
  const gains = nanSeries(close.length);
  const losses = nanSeries(close.length);
  for (let i = 1; i < close.length; i++) {
    const delta = close[i] - close[i - 1];
    gains[i] = Math.max(delta, 0);
    losses[i] = Math.max(-delta, 0);
  }
  const avgGain = wilder(gains, period);
  const avgLoss = wilder(losses, period);
  return close.map((_, i) => {
    const g = avgGain[i];
    const l = avgLoss[i];
    if (Number.isNaN(g) || Number.isNaN(l)) return NaN;
    if (l === 0) return g === 0 ? NaN : 100;
    return 100 - 100 / (1 + g / l);
  });
}

export interface MacdResult {
  macd: Series;
  signal: Series;
  hist: Series;
}

export function macd(close: Series, fast = 12, slow = 26, signal = 9): MacdResult {
  const fastEma = ema(close, fast);
  const slowEma = ema(close, slow);
  const line = close.map((_, i) => fastEma[i] - slowEma[i]);
  const sig = ewm(line, 2 / (signal + 1), signal);
  return { macd: line, signal: sig, hist: line.map((v, i) => v - sig[i]) };
}

export interface BollingerResult {
  mid: Series;
  upper: Series;
  lower: Series;
  pctB: Series;
}

export function bollinger(close: Series, period = 20, numStd = 2): BollingerResult {
  const mid = sma(close, period);
  const upper = nanSeries(close.length);
  const lower = nanSeries(close.length);
  const pctB = nanSeries(close.length);
  for (let i = period - 1; i < close.length; i++) {
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (close[j] - mid[i]) ** 2;
    const std = Math.sqrt(variance / period); // population std, like most charting packages
    upper[i] = mid[i] + numStd * std;
    lower[i] = mid[i] - numStd * std;
    pctB[i] = upper[i] === lower[i] ? NaN : (close[i] - lower[i]) / (upper[i] - lower[i]);
  }
  return { mid, upper, lower, pctB };
}

export function atr(bars: Bar[], period = 14): Series {
  const trueRange = bars.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const prevClose = bars[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - prevClose), Math.abs(b.low - prevClose));
  });
  return wilder(trueRange, period);
}

/** Highest value of the `period` bars BEFORE each bar (the current bar is excluded). */
export function priorHighest(values: Series, period: number): Series {
  const out = nanSeries(values.length);
  for (let i = period; i < values.length; i++) {
    let best = -Infinity;
    for (let j = i - period; j < i; j++) best = Math.max(best, values[j]);
    out[i] = best;
  }
  return out;
}

/** Lowest value of the `period` bars BEFORE each bar (the current bar is excluded). */
export function priorLowest(values: Series, period: number): Series {
  const out = nanSeries(values.length);
  for (let i = period; i < values.length; i++) {
    let best = Infinity;
    for (let j = i - period; j < i; j++) best = Math.min(best, values[j]);
    out[i] = best;
  }
  return out;
}

/** Fractional drawdown from the running peak (<= 0). */
export function drawdown(equity: Series): Series {
  let peak = -Infinity;
  return equity.map((v) => {
    peak = Math.max(peak, v);
    return v / peak - 1;
  });
}

export const last = (series: Series): number => series[series.length - 1];
