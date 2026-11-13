/**
 * The seam between the app and a brokerage. The bot, analysis and API only ever talk to `Broker`,
 * so they run unchanged against Alpaca, the built-in demo broker, or a fake in tests.
 */
import type { ConnectionDTO } from "../contracts/api";
import type { Bar } from "../domain/types";

export class BrokerError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "BrokerError";
  }
}

export interface BrokerAccount {
  equityCents: number;
  cashCents: number;
  buyingPowerCents: number;
  lastEquityCents: number;
  blocked: boolean;
}

export interface BrokerPosition {
  symbol: string;
  qty: number;
  avgEntryCents: number;
  currentPriceCents: number;
  marketValueCents: number;
  unrealizedPlCents: number;
  unrealizedPlPct: number;
}

export interface BrokerClock {
  isOpen: boolean;
  /** Current broker time, ISO 8601. */
  now: string;
  nextOpen: string;
  nextClose: string;
}

export interface Broker {
  readonly kind: ConnectionDTO["mode"];
  readonly paper: boolean;
  readonly dataFeed: string;

  getAccount(): Promise<BrokerAccount>;
  getPositions(): Promise<BrokerPosition[]>;
  getClock(): Promise<BrokerClock>;
  /** Completed and in-progress daily bars covering roughly the last `days` calendar days. */
  getBars(symbols: string[], days: number): Promise<Record<string, Bar[]>>;
  /** Equity at each close over about the last `days` calendar days. */
  getEquityHistory(days: number): Promise<{ date: string; equityCents: number }[]>;
  getOpenOrderCount(symbol: string): Promise<number>;
  /** Market buy of whole shares with a server-side protective stop that triggers once filled. */
  buyWithStop(symbol: string, qty: number, stopPriceCents: number): Promise<{ id: string }>;
  /** Cancels the symbol's open orders (the stop reserves the shares) and sells the whole position. */
  closePosition(symbol: string): Promise<void>;
  symbolExists(symbol: string): Promise<boolean>;
}

/** New York calendar date for an instant. */
export function nyDate(instant: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(instant));
}

/** Minutes after 09:30 New York time at the given instant (negative before the open). */
export function minutesSinceOpen(instant: Date | string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  return hour * 60 + minute - (9 * 60 + 30);
}
