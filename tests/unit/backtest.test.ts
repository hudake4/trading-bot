import { describe, expect, it } from "vitest";
import { runBacktest } from "@/domain/backtest";
import { getStrategy } from "@/domain/strategies";
import type { Bar } from "@/domain/types";
import { syntheticBars, weekdays } from "../helpers/bars";

const bars = syntheticBars();
const flat = (n: number) => new Array<number>(n).fill(0);
const long = (n: number) => new Array<number>(n).fill(1);
const trend = getStrategy("trend");
const trendSignals = trend.signals(bars, trend.defaults);

describe("runBacktest", () => {
  it("an always-flat strategy earns nothing", () => {
    const r = runBacktest(bars, flat(bars.length));
    expect(r.equity[r.equity.length - 1]).toBeCloseTo(10_000);
    expect(r.trades).toHaveLength(0);
    expect(r.winRate).toBeNull();
  });

  it("always-long equals close[-1] / open[1]: it enters at the day-2 open", () => {
    const r = runBacktest(bars, long(bars.length), { costBps: 0 });
    expect(r.equity[r.equity.length - 1] / 10_000).toBeCloseTo(bars[bars.length - 1].close / bars[1].open, 9);
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0].exitDate).toBeNull();
  });

  it("acts on the NEXT open, not the signal bar (no lookahead)", () => {
    const dates = weekdays("2024-01-31", 4);
    const mk = (date: string, open: number, close: number): Bar => ({ date, open, close, high: 120, low: 90, volume: 1 });
    const data = [mk(dates[0], 100, 100), mk(dates[1], 100, 100), mk(dates[2], 110, 110), mk(dates[3], 110, 110)];
    // Signal fires on day 1's close (price 100). Capturing the 100 -> 110 gap would be a lookahead bug.
    const r = runBacktest(data, [0, 1, 1, 1], { costBps: 0 });
    expect(r.equity[3]).toBeCloseTo(10_000);
  });

  it("trading costs reduce returns", () => {
    const free = runBacktest(bars, trendSignals, { costBps: 0 });
    const costly = runBacktest(bars, trendSignals, { costBps: 25 });
    expect(costly.equity[costly.equity.length - 1]).toBeLessThan(free.equity[free.equity.length - 1]);
  });

  it("round-trip returns compound to the total return", () => {
    const r = runBacktest(bars, trendSignals, { costBps: 5 });
    const compounded = r.trades.reduce((acc, t) => acc * (1 + t.returnPct), 1);
    expect(compounded).toBeCloseTo(r.equity[r.equity.length - 1] / 10_000, 9);
    expect(r.metrics.totalReturn).toBeCloseTo(compounded - 1, 9);
  });

  it("reports sensible risk metrics", () => {
    const r = runBacktest(bars, long(bars.length), { costBps: 0 });
    expect(r.metrics.maxDrawdown).toBeLessThanOrEqual(0);
    expect(r.metrics.volatility).toBeGreaterThan(0);
    expect(r.timeInMarket).toBeGreaterThan(0.99);
    expect(r.drawdown).toHaveLength(bars.length);
  });

  it("validates its inputs", () => {
    expect(() => runBacktest(bars.slice(0, 1), [1])).toThrow(/two bars/);
    expect(() => runBacktest(bars, [1, 0])).toThrow(/one entry per bar/);
  });
});
