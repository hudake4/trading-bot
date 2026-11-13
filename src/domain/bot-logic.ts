/** Pure decision rules for the bot: what to do given a signal, how big to buy, where to put the stop. */
import { daysBetween } from "./dates";
import type { Params, StrategyDefinition } from "./strategies";
import type { Bar } from "./types";

export type Action = "BUY" | "SELL" | "HOLD";

/** A signal that has been stale this many calendar days means halted, delisted or a data problem. */
export const MAX_STALE_DAYS = 5;

export function decide(signal: number, heldQty: number): Action {
  if (signal === 1 && heldQty <= 0) return "BUY";
  if (signal === 0 && heldQty > 0) return "SELL";
  return "HOLD";
}

/** Whole shares worth at most `positionBps` (basis points) of equity. Integer math throughout. */
export function positionSize(equityCents: number, priceCents: number, positionBps: number): number {
  if (priceCents <= 0 || equityCents <= 0) return 0;
  const budgetCents = Math.floor((equityCents * positionBps) / 10_000);
  return Math.floor(budgetCents / priceCents);
}

/** Protective stop price in cents, `stopBps` below the reference price. */
export function stopPriceCents(priceCents: number, stopBps: number): number {
  return Math.max(1, Math.round((priceCents * (10_000 - stopBps)) / 10_000));
}

export type LatestSignal =
  | { ok: true; signal: number; priceCents: number; asOf: string }
  | { ok: false; reason: string };

/**
 * The strategy's target from COMPLETED bars only. Today's bar is dropped even if present: an
 * in-progress daily bar would make the signal flicker during the session, and the backtest only
 * ever acts on a finished close.
 */
export function latestSignal(bars: Bar[], def: StrategyDefinition, params: Params, today: string): LatestSignal {
  const done = bars.filter((b) => b.date < today);
  const needed = def.warmup(params) + 1;
  if (done.length < needed) {
    return { ok: false, reason: `Only ${done.length} days of history; ${def.name} needs ${needed}.` };
  }
  const lastBar = done[done.length - 1];
  const age = daysBetween(lastBar.date, today);
  if (age > MAX_STALE_DAYS) {
    return { ok: false, reason: `Latest bar is ${age} days old (${lastBar.date}); skipping stale data.` };
  }
  const signals = def.signals(done, params);
  return { ok: true, signal: signals[signals.length - 1], priceCents: Math.round(lastBar.close * 100), asOf: lastBar.date };
}
