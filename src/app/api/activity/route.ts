import { handle, json } from "@/server/http";
import { listRuns } from "@/server/repositories/runs";

export const dynamic = "force-dynamic";

export const GET = () => handle(async () => json({ runs: await listRuns(30) }));
