import type { SymbolCreateInput, SymbolDTO, SymbolPatch } from "../../contracts/api";
import { MAX_WATCHLIST } from "../../contracts/api";
import { isStrategyId, type StrategyId } from "../../domain/strategies";
import { db, HOUSEHOLD_ID, type DbClient } from "../db";
import { conflict, notFound } from "../http";

type Row = { id: string; symbol: string; strategyId: string | null; enabled: boolean };

const override = (value: string | null): StrategyId | null => (isStrategyId(value) ? value : null);

function toDTO(row: Row, defaultStrategy: StrategyId): SymbolDTO {
  const pinned = override(row.strategyId);
  return { id: row.id, symbol: row.symbol, strategyId: pinned, effectiveStrategyId: pinned ?? defaultStrategy, enabled: row.enabled };
}

async function defaultStrategyId(client: DbClient): Promise<StrategyId> {
  const settings = await client.settings.findUnique({ where: { householdId: HOUSEHOLD_ID } });
  return isStrategyId(settings?.activeStrategyId) ? settings.activeStrategyId : "trend";
}

export async function listSymbols(client: DbClient = db): Promise<SymbolDTO[]> {
  const [rows, fallback] = await Promise.all([
    client.watchSymbol.findMany({ where: { householdId: HOUSEHOLD_ID }, orderBy: { symbol: "asc" } }),
    defaultStrategyId(client),
  ]);
  return rows.map((r) => toDTO(r, fallback));
}

export async function createSymbol(input: SymbolCreateInput): Promise<SymbolDTO> {
  const count = await db.watchSymbol.count({ where: { householdId: HOUSEHOLD_ID } });
  if (count >= MAX_WATCHLIST) throw conflict(`The watchlist is limited to ${MAX_WATCHLIST} symbols.`);
  const exists = await db.watchSymbol.findUnique({
    where: { householdId_symbol: { householdId: HOUSEHOLD_ID, symbol: input.symbol } },
  });
  if (exists) throw conflict(`${input.symbol} is already on the watchlist.`);
  const row = await db.watchSymbol.create({
    data: { householdId: HOUSEHOLD_ID, symbol: input.symbol, strategyId: input.strategyId },
  });
  return toDTO(row, await defaultStrategyId(db));
}

export async function updateSymbol(id: string, patch: SymbolPatch): Promise<SymbolDTO> {
  const existing = await db.watchSymbol.findFirst({ where: { id, householdId: HOUSEHOLD_ID } });
  if (!existing) throw notFound("Symbol");
  const row = await db.watchSymbol.update({ where: { id }, data: patch });
  return toDTO(row, await defaultStrategyId(db));
}

export async function deleteSymbol(id: string): Promise<void> {
  const existing = await db.watchSymbol.findFirst({ where: { id, householdId: HOUSEHOLD_ID } });
  if (!existing) throw notFound("Symbol");
  await db.watchSymbol.delete({ where: { id } });
}
