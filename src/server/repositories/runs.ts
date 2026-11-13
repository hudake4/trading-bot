import type { BotDecisionDTO, BotRunDTO, BotRunStatus, DecisionStatus } from "../../contracts/api";
import { isStrategyId } from "../../domain/strategies";
import { db, HOUSEHOLD_ID } from "../db";

export interface NewDecision {
  symbol: string;
  strategyId: string;
  signal: number;
  action: "BUY" | "SELL" | "HOLD";
  status: DecisionStatus;
  priceCents?: number | null;
  qty?: number | null;
  message?: string | null;
}

type RunRow = Awaited<ReturnType<typeof loadRuns>>[number];

function toDTO(row: RunRow): BotRunDTO {
  return {
    id: row.id,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    trigger: row.trigger === "SCHEDULED" ? "SCHEDULED" : "MANUAL",
    dryRun: row.dryRun,
    status: row.status as BotRunStatus,
    message: row.message,
    equityCents: row.equityCents,
    decisions: row.decisions.map(
      (d): BotDecisionDTO => ({
        id: d.id,
        symbol: d.symbol,
        strategyId: isStrategyId(d.strategyId) ? d.strategyId : "trend",
        signal: d.signal,
        action: d.action as BotDecisionDTO["action"],
        status: d.status as DecisionStatus,
        priceCents: d.priceCents,
        qty: d.qty,
        message: d.message,
      }),
    ),
  };
}

function loadRuns(limit: number) {
  return db.botRun.findMany({
    where: { householdId: HOUSEHOLD_ID },
    orderBy: { startedAt: "desc" },
    take: limit,
    include: { decisions: { orderBy: [{ action: "asc" }, { symbol: "asc" }] } },
  });
}

export async function listRuns(limit = 30): Promise<BotRunDTO[]> {
  return (await loadRuns(limit)).map(toDTO);
}

export async function getRun(id: string): Promise<BotRunDTO | null> {
  const row = await db.botRun.findFirst({
    where: { id, householdId: HOUSEHOLD_ID },
    include: { decisions: { orderBy: [{ action: "asc" }, { symbol: "asc" }] } },
  });
  return row ? toDTO(row) : null;
}

export async function startRun(trigger: "SCHEDULED" | "MANUAL", dryRun: boolean): Promise<string> {
  const run = await db.botRun.create({ data: { householdId: HOUSEHOLD_ID, trigger, dryRun } });
  return run.id;
}

export async function finishRun(
  id: string,
  result: { status: BotRunStatus; message?: string | null; equityCents?: number | null; decisions?: NewDecision[] },
): Promise<void> {
  await db.$transaction([
    db.botDecision.createMany({
      data: (result.decisions ?? []).map((d) => ({
        runId: id,
        symbol: d.symbol,
        strategyId: d.strategyId,
        signal: d.signal,
        action: d.action,
        status: d.status,
        priceCents: d.priceCents ?? null,
        qty: d.qty ?? null,
        message: d.message ?? null,
      })),
    }),
    db.botRun.update({
      where: { id },
      data: {
        status: result.status,
        message: result.message ?? null,
        equityCents: result.equityCents ?? null,
        finishedAt: new Date(),
      },
    }),
  ]);
}

/** Marks runs left RUNNING by a crashed or restarted server as errors so they don't look live. */
export async function failStaleRuns(): Promise<void> {
  await db.botRun.updateMany({
    where: { status: "RUNNING" },
    data: { status: "ERROR", message: "Interrupted: the server stopped before this run finished.", finishedAt: new Date() },
  });
}
