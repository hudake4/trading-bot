/**
 * Technical snapshot and chart series for one symbol. The trend/MACD/Bollinger readings use the
 * standard textbook settings (SMA 20/50, MACD 12-26-9, Bollinger 20/2) so symbols compare on equal
 * terms; the strategy signal comes from whichever strategy the caller passes in.
 */
import { yearOf } from "./dates";
import { atr, bollinger, drawdown, last, macd, rsi, sma } from "./indicators";
import { TRADING_DAYS } from "./backtest";
import type { Bar } from "./types";

export interface Snapshot {
  last: number;
  asOf: string;
  ret1m: number | null;
  ret3m: number | null;
  retYtd: number | null;
  /** Annualised standard deviation of daily returns. */
  volatility: number;
  maxDrawdown: number;
  rsi: number;
  trend: "up" | "down";
  macd: "bullish" | "bearish";
  pctB: number;
  atrPct: number;
  /** The strategy's current target: 1 = long, 0 = flat. */
  signal: 0 | 1;
}

const orNull = (v: number): number | null => (Number.isFinite(v) ? v : null);

export function snapshot(bars: Bar[], signals: number[]): Snapshot {
  if (bars.length < 2) throw new Error("Need at least two bars for a snapshot.");
  const closes = bars.map((b) => b.close);
  const latest = bars[bars.length - 1];
  const trailing = (days: number) => (closes.length > days ? latest.close / closes[closes.length - 1 - days] - 1 : null);

  const yearStart = bars.find((b) => yearOf(b.date) === yearOf(latest.date));
  const dailyReturns = closes.slice(1).map((c, i) => c / closes[i] - 1);
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((a, r) => a + (r - mean) ** 2, 0) / Math.max(dailyReturns.length - 1, 1);

  return {
    last: latest.close,
    asOf: latest.date,
    ret1m: trailing(21),
    ret3m: trailing(63),
    retYtd: yearStart && yearStart !== latest ? latest.close / yearStart.close - 1 : null,
    volatility: Math.sqrt(variance) * Math.sqrt(TRADING_DAYS),
    maxDrawdown: Math.min(...drawdown(closes)),
    rsi: last(rsi(closes)),
    trend: last(sma(closes, 20)) > last(sma(closes, 50)) ? "up" : "down",
    macd: last(macd(closes).hist) > 0 ? "bullish" : "bearish",
    pctB: last(bollinger(closes).pctB),
    atrPct: last(atr(bars)) / latest.close,
    signal: signals[signals.length - 1] === 1 ? 1 : 0,
  };
}

export interface ChartRow {
  date: string;
  close: number;
  sma20: number | null;
  sma50: number | null;
  bbUpper: number | null;
  bbLower: number | null;
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  /** 1 while the strategy wants to be long at this bar's close. */
  signal: number;
}

export function chartRows(bars: Bar[], signals: number[]): ChartRow[] {
  const closes = bars.map((b) => b.close);
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const bb = bollinger(closes);
  const r = rsi(closes);
  const m = macd(closes);
  return bars.map((b, i) => ({
    date: b.date,
    close: b.close,
    sma20: orNull(s20[i]),
    sma50: orNull(s50[i]),
    bbUpper: orNull(bb.upper[i]),
    bbLower: orNull(bb.lower[i]),
    rsi: orNull(r[i]),
    macd: orNull(m.macd[i]),
    macdSignal: orNull(m.signal[i]),
    macdHist: orNull(m.hist[i]),
    signal: signals[i],
  }));
}
