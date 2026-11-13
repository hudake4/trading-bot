/**
 * One pass of the trading bot over the watchlist.
 *
 * Each enabled symbol follows its own strategy (its override, else the default). The bot reads
 * COMPLETED daily bars, asks the strategy for a long/flat target, and trades the difference: sells
 * first (they free capital and slots), then buys sized to a fraction of equity with a server-side
 * stop-loss. Everything it decides is recorded as a BotRun with one BotDecision per symbol.
 */
import type { BotRunDTO } from "../contracts/api";
import { positionSize, stopPriceCents } from "../domain/bot-logic";
import { nyDate, type Broker } from "./broker";
import { isLive } from "./connection";
import { conflict } from "./http";
import { buildPlan, type PlanEntry } from "./planner";
import { finishRun, getRun, startRun, type NewDecision } from "./repositories/runs";
import { getSettings } from "./repositories/settings";
import { getCurrentParams } from "./repositories/strategies";
import { listSymbols } from "./repositories/symbols";

const globalForBot = globalThis as unknown as { __tradedeskRunning?: boolean };

export function isBotRunning(): boolean {
  return globalForBot.__tradedeskRunning === true;
}

export interface CycleOptions {
  broker: Broker;
  trigger: "SCHEDULED" | "MANUAL";
  /** Forces dry run on or off for this run only; otherwise the Settings value is used. */
  dryRun?: boolean;
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export async function runCycle(options: CycleOptions): Promise<BotRunDTO> {
  if (isBotRunning()) throw conflict("A bot run is already in progress.");
  globalForBot.__tradedeskRunning = true;
  try {
    return await execute(options);
  } finally {
    globalForBot.__tradedeskRunning = false;
  }
}

async function execute({ broker, trigger, dryRun: dryRunOverride }: CycleOptions): Promise<BotRunDTO> {
  const settings = await getSettings();
  const liveBlocked = isLive(broker) && !settings.liveAcknowledged;
  const dryRun = liveBlocked || (dryRunOverride ?? settings.dryRun);
  const runId = await startRun(trigger, dryRun);

  try {
    const clock = await broker.getClock();
    const today = nyDate(clock.now);
    const account = await broker.getAccount();
    if (account.blocked) {
      await finishRun(runId, { status: "ERROR", message: "The account is blocked from trading.", equityCents: account.equityCents });
      return (await getRun(runId))!;
    }

    const symbols = (await listSymbols()).filter((s) => s.enabled);
    if (symbols.length === 0) {
      await finishRun(runId, { status: "SKIPPED", message: "The watchlist has no enabled symbols.", equityCents: account.equityCents });
      return (await getRun(runId))!;
    }

    const params = await getCurrentParams();
    const positions = await broker.getPositions();
    const held = new Map(positions.map((p) => [p.symbol, p.qty]));
    const plan = await buildPlan(broker, symbols, params, held, today);

    const decisions: NewDecision[] = [];
    const record = (entry: PlanEntry, d: Pick<NewDecision, "action" | "status"> & Partial<NewDecision>) =>
      decisions.push({
        symbol: entry.symbol,
        strategyId: entry.strategyId,
        signal: entry.latest.ok ? entry.latest.signal : 0,
        priceCents: entry.latest.ok ? entry.latest.priceCents : null,
        ...d,
      });

    // Symbols without usable data are recorded and left alone.
    for (const entry of plan.filter((e) => e.action === null)) {
      record(entry, { action: "HOLD", status: "SKIPPED", message: entry.latest.ok ? null : entry.latest.reason });
    }
    for (const entry of plan.filter((e) => e.action === "HOLD")) record(entry, { action: "HOLD", status: "NONE" });

    // Sells first: they free capital and position slots for the buys.
    for (const entry of plan.filter((e) => e.action === "SELL")) {
      if (dryRun) {
        record(entry, { action: "SELL", status: "DRY_RUN", qty: entry.heldQty, message: "Dry run: would close the position." });
        held.delete(entry.symbol);
        continue;
      }
      try {
        await broker.closePosition(entry.symbol);
        held.delete(entry.symbol);
        record(entry, { action: "SELL", status: "SUBMITTED", qty: entry.heldQty, message: "Closed the position." });
      } catch (err) {
        record(entry, { action: "SELL", status: "FAILED", qty: entry.heldQty, message: errorText(err) });
      }
    }

    let openSlots = settings.maxPositions - held.size;
    for (const entry of plan.filter((e) => e.action === "BUY")) {
      const price = entry.latest.ok ? entry.latest.priceCents : 0;
      if (openSlots <= 0) {
        record(entry, { action: "BUY", status: "SKIPPED", message: `Already holding the maximum of ${settings.maxPositions} positions.` });
        continue;
      }
      if (await broker.getOpenOrderCount(entry.symbol)) {
        record(entry, { action: "BUY", status: "SKIPPED", message: "An order for this symbol is already open." });
        continue;
      }
      const qty = positionSize(account.equityCents, price, settings.positionBps);
      if (qty < 1) {
        record(entry, {
          action: "BUY",
          status: "SKIPPED",
          message: `${settings.positionBps / 100}% of equity is less than one share at ${dollars(price)}.`,
        });
        continue;
      }
      const stop = stopPriceCents(price, settings.stopLossBps);
      if (dryRun) {
        record(entry, { action: "BUY", status: "DRY_RUN", qty, message: `Dry run: would buy ${qty} with a stop at ${dollars(stop)}.` });
        openSlots -= 1;
        continue;
      }
      try {
        await broker.buyWithStop(entry.symbol, qty, stop);
        openSlots -= 1;
        record(entry, { action: "BUY", status: "SUBMITTED", qty, message: `Bought ${qty} with a stop at ${dollars(stop)}.` });
      } catch (err) {
        record(entry, { action: "BUY", status: "FAILED", qty, message: errorText(err) });
      }
    }

    const failed = decisions.filter((d) => d.status === "FAILED").length;
    await finishRun(runId, {
      status: failed > 0 ? "ERROR" : "OK",
      message: liveBlocked
        ? "Real-money mode without confirmation: decisions were logged only. Confirm live trading in Settings to place orders."
        : failed > 0
          ? `${failed} order${failed === 1 ? "" : "s"} failed.`
          : null,
      equityCents: account.equityCents,
      decisions,
    });
  } catch (err) {
    await finishRun(runId, { status: "ERROR", message: errorText(err) });
  }
  return (await getRun(runId))!;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Unexpected error.";
}
