import { handle, json } from "@/server/http";
import { getSignals } from "@/server/services";

export const dynamic = "force-dynamic";

/** What the bot would do for each watchlist symbol right now. Reads prices; places no orders. */
export const GET = () => handle(async () => json(await getSignals()));
