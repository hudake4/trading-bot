/** Constants and defaults with no Prisma import (safe for tests). */

/** Every row in the single-user app belongs to this household. */
export const HOUSEHOLD_ID = "local";

export const DEFAULT_SETTINGS = {
  activeStrategyId: "trend",
  botEnabled: false,
  // New installs log decisions without sending orders until the user turns dry run off.
  dryRun: true,
  liveAcknowledged: false,
  positionBps: 1000,
  stopLossBps: 500,
  maxPositions: 5,
  entryDelayMinutes: 5,
} as const;
