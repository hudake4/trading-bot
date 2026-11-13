import type { Bar } from "../types";

export const STRATEGY_IDS = ["trend", "momentum", "meanrev", "breakout", "macd", "buyhold"] as const;
export type StrategyId = (typeof STRATEGY_IDS)[number];

export type StrategyStyle = "Trend following" | "Momentum" | "Mean reversion" | "Breakout" | "Passive";

export type Params = Record<string, number>;

/** One tunable number. The UI renders a labelled input per spec; the server validates against it. */
export interface ParamSpec {
  key: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  integer?: boolean;
}

/**
 * A strategy maps price history to a target position per bar: 1 = want to be long, 0 = want to be
 * flat. Signals are a pure function of the bars up to and including each bar (no lookahead), so the
 * backtester and the live bot evaluate exactly the same logic.
 */
export interface StrategyDefinition {
  id: StrategyId;
  name: string;
  style: StrategyStyle;
  summary: string;
  /** Plain-language entry/exit rules shown on the Strategies page. */
  rules: string[];
  /** An honest note on when it tends to work and when it doesn't. */
  character: string;
  params: ParamSpec[];
  defaults: Params;
  /** Cross-field validation (e.g. fast < slow). Returns an error message or null. */
  crossCheck?: (params: Params) => string | null;
  /** Bars of history needed before signals are meaningful. */
  warmup: (params: Params) => number;
  signals: (bars: Bar[], params: Params) => number[];
}
