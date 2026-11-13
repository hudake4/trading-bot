/**
 * Turns the watchlist, each symbol's strategy and current positions into an action per symbol.
 * Shared by the bot (which then trades the plan) and the Watchlist page (which only displays it).
 */
import type { BotAction, SymbolDTO } from "../contracts/api";
import { decide, latestSignal, type LatestSignal } from "../domain/bot-logic";
import { getStrategy, type Params, type StrategyId } from "../domain/strategies";
import type { Broker } from "./broker";

export interface PlanEntry {
  symbol: string;
  strategyId: StrategyId;
  enabled: boolean;
  latest: LatestSignal;
  heldQty: number;
  /** null when the data couldn't be used, so no decision can be made. */
  action: BotAction | null;
}

/** Calendar days of history to request so every strategy in use is fully warmed up. */
export function lookbackDays(symbols: SymbolDTO[], params: Record<string, Params>): number {
  const warmups = symbols.map((s) => getStrategy(s.effectiveStrategyId).warmup(params[s.effectiveStrategyId]));
  const bars = Math.max(60, ...warmups);
  return Math.min(Math.ceil(bars * 1.5) + 45, 2000); // ~1.4 calendar days per trading day, plus holidays
}

export async function buildPlan(
  broker: Broker,
  symbols: SymbolDTO[],
  params: Record<string, Params>,
  held: Map<string, number>,
  today: string,
): Promise<PlanEntry[]> {
  if (symbols.length === 0) return [];
  const bars = await broker.getBars(
    symbols.map((s) => s.symbol),
    lookbackDays(symbols, params),
  );
  return symbols.map((s) => {
    const def = getStrategy(s.effectiveStrategyId);
    const latest: LatestSignal = latestSignal(bars[s.symbol] ?? [], def, params[def.id], today);
    const heldQty = held.get(s.symbol) ?? 0;
    return {
      symbol: s.symbol,
      strategyId: def.id,
      enabled: s.enabled,
      latest,
      heldQty,
      action: latest.ok ? decide(latest.signal, heldQty) : null,
    };
  });
}
