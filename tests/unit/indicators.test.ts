import { describe, expect, it } from "vitest";
import { atr, bollinger, drawdown, ema, macd, priorHighest, priorLowest, rsi, sma } from "@/domain/indicators";
import { syntheticBars } from "../helpers/bars";

const bars = syntheticBars();
const closes = bars.map((b) => b.close);
const finite = (xs: number[]) => xs.filter(Number.isFinite);

describe("indicators", () => {
  it("sma averages the window and is NaN during warm-up", () => {
    const out = sma([1, 2, 3, 4, 5], 3);
    expect(out[4]).toBeCloseTo(4);
    expect(out.slice(0, 2).every(Number.isNaN)).toBe(true);
  });

  it("ema of a constant is that constant", () => {
    expect(ema(new Array(50).fill(5), 10)[49]).toBeCloseTo(5);
  });

  it("rsi stays within 0-100 and hits the extremes", () => {
    expect(finite(rsi(closes)).every((v) => v >= 0 && v <= 100)).toBe(true);
    const up = Array.from({ length: 59 }, (_, i) => i + 1);
    expect(rsi(up)[58]).toBe(100); // only gains
    const down = Array.from({ length: 59 }, (_, i) => 60 - i);
    expect(rsi(down)[58]).toBeCloseTo(0);
  });

  it("rsi matches the StockCharts worked example (Wilder seed)", () => {
    const series = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
    const out = rsi(series, 14);
    expect(out.slice(0, 14).every(Number.isNaN)).toBe(true);
    expect(out[14]).toBeGreaterThan(70.2);
    expect(out[14]).toBeLessThan(70.8);
  });

  it("macd histogram is the line minus the signal", () => {
    const m = macd(closes);
    m.hist.forEach((h, i) => {
      if (Number.isFinite(h)) expect(h).toBeCloseTo(m.macd[i] - m.signal[i], 10);
    });
    expect(finite(m.hist).length).toBeGreaterThan(400);
  });

  it("bollinger bands bracket the mean", () => {
    const bb = bollinger(closes);
    bb.mid.forEach((mid, i) => {
      if (Number.isFinite(mid)) {
        expect(bb.upper[i]).toBeGreaterThanOrEqual(mid);
        expect(bb.lower[i]).toBeLessThanOrEqual(mid);
      }
    });
  });

  it("atr is positive", () => {
    expect(finite(atr(bars)).every((v) => v > 0)).toBe(true);
  });

  it("priorHighest/priorLowest exclude the current bar", () => {
    expect(priorHighest([1, 5, 2, 3], 2)).toEqual([NaN, NaN, 5, 5]);
    expect(priorLowest([4, 1, 2, 3], 2)).toEqual([NaN, NaN, 1, 1]);
  });

  it("drawdown measures the fall from the running peak", () => {
    const dd = drawdown([100, 120, 90, 130]);
    expect(Math.min(...dd)).toBeCloseTo(-0.25);
    expect(dd[3]).toBe(0);
  });
});
