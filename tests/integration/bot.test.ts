import { beforeEach, describe, expect, it } from "vitest";
import { getStrategy } from "@/domain/strategies";
import { runCycle } from "@/server/bot";
import { saveSettings } from "@/server/repositories/settings";
import { createSymbol } from "@/server/repositories/symbols";
import { listRuns } from "@/server/repositories/runs";
import { FakeBroker, trendBars } from "../helpers/fake-broker";

const UP = trendBars(0.004);
const DOWN = trendBars(-0.004);

async function watch(...symbols: string[]) {
  for (const symbol of symbols) await createSymbol({ symbol, strategyId: null });
}

/** Live (not dry) settings: the tests that check orders need dry run off. */
beforeEach(async () => {
  await saveSettings({ dryRun: false });
});

const run = (broker: FakeBroker, dryRun?: boolean) => runCycle({ broker, trigger: "MANUAL", dryRun });
const lastPrice = (bars: typeof UP) => Math.round(bars[bars.length - 1].close * 100);

it("fixture sanity: UP is long and DOWN is flat under the default trend strategy", () => {
  const trend = getStrategy("trend");
  expect(trend.signals(UP, trend.defaults).at(-1)).toBe(1);
  expect(trend.signals(DOWN, trend.defaults).at(-1)).toBe(0);
});

describe("bot cycle", () => {
  it("buys an uptrend, sized to 10% of equity, with a 5% stop", async () => {
    await watch("UP");
    const broker = new FakeBroker({ bars: { UP } });
    const result = await run(broker);
    const price = lastPrice(UP);
    expect(broker.calls).toEqual([["buy", "UP", Math.floor(1_000_000 / price), Math.round(price * 0.95)]]);
    expect(result.status).toBe("OK");
    expect(result.decisions[0]).toMatchObject({ symbol: "UP", action: "BUY", status: "SUBMITTED", strategyId: "trend" });
  });

  it("closes a downtrend position", async () => {
    await watch("DN");
    const broker = new FakeBroker({ bars: { DN: DOWN }, positions: { DN: 50 } });
    const result = await run(broker);
    expect(broker.calls).toEqual([["close", "DN"]]);
    expect(result.decisions[0]).toMatchObject({ action: "SELL", status: "SUBMITTED", qty: 50 });
  });

  it("holds when already in position", async () => {
    await watch("UP");
    const broker = new FakeBroker({ bars: { UP }, positions: { UP: 10 } });
    const result = await run(broker);
    expect(broker.calls).toEqual([]);
    expect(result.decisions[0]).toMatchObject({ action: "HOLD", status: "NONE" });
  });

  it("sells before buying so a sale frees a position slot", async () => {
    await watch("DN", "UP");
    await saveSettings({ maxPositions: 1 });
    const broker = new FakeBroker({ bars: { DN: DOWN, UP }, positions: { DN: 10 } });
    await run(broker);
    expect(broker.calls.map((c) => c[0])).toEqual(["close", "buy"]);
  });

  it("respects max positions", async () => {
    await watch("UP");
    await saveSettings({ maxPositions: 1 });
    const broker = new FakeBroker({ bars: { UP }, positions: { OTHER: 10 } });
    const result = await run(broker);
    expect(broker.calls).toEqual([]);
    expect(result.decisions[0]).toMatchObject({ action: "BUY", status: "SKIPPED" });
    expect(result.decisions[0].message).toMatch(/maximum of 1/);
  });

  it("skips a buy when an order for the symbol is already open", async () => {
    await watch("UP");
    const broker = new FakeBroker({ bars: { UP }, openOrders: ["UP"] });
    const result = await run(broker);
    expect(broker.calls).toEqual([]);
    expect(result.decisions[0].message).toMatch(/already open/);
  });

  it("skips a buy that is smaller than one share", async () => {
    await watch("UP");
    const broker = new FakeBroker({ bars: { UP }, equityCents: 100_000 });
    const result = await run(broker);
    expect(broker.calls).toEqual([]);
    expect(result.decisions[0]).toMatchObject({ status: "SKIPPED" });
    expect(result.decisions[0].message).toMatch(/less than one share/);
  });

  it("dry run records decisions but sends nothing", async () => {
    await watch("DN", "UP");
    const broker = new FakeBroker({ bars: { DN: DOWN, UP }, positions: { DN: 10 } });
    const result = await run(broker, true);
    expect(broker.calls).toEqual([]);
    expect(result.dryRun).toBe(true);
    expect(result.decisions.map((d) => d.status).sort()).toEqual(["DRY_RUN", "DRY_RUN"]);
  });

  it("uses the Settings dry-run value when no override is given", async () => {
    await saveSettings({ dryRun: true });
    await watch("UP");
    const broker = new FakeBroker({ bars: { UP } });
    await runCycle({ broker, trigger: "MANUAL" });
    expect(broker.calls).toEqual([]);
  });

  it("skips a symbol with no data and records why", async () => {
    await watch("NOPE");
    const result = await run(new FakeBroker({ bars: {} }));
    expect(result.decisions[0]).toMatchObject({ symbol: "NOPE", status: "SKIPPED" });
    expect(result.decisions[0].message).toMatch(/history/);
  });

  it("records a failed order and marks the run as an error without stopping", async () => {
    await watch("UP");
    const result = await run(new FakeBroker({ bars: { UP }, failBuys: ["UP"] }));
    expect(result.status).toBe("ERROR");
    expect(result.decisions[0]).toMatchObject({ status: "FAILED", message: "insufficient buying power" });
  });

  it("does nothing on a blocked account", async () => {
    await watch("UP");
    const broker = new FakeBroker({ bars: { UP }, blocked: true });
    const result = await run(broker);
    expect(result.status).toBe("ERROR");
    expect(broker.calls).toEqual([]);
  });

  it("skips an empty or fully disabled watchlist", async () => {
    const result = await run(new FakeBroker());
    expect(result.status).toBe("SKIPPED");
  });

  it("refuses to place real-money orders until live trading is confirmed", async () => {
    await watch("UP");
    const broker = new FakeBroker({ bars: { UP }, paper: false });
    const result = await run(broker, false); // even an explicit "not a dry run"
    expect(broker.calls).toEqual([]);
    expect(result.dryRun).toBe(true);
    expect(result.message).toMatch(/confirm live trading/i);

    await saveSettings({ liveAcknowledged: true, liveConfirmText: "LIVE" });
    await run(broker, false);
    expect(broker.calls.map((c) => c[0])).toEqual(["buy"]);
  });

  it("refuses a second run while one is in progress", async () => {
    await watch("UP");
    const first = run(new FakeBroker({ bars: { UP } }));
    await expect(run(new FakeBroker({ bars: { UP } }))).rejects.toMatchObject({ status: 409 });
    await first;
  });
});

describe("switching strategies", () => {
  it("a per-symbol override beats the default strategy", async () => {
    // DOWN is flat under trend, but buy-and-hold pinned to it must still buy.
    await createSymbol({ symbol: "DN", strategyId: "buyhold" });
    await createSymbol({ symbol: "UP", strategyId: null });
    const broker = new FakeBroker({ bars: { DN: DOWN, UP } });
    const result = await run(broker);
    expect(broker.calls.map((c) => c[1]).sort()).toEqual(["DN", "UP"]);
    expect(result.decisions.find((d) => d.symbol === "DN")?.strategyId).toBe("buyhold");
    expect(result.decisions.find((d) => d.symbol === "UP")?.strategyId).toBe("trend");
  });

  it("changing the default strategy applies to the next run with no restart", async () => {
    await watch("DN");
    const broker = new FakeBroker({ bars: { DN: DOWN } });
    await run(broker);
    expect(broker.calls).toEqual([]); // trend: flat on a downtrend

    await saveSettings({ activeStrategyId: "buyhold" });
    await run(broker);
    expect(broker.calls.map((c) => c[0])).toEqual(["buy"]); // same data, new default strategy
    expect((await listRuns(1))[0].decisions[0].strategyId).toBe("buyhold");
  });
});
