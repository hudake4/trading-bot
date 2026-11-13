import { describe, expect, it } from "vitest";
import { getStrategy, resolveParams, STRATEGIES, validateParams } from "@/domain/strategies";
import { barsFromCloses, syntheticBars } from "../helpers/bars";

const bars = syntheticBars();

describe.each(STRATEGIES.map((s) => [s.id, s] as const))("strategy %s", (_id, def) => {
  it("produces binary signals, one per bar", () => {
    const sig = def.signals(bars, def.defaults);
    expect(sig).toHaveLength(bars.length);
    expect(sig.every((v) => v === 0 || v === 1)).toBe(true);
  });

  it("is causal: adding later bars never changes earlier signals", () => {
    const full = def.signals(bars, def.defaults);
    for (const cut of [120, 250, 400]) {
      expect(def.signals(bars.slice(0, cut), def.defaults)).toEqual(full.slice(0, cut));
    }
  });

  it("has valid defaults", () => {
    expect(validateParams(def, def.defaults).errors).toEqual({});
    expect(def.warmup(def.defaults)).toBeGreaterThan(0);
  });
});

describe("strategy behaviour", () => {
  it("trend stays flat through warm-up", () => {
    const sig = getStrategy("trend").signals(bars, getStrategy("trend").defaults);
    expect(sig.slice(0, 49).every((v) => v === 0)).toBe(true);
  });

  it("buy and hold is always long", () => {
    expect(getStrategy("buyhold").signals(bars, {}).every((v) => v === 1)).toBe(true);
  });

  it("breakout enters on a new high and exits on a new low", () => {
    const def = getStrategy("breakout");
    const params = { entryPeriod: 5, exitPeriod: 3 };
    const flat = Array(10).fill(100);
    const closes = [...flat, 110, 112, 114, 116, 90, 91];
    const sig = def.signals(barsFromCloses(closes), params);
    expect(sig[9]).toBe(0);
    expect(sig[10]).toBe(1); // 110 > prior 5-day high (~100.5)
    expect(sig[13]).toBe(1);
    expect(sig[14]).toBe(0); // 90 < prior 3-day low
  });

  it("pullback buyer buys a dip in an uptrend and sells the bounce", () => {
    const def = getStrategy("meanrev");
    const params = { trendPeriod: 20, rsiPeriod: 2, entryRsi: 20, exitRsi: 70 };
    const rise = Array.from({ length: 40 }, (_, i) => 100 + i * 0.5 + (i % 2));
    const top = rise[39];
    // Two down days: RSI(2) falls below 20 while the price is still above its 20-day average.
    const sig = def.signals(barsFromCloses([...rise, top - 1, top - 3, top - 1, top + 2, top + 4]), params);
    expect(sig[39]).toBe(0);
    expect(sig[41]).toBe(1); // bought the dip
    expect(sig[43]).toBe(0); // RSI recovered above the exit level, still above the average: sold the bounce
  });

  it("momentum is long after a sustained rise and flat after a sustained fall", () => {
    const def = getStrategy("momentum");
    const params = { lookback: 20, minReturnPct: 0 };
    const up = def.signals(barsFromCloses(Array.from({ length: 40 }, (_, i) => 100 + i)), params);
    const down = def.signals(barsFromCloses(Array.from({ length: 40 }, (_, i) => 140 - i)), params);
    expect(up[39]).toBe(1);
    expect(down[39]).toBe(0);
  });
});

describe("parameter validation", () => {
  const trend = getStrategy("trend");

  it("rejects fast >= slow", () => {
    expect(validateParams(trend, { ...trend.defaults, fast: 60 }).errors._root).toMatch(/shorter/);
  });

  it("rejects out-of-range, non-integer and non-numeric values", () => {
    expect(validateParams(trend, { ...trend.defaults, slow: 9999 }).errors.slow).toMatch(/between/);
    expect(validateParams(trend, { ...trend.defaults, fast: 2.5 }).errors.fast).toMatch(/whole/);
    expect(validateParams(trend, { ...trend.defaults, rsiPeriod: "x" }).errors.rsiPeriod).toMatch(/number/);
  });

  it("fills missing keys from defaults and drops unknown ones", () => {
    const { params, errors } = validateParams(trend, { fast: 10, bogus: 1 });
    expect(errors).toEqual({});
    expect(params).toEqual({ ...trend.defaults, fast: 10 });
  });

  it("resolveParams falls back to defaults when saved values are invalid", () => {
    expect(resolveParams(trend, { fast: 100, slow: 50 })).toEqual(trend.defaults);
    expect(resolveParams(trend, null)).toEqual(trend.defaults);
  });

  it("getStrategy throws for an unknown id", () => {
    expect(() => getStrategy("nope")).toThrow(/Unknown strategy/);
  });
});
