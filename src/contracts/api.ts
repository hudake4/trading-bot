/**
 * TradeDesk shared API contract.
 *
 * Single source of truth for request validation and response shapes. Imported by the API routes,
 * the UI and the tests, so it must stay free of server-only imports.
 *
 * Conventions (docs/CONVENTIONS.md):
 *   - Account money is integer cents (`...Cents`). Percentages are integer basis points (`...Bps`).
 *   - Dates are "YYYY-MM-DD" strings (New York session dates for market data).
 *   - Hypothetical backtest equity is plain dollars as numbers; it is never stored or traded on.
 */
import { z } from "zod";
import type { ChartRow, Snapshot } from "../domain/analysis";
import type { BacktestMetrics, TradeRecord } from "../domain/backtest";
import { STRATEGY_IDS, type ParamSpec, type Params, type StrategyId, type StrategyStyle } from "../domain/strategies/types";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const API_ERROR_CODES = ["VALIDATION_ERROR", "NOT_FOUND", "BAD_REQUEST", "CONFLICT", "UPSTREAM_ERROR", "INTERNAL_ERROR"] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; fieldErrors?: Record<string, string[]> };
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const strategyIdSchema = z.enum(STRATEGY_IDS, {
  errorMap: () => ({ message: "Choose one of the available strategies" }),
});

/** US tickers: AAPL, BRK.B, BF-B. Normalised to upper case. */
export const symbolSchema = z
  .string({ required_error: "Ticker is required", invalid_type_error: "Ticker is required" })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{1,5}([.-][A-Z])?$/, "Use a ticker such as AAPL or BRK.B");

export const MAX_WATCHLIST = 50;

// ---------------------------------------------------------------------------
// Connection and settings
// ---------------------------------------------------------------------------

export interface ConnectionDTO {
  /** "demo" = no Alpaca keys configured: synthetic prices and a simulated account. */
  mode: "alpaca" | "demo";
  paper: boolean;
  dataFeed: string;
}

export const settingsPatchSchema = z
  .object({
    activeStrategyId: strategyIdSchema,
    botEnabled: z.boolean(),
    dryRun: z.boolean(),
    positionBps: z.number().int("Use whole basis points").min(10, "At least 0.1% of equity").max(5000, "At most 50% of equity"),
    stopLossBps: z.number().int("Use whole basis points").min(50, "At least 0.5%").max(5000, "At most 50%"),
    maxPositions: z.number().int("Use a whole number").min(1, "At least 1").max(50, "At most 50"),
    entryDelayMinutes: z.number().int("Use a whole number").min(0, "At least 0").max(120, "At most 120"),
    liveAcknowledged: z.boolean(),
    /** Must be exactly "LIVE" when turning liveAcknowledged on. */
    liveConfirmText: z.string().optional(),
  })
  .partial()
  .strict();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export interface SettingsDTO {
  activeStrategyId: StrategyId;
  botEnabled: boolean;
  dryRun: boolean;
  positionBps: number;
  stopLossBps: number;
  maxPositions: number;
  entryDelayMinutes: number;
  liveAcknowledged: boolean;
  connection: ConnectionDTO;
}

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

export const strategyParamsSchema = z.object({
  params: z.record(z.string(), z.unknown()),
});

export interface StrategyDTO {
  id: StrategyId;
  name: string;
  style: StrategyStyle;
  summary: string;
  rules: string[];
  character: string;
  params: ParamSpec[];
  defaults: Params;
  /** The parameters in use: saved values, or the defaults. */
  current: Params;
  customised: boolean;
  /** True for the strategy every symbol without an override follows. */
  isDefault: boolean;
  /** Symbols pinned to this strategy by an override. */
  pinnedSymbols: string[];
}

export interface StrategiesResponse {
  activeStrategyId: StrategyId;
  strategies: StrategyDTO[];
}

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

export const symbolCreateSchema = z.object({
  symbol: symbolSchema,
  strategyId: strategyIdSchema.nullish().transform((v) => v ?? null),
});
export type SymbolCreateInput = z.output<typeof symbolCreateSchema>;

export const symbolPatchSchema = z
  .object({ strategyId: strategyIdSchema.nullable(), enabled: z.boolean() })
  .partial()
  .strict();
export type SymbolPatch = z.infer<typeof symbolPatchSchema>;

export interface SymbolDTO {
  id: string;
  symbol: string;
  /** The override, or null when it follows the default strategy. */
  strategyId: StrategyId | null;
  /** The strategy that will actually be used. */
  effectiveStrategyId: StrategyId;
  enabled: boolean;
}

export type BotAction = "BUY" | "SELL" | "HOLD";

/** What the bot would do for one symbol right now. Nothing is traded by asking. */
export interface SignalDTO {
  symbol: string;
  strategyId: StrategyId;
  enabled: boolean;
  ok: boolean;
  /** 1 = want long, 0 = want flat; null when the data couldn't be used (see `reason`). */
  signal: 0 | 1 | null;
  action: BotAction | null;
  priceCents: number | null;
  asOf: string | null;
  heldQty: number;
  reason: string | null;
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export interface AccountDTO {
  equityCents: number;
  cashCents: number;
  buyingPowerCents: number;
  /** Equity at the previous close, for today's change. */
  lastEquityCents: number;
  blocked: boolean;
}

export interface PositionDTO {
  symbol: string;
  qty: number;
  avgEntryCents: number;
  currentPriceCents: number;
  marketValueCents: number;
  unrealizedPlCents: number;
  /** Fraction, e.g. 0.034 = +3.4%. */
  unrealizedPlPct: number;
}

export interface AccountResponse {
  connection: ConnectionDTO;
  account: AccountDTO;
  positions: PositionDTO[];
  clock: { isOpen: boolean; nextOpen: string; nextClose: string };
  equityHistory: { date: string; equityCents: number }[];
}

// ---------------------------------------------------------------------------
// Analyze and backtest
// ---------------------------------------------------------------------------

export const analyzeQuerySchema = z.object({
  symbol: symbolSchema,
  days: z.coerce.number().int().min(90).max(1825).default(365),
  strategyId: strategyIdSchema.optional(),
});

export interface AnalyzeResponse {
  symbol: string;
  source: ConnectionDTO["mode"];
  strategy: { id: StrategyId; name: string };
  snapshot: Snapshot;
  rows: ChartRow[];
}

export const backtestRequestSchema = z.object({
  symbol: symbolSchema,
  strategyIds: z.array(strategyIdSchema).min(1, "Choose at least one strategy").max(STRATEGY_IDS.length),
  years: z.number({ invalid_type_error: "Years must be a number" }).min(0.5, "At least half a year").max(10, "At most 10 years"),
  costBps: z.number({ invalid_type_error: "Cost must be a number" }).min(0, "Cannot be negative").max(200, "At most 200 bps").default(5),
  /** Parameters to try instead of the saved ones; only honoured when exactly one strategy is chosen. */
  params: z.record(z.string(), z.unknown()).optional(),
});
export type BacktestRequest = z.output<typeof backtestRequestSchema>;

export interface BacktestRunDTO {
  strategyId: StrategyId;
  strategyName: string;
  params: Params;
  metrics: BacktestMetrics;
  winRate: number | null;
  roundTrips: number;
  timeInMarket: number;
  equity: number[];
  drawdown: number[];
  trades: TradeRecord[];
}

export interface BacktestResponse {
  symbol: string;
  source: ConnectionDTO["mode"];
  costBps: number;
  from: string;
  to: string;
  dates: string[];
  benchmark: { metrics: BacktestMetrics; equity: number[] };
  runs: BacktestRunDTO[];
}

// ---------------------------------------------------------------------------
// Bot
// ---------------------------------------------------------------------------

export const botRunRequestSchema = z.object({ dryRun: z.boolean().optional() }).strict();

export type DecisionStatus = "SUBMITTED" | "DRY_RUN" | "SKIPPED" | "FAILED" | "NONE";

export interface BotDecisionDTO {
  id: string;
  symbol: string;
  strategyId: StrategyId;
  signal: number;
  action: BotAction;
  status: DecisionStatus;
  priceCents: number | null;
  qty: number | null;
  message: string | null;
}

export type BotRunStatus = "RUNNING" | "OK" | "ERROR" | "SKIPPED";

export interface BotRunDTO {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  trigger: "SCHEDULED" | "MANUAL";
  dryRun: boolean;
  status: BotRunStatus;
  message: string | null;
  equityCents: number | null;
  decisions: BotDecisionDTO[];
}

export interface BotStatusDTO {
  enabled: boolean;
  dryRun: boolean;
  running: boolean;
  /** Real-money mode without the typed acknowledgement: orders are blocked and runs are dry. */
  liveBlocked: boolean;
  lastRun: BotRunDTO | null;
}

export interface ActivityResponse {
  runs: BotRunDTO[];
}
