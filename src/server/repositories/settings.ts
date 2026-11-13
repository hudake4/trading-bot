import type { SettingsDTO, SettingsPatch } from "../../contracts/api";
import { isStrategyId } from "../../domain/strategies";
import { connectionInfo } from "../connection";
import { db, HOUSEHOLD_ID, type DbClient } from "../db";
import { DEFAULT_SETTINGS } from "../defaults";
import { validation } from "../http";

type SettingsRow = NonNullable<Awaited<ReturnType<typeof db.settings.findUnique>>>;

function toDTO(row: Partial<SettingsRow>): SettingsDTO {
  const merged = { ...DEFAULT_SETTINGS, ...row };
  return {
    activeStrategyId: isStrategyId(merged.activeStrategyId) ? merged.activeStrategyId : "trend",
    botEnabled: merged.botEnabled,
    dryRun: merged.dryRun,
    positionBps: merged.positionBps,
    stopLossBps: merged.stopLossBps,
    maxPositions: merged.maxPositions,
    entryDelayMinutes: merged.entryDelayMinutes,
    liveAcknowledged: merged.liveAcknowledged,
    connection: connectionInfo(),
  };
}

export async function getSettings(client: DbClient = db): Promise<SettingsDTO> {
  const row = await client.settings.findUnique({ where: { householdId: HOUSEHOLD_ID } });
  return toDTO(row ?? {});
}

/** The raw row (or defaults) including scheduler bookkeeping the UI doesn't see. */
export async function getSchedulerState(client: DbClient = db): Promise<{ lastRunDate: string | null }> {
  const row = await client.settings.findUnique({ where: { householdId: HOUSEHOLD_ID } });
  return { lastRunDate: row?.lastRunDate ?? null };
}

export async function saveSettings(patch: SettingsPatch): Promise<SettingsDTO> {
  const { liveConfirmText, ...data } = patch;
  const current = await getSettings();
  if (data.liveAcknowledged === true && !current.liveAcknowledged && liveConfirmText?.trim() !== "LIVE") {
    throw validation({ liveConfirmText: ['Type LIVE to confirm you want real-money orders.'] });
  }
  const row = await db.settings.upsert({
    where: { householdId: HOUSEHOLD_ID },
    create: { householdId: HOUSEHOLD_ID, ...data },
    update: data,
  });
  return toDTO(row);
}

export async function markScheduledRun(date: string): Promise<void> {
  await db.settings.upsert({
    where: { householdId: HOUSEHOLD_ID },
    create: { householdId: HOUSEHOLD_ID, lastRunDate: date },
    update: { lastRunDate: date },
  });
}
