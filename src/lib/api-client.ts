/** Typed client for the TradeDesk API. Mirrors src/contracts/api.ts. */
import type {
  AccountResponse,
  ActivityResponse,
  AnalyzeResponse,
  ApiErrorBody,
  ApiErrorCode,
  BacktestRequest,
  BacktestResponse,
  BotRunDTO,
  BotStatusDTO,
  SettingsDTO,
  SettingsPatch,
  SignalDTO,
  StrategiesResponse,
  SymbolDTO,
  SymbolPatch,
} from "@/contracts/api";
import type { StrategyId } from "@/domain/strategies";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | "NETWORK_ERROR";
  readonly fieldErrors: Record<string, string[]>;

  constructor(status: number, code: ApiErrorCode | "NETWORK_ERROR", message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors ?? {};
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === "object" && value !== null && "error" in value && typeof (value as ApiErrorBody).error?.message === "string";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Accept: "application/json", ...init?.headers },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the app server. Is it still running?");
  }
  if (res.status === 204) return undefined as T;

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    if (isApiErrorBody(body)) throw new ApiError(res.status, body.error.code, body.error.message, body.error.fieldErrors);
    const code: ApiErrorCode = res.status === 404 ? "NOT_FOUND" : res.status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST";
    throw new ApiError(res.status, code, res.status === 404 ? "Not found." : `Request failed (${res.status}).`);
  }
  return body as T;
}

const json = (method: string, data?: unknown): RequestInit => ({
  method,
  body: data === undefined ? undefined : JSON.stringify(data),
});

export const api = {
  getSettings: () => request<SettingsDTO>("/settings"),
  patchSettings: (patch: SettingsPatch) => request<SettingsDTO>("/settings", json("PATCH", patch)),

  getStrategies: () => request<StrategiesResponse>("/strategies"),
  saveStrategyParams: (id: StrategyId, params: Record<string, number>) =>
    request<StrategiesResponse>(`/strategies/${id}`, json("PUT", { params })),
  resetStrategyParams: (id: StrategyId) => request<StrategiesResponse>(`/strategies/${id}`, json("DELETE")),

  listSymbols: () => request<SymbolDTO[]>("/symbols"),
  addSymbol: (symbol: string, strategyId?: StrategyId | null) => request<SymbolDTO>("/symbols", json("POST", { symbol, strategyId })),
  patchSymbol: (id: string, patch: SymbolPatch) => request<SymbolDTO>(`/symbols/${encodeURIComponent(id)}`, json("PATCH", patch)),
  removeSymbol: (id: string) => request<void>(`/symbols/${encodeURIComponent(id)}`, json("DELETE")),
  getSignals: () => request<SignalDTO[]>("/signals"),

  getAccount: () => request<AccountResponse>("/account"),
  analyze: (symbol: string, days: number, strategyId?: StrategyId) => {
    const qs = new URLSearchParams({ symbol, days: String(days) });
    if (strategyId) qs.set("strategyId", strategyId);
    return request<AnalyzeResponse>(`/analyze?${qs.toString()}`);
  },
  backtest: (input: Omit<BacktestRequest, "costBps"> & { costBps?: number }) => request<BacktestResponse>("/backtest", json("POST", input)),

  getBotStatus: () => request<BotStatusDTO>("/bot"),
  runBot: (dryRun?: boolean) => request<BotRunDTO>("/bot/run", json("POST", dryRun === undefined ? {} : { dryRun })),
  getActivity: () => request<ActivityResponse>("/activity"),

  resetAllData: () => request<{ ok: true }>("/data/reset", json("POST")),
};

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
