import { symbolCreateSchema } from "@/contracts/api";
import { getBroker } from "@/server/connection";
import { handle, json, parseBody, validation } from "@/server/http";
import { createSymbol, listSymbols } from "@/server/repositories/symbols";

export const dynamic = "force-dynamic";

export const GET = () => handle(async () => json(await listSymbols()));

export const POST = (req: Request) =>
  handle(async () => {
    const input = await parseBody(req, symbolCreateSchema);
    if (!(await getBroker().symbolExists(input.symbol))) {
      throw validation({ symbol: [`${input.symbol} isn't a tradable US stock on Alpaca.`] });
    }
    return json(await createSymbol(input), 201);
  });
