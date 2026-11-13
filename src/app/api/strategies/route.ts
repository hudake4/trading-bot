import { handle, json } from "@/server/http";
import { getStrategiesResponse } from "@/server/repositories/strategies";

export const dynamic = "force-dynamic";

export const GET = () => handle(async () => json(await getStrategiesResponse()));
