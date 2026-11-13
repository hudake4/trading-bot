import { analyzeQuerySchema } from "@/contracts/api";
import { handle, json } from "@/server/http";
import { analyze } from "@/server/services";

export const dynamic = "force-dynamic";

export const GET = (req: Request) =>
  handle(async () => {
    const url = new URL(req.url);
    const query = analyzeQuerySchema.parse({
      symbol: url.searchParams.get("symbol") ?? undefined,
      days: url.searchParams.get("days") ?? undefined,
      strategyId: url.searchParams.get("strategyId") ?? undefined,
    });
    return json(await analyze(query.symbol, query.days, query.strategyId));
  });
