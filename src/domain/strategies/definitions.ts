import { macd, priorHighest, priorLowest, rsi, sma } from "../indicators";
import type { StrategyDefinition } from "./types";

const closes = (bars: { close: number }[]) => bars.map((b) => b.close);

export const trend: StrategyDefinition = {
  id: "trend",
  name: "Trend following",
  style: "Trend following",
  summary: "Own the stock while its short-term average is above its long-term average.",
  rules: [
    "Buy when the fast moving average is above the slow one.",
    "Stay out when RSI is above the overbought level, so it doesn't chase a stretched move.",
    "Sell when the fast average drops below the slow one.",
  ],
  character:
    "Works in sustained trends and cuts losses in long declines. Gets whipsawed in sideways markets, and often trails buy-and-hold on strongly rising stocks.",
  params: [
    { key: "fast", label: "Fast average (days)", hint: "Short moving average length.", min: 2, max: 200, step: 1, integer: true },
    { key: "slow", label: "Slow average (days)", hint: "Long moving average length. Must be larger than the fast one.", min: 3, max: 400, step: 1, integer: true },
    { key: "rsiPeriod", label: "RSI period (days)", hint: "Lookback for the overbought check.", min: 2, max: 50, step: 1, integer: true },
    { key: "rsiOverbought", label: "Overbought RSI", hint: "Stay flat at or above this RSI.", min: 50, max: 100, step: 1 },
  ],
  defaults: { fast: 20, slow: 50, rsiPeriod: 14, rsiOverbought: 80 },
  crossCheck: (p) => (p.fast >= p.slow ? "Fast average must be shorter than the slow average." : null),
  warmup: (p) => Math.max(p.slow, p.rsiPeriod * 2),
  signals(bars, p) {
    const c = closes(bars);
    const fast = sma(c, p.fast);
    const slow = sma(c, p.slow);
    const r = rsi(c, p.rsiPeriod);
    return c.map((_, i) => (fast[i] > slow[i] && r[i] < p.rsiOverbought ? 1 : 0));
  },
};

export const momentum: StrategyDefinition = {
  id: "momentum",
  name: "Momentum",
  style: "Momentum",
  summary: "Own the stock while it has been rising over the past several months.",
  rules: [
    "Buy when the return over the lookback window is above the minimum.",
    "Sell when the return over the lookback window falls to or below the minimum.",
  ],
  character:
    "Rides stocks that keep rising and steps aside after a long slide. Slow to react, so it gives back some gains at turning points and can lag in choppy markets.",
  params: [
    { key: "lookback", label: "Lookback (days)", hint: "About 21 trading days per month; 126 is roughly six months.", min: 5, max: 400, step: 1, integer: true },
    { key: "minReturnPct", label: "Minimum return (%)", hint: "Required gain over the lookback. 0 means any gain.", min: -20, max: 50, step: 0.5 },
  ],
  defaults: { lookback: 126, minReturnPct: 0 },
  warmup: (p) => p.lookback + 1,
  signals(bars, p) {
    const c = closes(bars);
    return c.map((v, i) => (i >= p.lookback && v / c[i - p.lookback] - 1 > p.minReturnPct / 100 ? 1 : 0));
  },
};

export const meanrev: StrategyDefinition = {
  id: "meanrev",
  name: "Pullback buyer",
  style: "Mean reversion",
  summary: "Buy sharp dips in stocks that are otherwise in an uptrend, sell the bounce.",
  rules: [
    "Buy when RSI drops below the entry level while the price is still above its long-term average.",
    "Sell when RSI recovers above the exit level, or the price falls below its long-term average.",
  ],
  character:
    "Makes many short trades and is in the market only briefly. Works when dips get bought; suffers when a dip is the start of a real decline, which the long-term average filter only partly guards against.",
  params: [
    { key: "trendPeriod", label: "Trend filter (days)", hint: "Only buy dips while the price is above this average.", min: 20, max: 400, step: 1, integer: true },
    { key: "rsiPeriod", label: "RSI period (days)", hint: "Short periods (2 to 5) react quickly to dips.", min: 2, max: 30, step: 1, integer: true },
    { key: "entryRsi", label: "Buy below RSI", hint: "A lower number waits for a deeper dip.", min: 1, max: 50, step: 1 },
    { key: "exitRsi", label: "Sell above RSI", hint: "Must be higher than the buy level.", min: 20, max: 99, step: 1 },
  ],
  defaults: { trendPeriod: 200, rsiPeriod: 2, entryRsi: 10, exitRsi: 70 },
  crossCheck: (p) => (p.entryRsi >= p.exitRsi ? "The buy RSI must be lower than the sell RSI." : null),
  warmup: (p) => Math.max(p.trendPeriod, p.rsiPeriod * 2),
  signals(bars, p) {
    const c = closes(bars);
    const trendLine = sma(c, p.trendPeriod);
    const r = rsi(c, p.rsiPeriod);
    let held = 0;
    return c.map((v, i) => {
      if (Number.isNaN(trendLine[i]) || Number.isNaN(r[i])) return (held = 0);
      if (held === 0 && v > trendLine[i] && r[i] < p.entryRsi) held = 1;
      else if (held === 1 && (r[i] > p.exitRsi || v < trendLine[i])) held = 0;
      return held;
    });
  },
};

export const breakout: StrategyDefinition = {
  id: "breakout",
  name: "Breakout",
  style: "Breakout",
  summary: "Buy when the price makes a new high, sell when it makes a new low over a shorter window.",
  rules: [
    "Buy when the close is above the highest high of the entry window (not counting today).",
    "Sell when the close is below the lowest low of the exit window (not counting today).",
  ],
  character:
    "Catches big moves early and has few trades. Many breakouts fail and reverse, so expect a low win rate offset by a few large winners.",
  params: [
    { key: "entryPeriod", label: "Entry window (days)", hint: "Breakout above the highest high of this many days.", min: 5, max: 250, step: 1, integer: true },
    { key: "exitPeriod", label: "Exit window (days)", hint: "Exit below the lowest low of this many days.", min: 3, max: 250, step: 1, integer: true },
  ],
  defaults: { entryPeriod: 20, exitPeriod: 10 },
  crossCheck: (p) => (p.exitPeriod > p.entryPeriod ? "The exit window should not be longer than the entry window." : null),
  warmup: (p) => Math.max(p.entryPeriod, p.exitPeriod) + 1,
  signals(bars, p) {
    const c = closes(bars);
    const entryHigh = priorHighest(bars.map((b) => b.high), p.entryPeriod);
    const exitLow = priorLowest(bars.map((b) => b.low), p.exitPeriod);
    let held = 0;
    return c.map((v, i) => {
      if (held === 0 && v > entryHigh[i]) held = 1;
      else if (held === 1 && v < exitLow[i]) held = 0;
      return held;
    });
  },
};

export const macdStrategy: StrategyDefinition = {
  id: "macd",
  name: "MACD crossover",
  style: "Trend following",
  summary: "Own the stock while the MACD line is above its signal line.",
  rules: [
    "Buy when the MACD line crosses above its signal line.",
    "Sell when the MACD line crosses below its signal line.",
  ],
  character:
    "Reacts faster than moving-average crossovers, so it trades more and pays more in costs. Choppy, range-bound markets produce frequent false signals.",
  params: [
    { key: "fast", label: "Fast EMA (days)", hint: "Short exponential average.", min: 2, max: 100, step: 1, integer: true },
    { key: "slow", label: "Slow EMA (days)", hint: "Long exponential average. Must be larger than the fast one.", min: 3, max: 200, step: 1, integer: true },
    { key: "signal", label: "Signal EMA (days)", hint: "Smoothing of the MACD line.", min: 2, max: 50, step: 1, integer: true },
  ],
  defaults: { fast: 12, slow: 26, signal: 9 },
  crossCheck: (p) => (p.fast >= p.slow ? "Fast EMA must be shorter than the slow EMA." : null),
  warmup: (p) => p.slow + p.signal,
  signals(bars, p) {
    const { macd: line, signal } = macd(closes(bars), p.fast, p.slow, p.signal);
    return line.map((v, i) => (v > signal[i] ? 1 : 0));
  },
};

export const buyhold: StrategyDefinition = {
  id: "buyhold",
  name: "Buy and hold",
  style: "Passive",
  summary: "Always own the stock. The baseline every other strategy has to beat.",
  rules: ["Buy at the first opportunity and never sell on a signal.", "The protective stop-loss still applies."],
  character:
    "No timing, no trading costs, and full exposure to drawdowns. Use it as the benchmark: a strategy that can't beat this after costs isn't adding value.",
  params: [],
  defaults: {},
  warmup: () => 1,
  signals: (bars) => bars.map(() => 1),
};
