/** Read-mostly operations behind the API routes: account, signals, analysis, backtests, bot status. */
import type {
  AccountResponse,
  AnalyzeResponse,
  BacktestRequest,
  BacktestResponse,
  BotStatusDTO,
  SignalDTO,
} from "../contracts/api";
import { chartRows, snapshot } from "../domain/analysis";
import { runBacktest } from "../domain/backtest";
import { addDays } from "../domain/dates";
import { getStrategy, resolveParams, validateParams, type Params } from "../domain/strategies";
import { nyDate } from "./broker";
import { isBotRunning } from "./bot";
import { connectionInfo, getBroker, isLive } from "./connection";
import { notFound, validation } from "./http";
import { buildPlan } from "./planner";
import { listRuns } from "./repositories/runs";
import { getSettings } from "./repositories/settings";
import { getCurrentParams } from "./repositories/strategies";
import { listSymbols } from "./repositories/symbols";

export async function getAccount(): Promise<AccountResponse> {
  const broker = getBroker();
  const [account, positions, clock, equityHistory] = await Promise.all([
    broker.getAccount(),
    broker.getPositions(),
    broker.getClock(),
    broker.getEquityHistory(90),
  ]);
  return {
    connection: connectionInfo(broker),
    account,
    positions,
    clock: { isOpen: clock.isOpen, nextOpen: clock.nextOpen, nextClose: clock.nextClose },
    equityHistory,
  };
}

/** What the bot would do for every watchlist symbol right now. Places no orders. */
export async function getSignals(): Promise<SignalDTO[]> {
  const broker = getBroker();
  const symbols = await listSymbols();
  if (symbols.length === 0) return [];
  const [params, positions, clock] = await Promise.all([getCurrentParams(), broker.getPositions(), broker.getClock()]);
  const held = new Map(positions.map((p) => [p.symbol, p.qty]));
  const plan = await buildPlan(broker, symbols, params, held, nyDate(clock.now));
  return plan.map((e) => ({
    symbol: e.symbol,
    strategyId: e.strategyId,
    enabled: e.enabled,
    ok: e.latest.ok,
    signal: e.latest.ok ? (e.latest.signal === 1 ? 1 : 0) : null,
    action: e.action,
    priceCents: e.latest.ok ? e.latest.priceCents : null,
    asOf: e.latest.ok ? e.latest.asOf : null,
    heldQty: e.heldQty,
    reason: e.latest.ok ? null : e.latest.reason,
  }));
}

export async function analyze(symbol: string, days: number, strategyId?: string): Promise<AnalyzeResponse> {
  const broker = getBroker();
  const settings = await getSettings();
  const def = getStrategy(strategyId ?? settings.activeStrategyId);
  const params = (await getCurrentParams())[def.id];

  const today = nyDate((await broker.getClock()).now);
  const bars = (await broker.getBars([symbol], days + 120))[symbol] ?? [];
  if (bars.length < 60) throw notFound(`Price history for ${symbol}`);

  const signals = def.signals(bars, params);
  const from = addDays(today, -days);
  const start = Math.max(bars.findIndex((b) => b.date >= from), 0);
  // Indicators warm up on the full history; the chart only shows the requested window.
  return {
    symbol,
    source: broker.kind,
    strategy: { id: def.id, name: def.name },
    snapshot: snapshot(bars, signals),
    rows: chartRows(bars, signals).slice(start),
  };
}

export async function backtest(req: BacktestRequest): Promise<BacktestResponse> {
  const broker = getBroker();
  const saved = await getCurrentParams();

  const defs = req.strategyIds.map((id) => getStrategy(id));
  const runParams: Params[] = defs.map((def) => {
    if (defs.length === 1 && req.params) {
      const { params, errors } = validateParams(def, req.params);
      if (Object.keys(errors).length > 0) {
        throw validation(Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, [v]])));
      }
      return params;
    }
    return resolveParams(def, saved[def.id]);
  });

  const today = nyDate((await broker.getClock()).now);
  const windowStart = addDays(today, -Math.round(req.years * 365));
  const warmupBars = Math.max(...defs.map((d, i) => d.warmup(runParams[i])));
  const bars = (await broker.getBars([req.symbol], Math.round(req.years * 365) + lookbackWarmupDays(warmupBars)))[req.symbol] ?? [];

  const first = bars.findIndex((b) => b.date >= windowStart);
  if (first < 0 || bars.length - first < 30) throw notFound(`Enough price history for ${req.symbol}`);
  const windowBars = bars.slice(first);

  const runs = defs.map((def, i) => {
    // Signals use the full history so indicators are warmed up when the window begins.
    const signals = def.signals(bars, runParams[i]).slice(first);
    const result = runBacktest(windowBars, signals, { costBps: req.costBps });
    return {
      strategyId: def.id,
      strategyName: def.name,
      params: runParams[i],
      metrics: result.metrics,
      winRate: result.winRate,
      roundTrips: result.trades.length,
      timeInMarket: result.timeInMarket,
      equity: result.equity,
      drawdown: result.drawdown,
      trades: result.trades,
    };
  });

  const benchmark = runBacktest(windowBars, windowBars.map(() => 1), { costBps: 0 });
  return {
    symbol: req.symbol,
    source: broker.kind,
    costBps: req.costBps,
    from: windowBars[0].date,
    to: windowBars[windowBars.length - 1].date,
    dates: windowBars.map((b) => b.date),
    // Buy and hold from the window's first close, with no entry gap or costs.
    benchmark: { metrics: benchmark.benchmarkMetrics, equity: benchmark.benchmark },
    runs,
  };
}

const lookbackWarmupDays = (bars: number) => Math.ceil(bars * 1.5) + 45;

export async function getBotStatus(): Promise<BotStatusDTO> {
  const broker = getBroker();
  const [settings, runs] = await Promise.all([getSettings(), listRuns(1)]);
  return {
    enabled: settings.botEnabled,
    dryRun: settings.dryRun,
    running: isBotRunning(),
    liveBlocked: isLive(broker) && !settings.liveAcknowledged,
    lastRun: runs[0] ?? null,
  };
}

