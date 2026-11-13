import { botRunRequestSchema } from "@/contracts/api";
import { runCycle } from "@/server/bot";
import { getBroker } from "@/server/connection";
import { handle, json, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

/** Runs one bot cycle now. `dryRun: true` logs decisions without sending orders. */
export const POST = (req: Request) =>
  handle(async () => {
    const { dryRun } = await parseBody(req, botRunRequestSchema);
    return json(await runCycle({ broker: getBroker(), trigger: "MANUAL", dryRun }));
  });
