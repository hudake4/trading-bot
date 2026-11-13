import { db } from "@/server/db";
import { handle, json } from "@/server/http";

export const dynamic = "force-dynamic";

/** Clears the watchlist, saved strategy parameters, bot history and settings. Never touches the broker. */
export const POST = () =>
  handle(async () => {
    await db.$transaction([
      db.botDecision.deleteMany(),
      db.botRun.deleteMany(),
      db.watchSymbol.deleteMany(),
      db.strategyConfig.deleteMany(),
      db.settings.deleteMany(),
    ]);
    return json({ ok: true as const });
  });
