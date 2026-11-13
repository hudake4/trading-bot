/**
 * Alpaca REST client (trading + market data) built on fetch, with no SDK dependency.
 * The API keys are read from environment variables by `server/connection.ts`, passed in here, sent
 * only to Alpaca as headers, and never included in any response, log line or database row.
 */
import { roundDecimalToCents } from "../domain/money";
import type { Bar } from "../domain/types";
import { BrokerError, nyDate, type Broker, type BrokerAccount, type BrokerClock, type BrokerPosition } from "./broker";

export interface AlpacaConfig {
  keyId: string;
  secretKey: string;
  paper: boolean;
  dataFeed: string;
}

const TRADING_PAPER = "https://paper-api.alpaca.markets";
const TRADING_LIVE = "https://api.alpaca.markets";
const DATA = "https://data.alpaca.markets";

interface RawAccount {
  equity: string;
  last_equity: string;
  cash: string;
  buying_power: string;
  trading_blocked: boolean;
  account_blocked: boolean;
}

interface RawPosition {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
}

interface RawBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

const cents = (value: string | undefined): number => roundDecimalToCents(value ?? "") ?? 0;

export class AlpacaBroker implements Broker {
  readonly kind = "alpaca" as const;
  readonly paper: boolean;
  readonly dataFeed: string;
  private readonly tradingBase: string;

  constructor(
    private readonly config: AlpacaConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.paper = config.paper;
    this.dataFeed = config.dataFeed;
    this.tradingBase = config.paper ? TRADING_PAPER : TRADING_LIVE;
  }

  private async request<T>(base: string, path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${base}${path}`, {
        ...init,
        headers: {
          "APCA-API-KEY-ID": this.config.keyId,
          "APCA-API-SECRET-KEY": this.config.secretKey,
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
        cache: "no-store",
      });
    } catch {
      throw new BrokerError("Could not reach Alpaca. Check your internet connection.");
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new BrokerError(
          `Alpaca rejected the API keys (HTTP ${res.status}). Check ALPACA_API_KEY and ALPACA_SECRET_KEY in .env, and that they match ALPACA_PAPER.`,
          res.status,
        );
      }
      const detail = (body as { message?: string } | null)?.message;
      throw new BrokerError(`Alpaca error (HTTP ${res.status})${detail ? `: ${detail}` : "."}`, res.status);
    }
    return body as T;
  }

  private trading<T>(path: string, init?: RequestInit) {
    return this.request<T>(this.tradingBase, `/v2${path}`, init);
  }

  async getAccount(): Promise<BrokerAccount> {
    const a = await this.trading<RawAccount>("/account");
    return {
      equityCents: cents(a.equity),
      cashCents: cents(a.cash),
      buyingPowerCents: cents(a.buying_power),
      lastEquityCents: cents(a.last_equity),
      blocked: a.trading_blocked || a.account_blocked,
    };
  }

  async getPositions(): Promise<BrokerPosition[]> {
    const rows = await this.trading<RawPosition[]>("/positions");
    return rows.map((p) => ({
      symbol: p.symbol,
      qty: Number(p.qty),
      avgEntryCents: cents(p.avg_entry_price),
      currentPriceCents: cents(p.current_price),
      marketValueCents: cents(p.market_value),
      unrealizedPlCents: cents(p.unrealized_pl),
      unrealizedPlPct: Number(p.unrealized_plpc),
    }));
  }

  async getClock(): Promise<BrokerClock> {
    const c = await this.trading<{ timestamp: string; is_open: boolean; next_open: string; next_close: string }>("/clock");
    return { isOpen: c.is_open, now: c.timestamp, nextOpen: c.next_open, nextClose: c.next_close };
  }

  async getBars(symbols: string[], days: number): Promise<Record<string, Bar[]>> {
    const out: Record<string, Bar[]> = Object.fromEntries(symbols.map((s) => [s, []]));
    const start = new Date(Date.now() - days * 86_400_000).toISOString();
    let pageToken: string | null = null;
    do {
      const query = new URLSearchParams({
        symbols: symbols.join(","),
        timeframe: "1Day",
        start,
        adjustment: "all",
        feed: this.config.dataFeed,
        limit: "10000",
        sort: "asc",
      });
      if (pageToken) query.set("page_token", pageToken);
      const page: { bars: Record<string, RawBar[]> | null; next_page_token: string | null } = await this.request(
        DATA,
        `/v2/stocks/bars?${query.toString()}`,
      );
      for (const [symbol, rows] of Object.entries(page.bars ?? {})) {
        for (const r of rows) {
          if ([r.o, r.h, r.l, r.c].every(Number.isFinite)) {
            // Daily bars are stamped at midnight New York time; take that session date.
            (out[symbol] ??= []).push({ date: nyDate(r.t), open: r.o, high: r.h, low: r.l, close: r.c, volume: r.v });
          }
        }
      }
      pageToken = page.next_page_token;
    } while (pageToken);
    return out;
  }

  async getEquityHistory(days: number): Promise<{ date: string; equityCents: number }[]> {
    const period = days <= 31 ? "1M" : days <= 93 ? "3M" : days <= 186 ? "6M" : "1A";
    const h = await this.trading<{ timestamp: number[]; equity: (number | null)[] }>(
      `/account/portfolio/history?period=${period}&timeframe=1D`,
    );
    const out: { date: string; equityCents: number }[] = [];
    h.timestamp.forEach((ts, i) => {
      const equity = h.equity[i];
      if (equity && equity > 0) out.push({ date: nyDate(new Date(ts * 1000)), equityCents: Math.round(equity * 100) });
    });
    return out;
  }

  async getOpenOrderCount(symbol: string): Promise<number> {
    const query = new URLSearchParams({ status: "open", symbols: symbol, limit: "100" });
    const rows = await this.trading<unknown[]>(`/orders?${query.toString()}`);
    return rows.length;
  }

  async buyWithStop(symbol: string, qty: number, stopPriceCents: number): Promise<{ id: string }> {
    const stop = `${Math.floor(stopPriceCents / 100)}.${String(stopPriceCents % 100).padStart(2, "0")}`;
    const order = await this.trading<{ id: string }>("/orders", {
      method: "POST",
      body: JSON.stringify({
        symbol,
        qty: String(qty),
        side: "buy",
        type: "market",
        time_in_force: "gtc",
        order_class: "oto", // the stop-loss is created once the buy fills
        stop_loss: { stop_price: stop },
      }),
    });
    return { id: order.id };
  }

  async closePosition(symbol: string): Promise<void> {
    const query = new URLSearchParams({ status: "open", symbols: symbol, limit: "100" });
    const open = await this.trading<{ id: string }[]>(`/orders?${query.toString()}`);
    for (const order of open) {
      await this.trading<void>(`/orders/${encodeURIComponent(order.id)}`, { method: "DELETE" });
    }
    await this.trading<void>(`/positions/${encodeURIComponent(symbol)}`, { method: "DELETE" });
  }

  async symbolExists(symbol: string): Promise<boolean> {
    try {
      const asset = await this.trading<{ tradable: boolean; status: string }>(`/assets/${encodeURIComponent(symbol)}`);
      return asset.tradable && asset.status === "active";
    } catch (err) {
      if (err instanceof BrokerError && err.status === 404) return false;
      throw err;
    }
  }
}
