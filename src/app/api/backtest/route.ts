import { backtestRequestSchema } from "@/contracts/api";
import { handle, json, parseBody } from "@/server/http";
import { backtest } from "@/server/services";

export const dynamic = "force-dynamic";

export const POST = (req: Request) => handle(async () => json(await backtest(await parseBody(req, backtestRequestSchema))));
