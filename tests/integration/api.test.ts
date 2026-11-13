import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  AnalyzeResponse,
  BacktestResponse,
  BotRunDTO,
  BotStatusDTO,
  SettingsDTO,
  SignalDTO,
  StrategiesResponse,
  SymbolDTO,
} from "@/contracts/api";
import { setBrokerForTests } from "@/server/connection";
import { schedulerTick } from "@/server/scheduler";
import { getSchedulerState, saveSettings } from "@/server/repositories/settings";
import * as activityRoute from "@/app/api/activity/route";
import * as analyzeRoute from "@/app/api/analyze/route";
import * as backtestRoute from "@/app/api/backtest/route";
import * as botRoute from "@/app/api/bot/route";
import * as botRunRoute from "@/app/api/bot/run/route";
import * as resetRoute from "@/app/api/data/reset/route";
import * as settingsRoute from "@/app/api/settings/route";
import * as signalsRoute from "@/app/api/signals/route";
import * as strategiesRoute from "@/app/api/strategies/route";
import * as strategyRoute from "@/app/api/strategies/[id]/route";
import * as symbolsRoute from "@/app/api/symbols/route";
import * as symbolRoute from "@/app/api/symbols/[id]/route";
import { call, expectApiError } from "../helpers/api";
import { FakeBroker, trendBars } from "../helpers/fake-broker";

const UP = trendBars(0.004);
const DOWN = trendBars(-0.004);
const LONG = trendBars(0.0006, 700, 11);

let broker: FakeBroker;
beforeEach(() => {
  broker = new FakeBroker({ bars: { UP, DN: DOWN, LONG } });
  setBrokerForTests(broker);
});
afterEach(() => setBrokerForTests(undefined));

describe("settings", () => {
  it("returns defaults (dry run on, bot off) before anything is saved", async () => {
    const res = await call<SettingsDTO>(settingsRoute.GET, "GET", "/api/settings");
    expect(res.body).toMatchObject({
      activeStrategyId: "trend",
      botEnabled: false,
      dryRun: true,
      positionBps: 1000,
      stopLossBps: 500,
      liveAcknowledged: false,
      connection: { mode: "alpaca", paper: true },
    });
  });

  it("patches only the given fields", async () => {
    const res = await call<SettingsDTO>(settingsRoute.PATCH, "PATCH", "/api/settings", { body: { activeStrategyId: "macd", maxPositions: 3 } });
    expect(res.body).toMatchObject({ activeStrategyId: "macd", maxPositions: 3, dryRun: true });
    const again = await call<SettingsDTO>(settingsRoute.GET, "GET", "/api/settings");
    expect(again.body.activeStrategyId).toBe("macd");
  });

  it("validates fields", async () => {
    expectApiError(
      await call(settingsRoute.PATCH, "PATCH", "/api/settings", { body: { positionBps: 99999, activeStrategyId: "nope", extra: 1 } }),
      400,
      "VALIDATION_ERROR",
    );
    expectApiError(await call(settingsRoute.PATCH, "PATCH", "/api/settings", { body: "{oops" }), 400, "BAD_REQUEST");
  });

  it("requires typing LIVE to acknowledge real-money trading", async () => {
    expectApiError(
      await call(settingsRoute.PATCH, "PATCH", "/api/settings", { body: { liveAcknowledged: true } }),
      400,
      "VALIDATION_ERROR",
      ["liveConfirmText"],
    );
    expectApiError(
      await call(settingsRoute.PATCH, "PATCH", "/api/settings", { body: { liveAcknowledged: true, liveConfirmText: "live?" } }),
      400,
      "VALIDATION_ERROR",
      ["liveConfirmText"],
    );
    const ok = await call<SettingsDTO>(settingsRoute.PATCH, "PATCH", "/api/settings", {
      body: { liveAcknowledged: true, liveConfirmText: "LIVE" },
    });
    expect(ok.body.liveAcknowledged).toBe(true);
    const off = await call<SettingsDTO>(settingsRoute.PATCH, "PATCH", "/api/settings", { body: { liveAcknowledged: false } });
    expect(off.body.liveAcknowledged).toBe(false);
  });
});

describe("strategies", () => {
  it("lists every strategy with defaults and marks the default one", async () => {
    const res = await call<StrategiesResponse>(strategiesRoute.GET, "GET", "/api/strategies");
    expect(res.body.strategies.map((s) => s.id)).toEqual(["trend", "momentum", "meanrev", "breakout", "macd", "buyhold"]);
    const trend = res.body.strategies.find((s) => s.id === "trend")!;
    expect(trend).toMatchObject({ isDefault: true, customised: false, current: trend.defaults });
  });

  it("saves and resets parameters", async () => {
    const put = await call<StrategiesResponse>(strategyRoute.PUT, "PUT", "/api/strategies/trend", {
      params: { id: "trend" },
      body: { params: { fast: 10, slow: 30, rsiPeriod: 14, rsiOverbought: 75 } },
    });
    const saved = put.body.strategies.find((s) => s.id === "trend")!;
    expect(saved).toMatchObject({ customised: true, current: { fast: 10, slow: 30, rsiPeriod: 14, rsiOverbought: 75 } });

    const reset = await call<StrategiesResponse>(strategyRoute.DELETE, "DELETE", "/api/strategies/trend", { params: { id: "trend" } });
    expect(reset.body.strategies.find((s) => s.id === "trend")).toMatchObject({ customised: false });
  });

  it("rejects invalid parameters with field errors", async () => {
    const bad = await call(strategyRoute.PUT, "PUT", "/api/strategies/trend", {
      params: { id: "trend" },
      body: { params: { fast: 60, slow: 50 } },
    });
    expectApiError(bad, 400, "VALIDATION_ERROR", ["_root"]);
    const range = await call(strategyRoute.PUT, "PUT", "/api/strategies/trend", { params: { id: "trend" }, body: { params: { slow: 9999 } } });
    expectApiError(range, 400, "VALIDATION_ERROR", ["slow"]);
  });

  it("404s for an unknown strategy", async () => {
    expectApiError(await call(strategyRoute.PUT, "PUT", "/api/strategies/nope", { params: { id: "nope" }, body: { params: {} } }), 404, "NOT_FOUND");
  });

  it("lists symbols pinned to a strategy", async () => {
    await call(symbolsRoute.POST, "POST", "/api/symbols", { body: { symbol: "dn", strategyId: "buyhold" } });
    const res = await call<StrategiesResponse>(strategiesRoute.GET, "GET", "/api/strategies");
    expect(res.body.strategies.find((s) => s.id === "buyhold")?.pinnedSymbols).toEqual(["DN"]);
  });
});

describe("symbols", () => {
  it("adds (normalised to upper case), lists, overrides, disables and removes", async () => {
    const created = await call<SymbolDTO>(symbolsRoute.POST, "POST", "/api/symbols", { body: { symbol: " up " } });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ symbol: "UP", strategyId: null, effectiveStrategyId: "trend", enabled: true });

    const pinned = await call<SymbolDTO>(symbolRoute.PATCH, "PATCH", `/api/symbols/${created.body.id}`, {
      params: { id: created.body.id },
      body: { strategyId: "momentum", enabled: false },
    });
    expect(pinned.body).toMatchObject({ strategyId: "momentum", effectiveStrategyId: "momentum", enabled: false });

    // Following the default again, and the default changes with Settings.
    await call(settingsRoute.PATCH, "PATCH", "/api/settings", { body: { activeStrategyId: "breakout" } });
    const unpinned = await call<SymbolDTO>(symbolRoute.PATCH, "PATCH", `/api/symbols/${created.body.id}`, {
      params: { id: created.body.id },
      body: { strategyId: null },
    });
    expect(unpinned.body).toMatchObject({ strategyId: null, effectiveStrategyId: "breakout" });

    const del = await call(symbolRoute.DELETE, "DELETE", `/api/symbols/${created.body.id}`, { params: { id: created.body.id } });
    expect(del.status).toBe(204);
    const list = await call<SymbolDTO[]>(symbolsRoute.GET, "GET", "/api/symbols");
    expect(list.body).toEqual([]);
  });

  it("rejects bad tickers, unknown tickers and duplicates", async () => {
    expectApiError(await call(symbolsRoute.POST, "POST", "/api/symbols", { body: { symbol: "not a ticker" } }), 400, "VALIDATION_ERROR", ["symbol"]);
    expectApiError(await call(symbolsRoute.POST, "POST", "/api/symbols", { body: { symbol: "ZZZZ" } }), 400, "VALIDATION_ERROR", ["symbol"]);
    await call(symbolsRoute.POST, "POST", "/api/symbols", { body: { symbol: "UP" } });
    expectApiError(await call(symbolsRoute.POST, "POST", "/api/symbols", { body: { symbol: "UP" } }), 409, "CONFLICT");
    expectApiError(await call(symbolRoute.PATCH, "PATCH", "/api/symbols/missing", { params: { id: "missing" }, body: { enabled: true } }), 404, "NOT_FOUND");
  });
});

describe("signals", () => {
  it("shows what the bot would do per symbol, honouring overrides, without trading", async () => {
    await call(symbolsRoute.POST, "POST", "/api/symbols", { body: { symbol: "UP" } });
    await call(symbolsRoute.POST, "POST", "/api/symbols", { body: { symbol: "DN", strategyId: "buyhold" } });
    const res = await call<SignalDTO[]>(signalsRoute.GET, "GET", "/api/signals");
    const bySymbol = Object.fromEntries(res.body.map((s) => [s.symbol, s]));
    expect(bySymbol.UP).toMatchObject({ strategyId: "trend", signal: 1, action: "BUY", ok: true });
    expect(bySymbol.DN).toMatchObject({ strategyId: "buyhold", signal: 1, action: "BUY" });
    expect(broker.calls).toEqual([]);
  });

  it("explains symbols it can't evaluate", async () => {
    await call(symbolsRoute.POST, "POST", "/api/symbols", { body: { symbol: "NOPE" } }); // a valid ticker the fake broker has no bars for
    const res = await call<SignalDTO[]>(signalsRoute.GET, "GET", "/api/signals");
    expect(res.body[0]).toMatchObject({ ok: false, signal: null, action: null });
    expect(res.body[0].reason).toMatch(/history/);
  });
});

describe("analyze", () => {
  const get = (qs: string) => call<AnalyzeResponse>(analyzeRoute.GET, "GET", `/api/analyze?${qs}`);

  it("returns a snapshot and chart rows", async () => {
    const res = await get("symbol=long&days=365");
    expect(res.status).toBe(200);
    expect(res.body.symbol).toBe("LONG");
    expect(res.body.strategy.id).toBe("trend");
    expect(res.body.snapshot.rsi).toBeGreaterThan(0);
    expect(res.body.rows.length).toBeGreaterThan(200);
    expect(res.body.rows.length).toBeLessThan(300); // limited to the requested window
  });

  it("evaluates a chosen strategy", async () => {
    expect((await get("symbol=LONG&strategyId=buyhold")).body.snapshot.signal).toBe(1);
  });

  it("validates and 404s", async () => {
    expectApiError(await get("days=365"), 400, "VALIDATION_ERROR", ["symbol"]);
    expectApiError(await get("symbol=LONG&days=5"), 400, "VALIDATION_ERROR", ["days"]);
    expectApiError(await get("symbol=NOPE"), 404, "NOT_FOUND");
  });
});

describe("backtest", () => {
  const post = (body: unknown) => call<BacktestResponse>(backtestRoute.POST, "POST", "/api/backtest", { body });

  it("compares several strategies against buy and hold on one symbol", async () => {
    const res = await post({ symbol: "long", strategyIds: ["trend", "momentum", "buyhold"], years: 1 });
    expect(res.status).toBe(200);
    expect(res.body.runs.map((r) => r.strategyId)).toEqual(["trend", "momentum", "buyhold"]);
    for (const run of res.body.runs) {
      expect(run.equity).toHaveLength(res.body.dates.length);
      expect(run.drawdown).toHaveLength(res.body.dates.length);
    }
    expect(res.body.benchmark.equity).toHaveLength(res.body.dates.length);
    expect(res.body.costBps).toBe(5);
    expect(res.body.to > res.body.from).toBe(true);
  });

  it("uses saved parameters, and lets one strategy try different ones", async () => {
    const saved = await post({ symbol: "LONG", strategyIds: ["trend"], years: 1 });
    expect(saved.body.runs[0].params).toMatchObject({ fast: 20, slow: 50 });

    const tried = await post({ symbol: "LONG", strategyIds: ["trend"], years: 1, params: { fast: 5, slow: 15 } });
    expect(tried.body.runs[0].params).toMatchObject({ fast: 5, slow: 15 });
    expect(tried.body.runs[0].metrics).not.toEqual(saved.body.runs[0].metrics);
  });

  it("higher costs reduce the result", async () => {
    const free = await post({ symbol: "LONG", strategyIds: ["macd"], years: 1, costBps: 0 });
    const costly = await post({ symbol: "LONG", strategyIds: ["macd"], years: 1, costBps: 100 });
    expect(costly.body.runs[0].metrics.totalReturn).toBeLessThan(free.body.runs[0].metrics.totalReturn);
  });

  it("validates input", async () => {
    expectApiError(await post({ symbol: "LONG", strategyIds: [], years: 1 }), 400, "VALIDATION_ERROR", ["strategyIds"]);
    expectApiError(await post({ symbol: "LONG", strategyIds: ["trend"], years: 99 }), 400, "VALIDATION_ERROR", ["years"]);
    expectApiError(await post({ symbol: "LONG", strategyIds: ["trend"], years: 1, params: { fast: 60, slow: 50 } }), 400, "VALIDATION_ERROR", ["_root"]);
    expectApiError(await post({ symbol: "NOPE", strategyIds: ["trend"], years: 1 }), 404, "NOT_FOUND");
  });
});

describe("bot routes", () => {
  it("runs now and records the run in the activity log and status", async () => {
    await call(symbolsRoute.POST, "POST", "/api/symbols", { body: { symbol: "UP" } });
    const run = await call<BotRunDTO>(botRunRoute.POST, "POST", "/api/bot/run", { body: { dryRun: true } });
    expect(run.status).toBe(200);
    expect(run.body).toMatchObject({ status: "OK", trigger: "MANUAL", dryRun: true });
    expect(run.body.decisions[0]).toMatchObject({ symbol: "UP", action: "BUY", status: "DRY_RUN" });
    expect(broker.calls).toEqual([]);

    const activity = await call<{ runs: BotRunDTO[] }>(activityRoute.GET, "GET", "/api/activity");
    expect(activity.body.runs).toHaveLength(1);

    const status = await call<BotStatusDTO>(botRoute.GET, "GET", "/api/bot");
    expect(status.body).toMatchObject({ enabled: false, running: false, liveBlocked: false });
    expect(status.body.lastRun?.id).toBe(run.body.id);
  });

  it("reports live trading as blocked until acknowledged", async () => {
    setBrokerForTests(new FakeBroker({ bars: { UP }, paper: false }));
    expect((await call<BotStatusDTO>(botRoute.GET, "GET", "/api/bot")).body.liveBlocked).toBe(true);
    await saveSettings({ liveAcknowledged: true, liveConfirmText: "LIVE" });
    expect((await call<BotStatusDTO>(botRoute.GET, "GET", "/api/bot")).body.liveBlocked).toBe(false);
  });

  it("rejects unknown fields in the run request", async () => {
    expectApiError(await call(botRunRoute.POST, "POST", "/api/bot/run", { body: { nope: 1 } }), 400, "VALIDATION_ERROR");
  });
});

describe("reset", () => {
  it("clears watchlist, strategy parameters, history and settings", async () => {
    await call(symbolsRoute.POST, "POST", "/api/symbols", { body: { symbol: "UP" } });
    await call(settingsRoute.PATCH, "PATCH", "/api/settings", { body: { maxPositions: 2 } });
    await call(botRunRoute.POST, "POST", "/api/bot/run", { body: { dryRun: true } });
    await call(resetRoute.POST, "POST", "/api/data/reset");
    expect((await call<SymbolDTO[]>(symbolsRoute.GET, "GET", "/api/symbols")).body).toEqual([]);
    expect((await call<{ runs: unknown[] }>(activityRoute.GET, "GET", "/api/activity")).body.runs).toEqual([]);
    expect((await call<SettingsDTO>(settingsRoute.GET, "GET", "/api/settings")).body.maxPositions).toBe(5);
  });
});

describe("scheduler", () => {
  async function setup(now: string) {
    await call(symbolsRoute.POST, "POST", "/api/symbols", { body: { symbol: "UP" } });
    return new FakeBroker({ bars: { UP }, now });
  }

  it("does nothing while the bot is switched off", async () => {
    expect(await schedulerTick(await setup("2025-06-13T14:00:00Z"))).toBe(false);
  });

  it("waits until the entry delay after the open has passed", async () => {
    await saveSettings({ botEnabled: true, entryDelayMinutes: 5 });
    expect(await schedulerTick(await setup("2025-06-13T13:32:00Z"))).toBe(false); // 9:32 New York
    expect(await schedulerTick(await setup("2025-06-13T13:36:00Z"))).toBe(true); // 9:36 New York
  });

  it("runs once per day, then stays idle until the next day", async () => {
    await saveSettings({ botEnabled: true, dryRun: true });
    const broker = await setup("2025-06-13T14:00:00Z");
    expect(await schedulerTick(broker)).toBe(true);
    expect((await getSchedulerState()).lastRunDate).toBe("2025-06-13");
    expect(await schedulerTick(broker)).toBe(false);
    const runs = (await call<{ runs: BotRunDTO[] }>(activityRoute.GET, "GET", "/api/activity")).body.runs;
    expect(runs).toHaveLength(1);
    expect(runs[0].trigger).toBe("SCHEDULED");

    // Next trading day: the stale bar check still passes (bars end 2025-06-12, 4 days old).
    expect(await schedulerTick(new FakeBroker({ bars: { UP }, now: "2025-06-16T14:00:00Z" }))).toBe(true);
  });

  it("gives up for the day after repeated failures", async () => {
    await saveSettings({ botEnabled: true, dryRun: false });
    const broker = new FakeBroker({ bars: { UP }, now: "2025-06-17T14:00:00Z", blocked: true });
    await call(symbolsRoute.POST, "POST", "/api/symbols", { body: { symbol: "UP" } });
    expect(await schedulerTick(broker)).toBe(true);
    expect(await schedulerTick(broker)).toBe(true);
    expect(await schedulerTick(broker)).toBe(true);
    expect(await schedulerTick(broker)).toBe(false); // marked done after the third failure
  });
});
