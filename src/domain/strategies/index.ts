/**
 * Strategy registry. To add a strategy: write a StrategyDefinition in definitions.ts, add its id to
 * STRATEGY_IDS in types.ts, and list it below. The Strategies page, the Backtest page, the watchlist
 * selector and the bot all pick it up from here.
 */
import { breakout, buyhold, macdStrategy, meanrev, momentum, trend } from "./definitions";
import { STRATEGY_IDS, type Params, type StrategyDefinition, type StrategyId } from "./types";

export { STRATEGY_IDS };
export type { ParamSpec, Params, StrategyDefinition, StrategyId, StrategyStyle } from "./types";

export const STRATEGIES: readonly StrategyDefinition[] = [trend, momentum, meanrev, breakout, macdStrategy, buyhold];

const BY_ID = new Map<string, StrategyDefinition>(STRATEGIES.map((s) => [s.id, s]));

export function isStrategyId(value: unknown): value is StrategyId {
  return typeof value === "string" && BY_ID.has(value);
}

export function getStrategy(id: string): StrategyDefinition {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown strategy: ${id}`);
  return def;
}

export interface ParamValidation {
  params: Params;
  /** Field errors keyed by parameter key; "_root" for cross-field problems. Empty when valid. */
  errors: Record<string, string>;
}

/** Checks `input` against a strategy's parameter specs. Unknown keys are dropped; missing ones take the default. */
export function validateParams(def: StrategyDefinition, input: Record<string, unknown>): ParamValidation {
  const params: Params = {};
  const errors: Record<string, string> = {};
  for (const spec of def.params) {
    const raw = input[spec.key] ?? def.defaults[spec.key];
    const value = typeof raw === "number" ? raw : Number.NaN;
    if (!Number.isFinite(value)) {
      errors[spec.key] = `${spec.label} must be a number.`;
    } else if (spec.integer && !Number.isInteger(value)) {
      errors[spec.key] = `${spec.label} must be a whole number.`;
    } else if (value < spec.min || value > spec.max) {
      errors[spec.key] = `${spec.label} must be between ${spec.min} and ${spec.max}.`;
    } else {
      params[spec.key] = value;
    }
  }
  if (Object.keys(errors).length === 0 && def.crossCheck) {
    const problem = def.crossCheck(params);
    if (problem) errors._root = problem;
  }
  return { params, errors };
}

/** Saved parameters merged over the strategy's defaults; anything invalid falls back to the default. */
export function resolveParams(def: StrategyDefinition, saved: Record<string, unknown> | null | undefined): Params {
  const merged = validateParams(def, saved ?? {});
  return Object.keys(merged.errors).length === 0 ? merged.params : { ...def.defaults };
}
