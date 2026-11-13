import type { StrategiesResponse, StrategyDTO } from "../../contracts/api";
import { getStrategy, resolveParams, STRATEGIES, validateParams, type Params, type StrategyDefinition } from "../../domain/strategies";
import { db, type DbClient } from "../db";
import { validation } from "../http";
import { getSettings } from "./settings";
import { listSymbols } from "./symbols";

function parseSaved(json: string | undefined): Record<string, unknown> | null {
  if (!json) return null;
  try {
    const value: unknown = JSON.parse(json);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The parameters in use for each strategy: saved values merged over defaults. */
export async function getCurrentParams(client: DbClient = db): Promise<Record<string, Params>> {
  const rows = await client.strategyConfig.findMany();
  const saved = new Map(rows.map((r) => [r.strategyId, r.paramsJson]));
  return Object.fromEntries(STRATEGIES.map((s) => [s.id, resolveParams(s, parseSaved(saved.get(s.id)))]));
}

export async function getStrategiesResponse(): Promise<StrategiesResponse> {
  const [settings, current, symbols, rows] = await Promise.all([
    getSettings(),
    getCurrentParams(),
    listSymbols(),
    db.strategyConfig.findMany({ select: { strategyId: true } }),
  ]);
  const customised = new Set(rows.map((r) => r.strategyId));
  const strategies: StrategyDTO[] = STRATEGIES.map((s) => ({
    id: s.id,
    name: s.name,
    style: s.style,
    summary: s.summary,
    rules: s.rules,
    character: s.character,
    params: s.params,
    defaults: s.defaults,
    current: current[s.id],
    customised: customised.has(s.id),
    isDefault: settings.activeStrategyId === s.id,
    pinnedSymbols: symbols.filter((sym) => sym.strategyId === s.id).map((sym) => sym.symbol),
  }));
  return { activeStrategyId: settings.activeStrategyId, strategies };
}

/** Validates and saves the parameters for one strategy. */
export async function saveStrategyParams(def: StrategyDefinition, input: Record<string, unknown>): Promise<void> {
  const { params, errors } = validateParams(def, input);
  if (Object.keys(errors).length > 0) {
    throw validation(Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, [v]])));
  }
  const paramsJson = JSON.stringify(params);
  await db.strategyConfig.upsert({
    where: { strategyId: def.id },
    create: { strategyId: def.id, paramsJson },
    update: { paramsJson },
  });
}

export async function resetStrategyParams(id: string): Promise<void> {
  getStrategy(id);
  await db.strategyConfig.deleteMany({ where: { strategyId: id } });
}
