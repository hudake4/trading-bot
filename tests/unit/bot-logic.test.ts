import { describe, expect, it } from "vitest";
import { decide, latestSignal, positionSize, stopPriceCents } from "@/domain/bot-logic";
import { getStrategy } from "@/domain/strategies";
import { addDays } from "@/domain/dates";
import { syntheticBars } from "../helpers/bars";

const bars = syntheticBars();
const trend = getStrategy("trend");

describe("decide", () => {
  it.each([
    [1, 0, "BUY"],
    [1, 10, "HOLD"],
    [0, 10, "SELL"],
    [0, 0, "HOLD"],
  ] as const)("signal %i held %i -> %s", (signal, held, expected) => {
    expect(decide(signal, held)).toBe(expected);
  });
});

describe("sizing", () => {
  it("sizes to a share of equity in whole shares", () => {
    expect(positionSize(10_000_000, 25_000, 1000)).toBe(40); // $100k equity, 10%, $250 stock
    expect(positionSize(100_000, 25_000, 1000)).toBe(0); // $1,000 equity can't afford a $250 share at 10%
    expect(positionSize(10_000_000, 0, 1000)).toBe(0);
    expect(positionSize(0, 100, 1000)).toBe(0);
  });

  it("puts the stop below the reference price", () => {
    expect(stopPriceCents(20_000, 500)).toBe(19_000);
    expect(stopPriceCents(1, 9_999)).toBe(1);
  });
});

describe("latestSignal", () => {
  const last = bars[bars.length - 1].date;

  it("ignores today's partial bar", () => {
    const withToday = latestSignal(bars, trend, trend.defaults, last);
    const without = latestSignal(bars.slice(0, -1), trend, trend.defaults, last);
    expect(withToday).toEqual(without);
    expect(withToday.ok && withToday.priceCents).toBe(Math.round(bars[bars.length - 2].close * 100));
  });

  it("rejects short history", () => {
    const r = latestSignal(bars.slice(0, 30), trend, trend.defaults, addDays(bars[29].date, 1));
    expect(r).toMatchObject({ ok: false });
  });

  it("rejects stale data", () => {
    const r = latestSignal(bars, trend, trend.defaults, addDays(last, 30));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/stale/);
  });
});
