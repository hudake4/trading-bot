/**
 * In-process scheduler. Once a minute it checks whether the bot is switched on, the market is open
 * and today's cycle hasn't run yet; if so it runs one cycle a few minutes after the open. It only
 * runs while this server process runs: if the PC sleeps or the app is closed, nothing trades
 * (server-side stop-losses stay live at Alpaca).
 */
import { minutesSinceOpen, nyDate, type Broker } from "./broker";
import { isBotRunning, runCycle } from "./bot";
import { getBroker } from "./connection";
import { failStaleRuns } from "./repositories/runs";
import { getSchedulerState, getSettings, markScheduledRun } from "./repositories/settings";

const TICK_MS = 60_000;
const MAX_FAILURES_PER_DAY = 3;

const globalForScheduler = globalThis as unknown as {
  __tradedeskScheduler?: NodeJS.Timeout;
  __tradedeskFailures?: { date: string; count: number };
};

/** Runs today's cycle if it is due. Returns true when a cycle ran. */
export async function schedulerTick(broker: Broker): Promise<boolean> {
  if (isBotRunning()) return false;
  const settings = await getSettings();
  if (!settings.botEnabled) return false;

  const clock = await broker.getClock();
  if (!clock.isOpen) return false;
  const today = nyDate(clock.now);
  if ((await getSchedulerState()).lastRunDate === today) return false;
  if (minutesSinceOpen(clock.now) < settings.entryDelayMinutes) return false;

  const run = await runCycle({ broker, trigger: "SCHEDULED" });
  if (run.status !== "ERROR") {
    await markScheduledRun(today);
    return true;
  }
  // A failed cycle is retried on the next tick, but not forever.
  const failures = globalForScheduler.__tradedeskFailures;
  const count = failures?.date === today ? failures.count + 1 : 1;
  globalForScheduler.__tradedeskFailures = { date: today, count };
  if (count >= MAX_FAILURES_PER_DAY) await markScheduledRun(today);
  return true;
}

export function startScheduler(): void {
  if (globalForScheduler.__tradedeskScheduler) return;
  const tick = () => {
    schedulerTick(getBroker()).catch((err) => console.error("[scheduler] tick failed:", err instanceof Error ? err.message : err));
  };
  failStaleRuns().catch(() => undefined);
  globalForScheduler.__tradedeskScheduler = setInterval(tick, TICK_MS);
  globalForScheduler.__tradedeskScheduler.unref();
  setTimeout(tick, 10_000).unref();
}
