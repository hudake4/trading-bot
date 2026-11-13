/**
 * Vectorised long/flat backtester.
 *
 * Timing matches how the live bot trades: the signal on the close of day t-1 is acted on at the
 * OPEN of day t. Each position change pays `costBps` of slippage/commission. These are hypothetical
 * results on adjusted prices: no taxes, partial fills or dividends beyond what adjustment includes.
 */
import { drawdown } from "./indicators";
import type { Bar, Series } from "./types";

export const TRADING_DAYS = 252;

export interface BacktestOptions {
  costBps: number;
  initialCapital: number;
}

export interface BacktestMetrics {
  totalReturn: number;
  cagr: number;
  sharpe: number;
  volatility: number;
  maxDrawdown: number;
}

export interface TradeRecord {
  entryDate: string;
  /** null while the trade is still open at the end of the data. */
  exitDate: string | null;
  returnPct: number;
}

export interface BacktestResult {
  dates: string[];
  equity: Series;
  benchmark: Series;
  drawdown: Series;
  /** 1 on days the strategy holds the stock after the open. */
  position: number[];
  trades: TradeRecord[];
  metrics: BacktestMetrics;
  benchmarkMetrics: BacktestMetrics;
  /** Share of round trips with a positive net return; null when there were none. */
  winRate: number | null;
  timeInMarket: number;
}

export function runBacktest(bars: Bar[], signals: number[], options: Partial<BacktestOptions> = {}): BacktestResult {
  const { costBps = 5, initialCapital = 10_000 } = options;
  if (bars.length < 2) throw new Error("Need at least two bars to backtest.");
  if (signals.length !== bars.length) throw new Error("signals must have one entry per bar.");

  const n = bars.length;
  // Position held during day t after the open = yesterday's signal.
  const pos: number[] = signals.map((_, t) => (t === 0 ? 0 : signals[t - 1] === 1 ? 1 : 0));
  const net: number[] = [];
  const buyAndHold: number[] = [];

  for (let t = 0; t < n; t++) {
    const prev = t === 0 ? 0 : pos[t - 1];
    const cur = pos[t];
    const closeToClose = t === 0 ? 0 : bars[t].close / bars[t - 1].close - 1;
    const openToClose = bars[t].close / bars[t].open - 1; // entered at today's open
    const prevCloseToOpen = t === 0 ? 0 : bars[t].open / bars[t - 1].close - 1; // exited at today's open
    const gross = prev * cur * closeToClose + (1 - prev) * cur * openToClose + prev * (1 - cur) * prevCloseToOpen;
    net.push(gross - (Math.abs(cur - prev) * costBps) / 1e4);
    buyAndHold.push(closeToClose);
  }

  const equity = compound(net, initialCapital);
  const trades = collectTrades(bars, pos, net);
  const wins = trades.filter((t) => t.returnPct > 0).length;

  return {
    dates: bars.map((b) => b.date),
    equity,
    benchmark: compound(buyAndHold, initialCapital),
    drawdown: drawdown(equity),
    position: pos,
    trades,
    metrics: metricsOf(net),
    benchmarkMetrics: metricsOf(buyAndHold),
    winRate: trades.length ? wins / trades.length : null,
    timeInMarket: pos.reduce((a, b) => a + b, 0) / n,
  };
}

function compound(returns: number[], initial: number): Series {
  let value = initial;
  return returns.map((r) => (value *= 1 + r));
}

function collectTrades(bars: Bar[], pos: number[], net: number[]): TradeRecord[] {
  const trades: TradeRecord[] = [];
  let open: { entryDate: string; growth: number } | null = null;
  for (let t = 0; t < bars.length; t++) {
    const prev = t === 0 ? 0 : pos[t - 1];
    if (pos[t] === 1 && prev === 0) open = { entryDate: bars[t].date, growth: 1 };
    if (open && (pos[t] === 1 || prev === 1)) open.growth *= 1 + net[t];
    if (open && pos[t] === 0 && prev === 1) {
      trades.push({ entryDate: open.entryDate, exitDate: bars[t].date, returnPct: open.growth - 1 });
      open = null;
    }
  }
  if (open) trades.push({ entryDate: open.entryDate, exitDate: null, returnPct: open.growth - 1 });
  return trades;
}

function metricsOf(returns: number[]): BacktestMetrics {
  const equity = compound(returns, 1);
  const total = equity[equity.length - 1] - 1;
  const years = returns.length / TRADING_DAYS;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.length > 1 ? returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1) : 0;
  const std = Math.sqrt(variance);
  // Drawdown is measured from the starting capital, so an immediate loss counts.
  const maxDrawdown = Math.min(0, ...drawdown([1, ...equity]));
  return {
    totalReturn: total,
    cagr: total <= -1 ? -1 : (1 + total) ** (1 / years) - 1,
    sharpe: std > 0 ? (mean / std) * Math.sqrt(TRADING_DAYS) : 0,
    volatility: std * Math.sqrt(TRADING_DAYS),
    maxDrawdown,
  };
}
