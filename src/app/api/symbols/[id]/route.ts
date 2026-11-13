import { symbolPatchSchema } from "@/contracts/api";
import { handle, json, noContent, parseBody } from "@/server/http";
import { deleteSymbol, updateSymbol } from "@/server/repositories/symbols";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = (req: Request, ctx: Ctx) =>
  handle(async () => json(await updateSymbol((await ctx.params).id, await parseBody(req, symbolPatchSchema))));

export const DELETE = (_req: Request, ctx: Ctx) =>
  handle(async () => {
    await deleteSymbol((await ctx.params).id);
    return noContent();
  });
