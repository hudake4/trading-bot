import { strategyParamsSchema } from "@/contracts/api";
import { getStrategy, isStrategyId } from "@/domain/strategies";
import { handle, json, notFound, parseBody } from "@/server/http";
import { getStrategiesResponse, resetStrategyParams, saveStrategyParams } from "@/server/repositories/strategies";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function knownId(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!isStrategyId(id)) throw notFound("Strategy");
  return id;
}

/** Saves this strategy's parameters. Returns the refreshed strategy list. */
export const PUT = (req: Request, ctx: Ctx) =>
  handle(async () => {
    const id = await knownId(ctx);
    const { params } = await parseBody(req, strategyParamsSchema);
    await saveStrategyParams(getStrategy(id), params);
    return json(await getStrategiesResponse());
  });

/** Resets this strategy's parameters to its defaults. */
export const DELETE = (_req: Request, ctx: Ctx) =>
  handle(async () => {
    await resetStrategyParams(await knownId(ctx));
    return json(await getStrategiesResponse());
  });
