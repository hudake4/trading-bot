import type { Bar } from "@/domain/types";
import type { Broker, BrokerAccount, BrokerClock, BrokerPosition } from "@/server/broker";
import { barsFromCloses, rng } from "./bars";

export interface FakeOptions {
  bars?: Record<string, Bar[]>;
  /** symbol -> shares already held */
  positions?: Record<string, number>;
  /** symbols with an open order */
  openOrders?: string[];
  equityCents?: number;
  paper?: boolean;
  blocked?: boolean;
  /** Instant the broker's clock reports. The default is the morning after the fixture bars end. */
  now?: string;
  failBuys?: string[];
}

export class FakeBroker implements Broker {
  readonly kind = "alpaca" as const;
  readonly paper: boolean;
  readonly dataFeed = "iex";
  /** Every mutating call, in order: ["buy", symbol, qty, stopCents] or ["close", symbol]. */
  readonly calls: (string | number)[][] = [];

  constructor(private readonly opts: FakeOptions = {}) {
    this.paper = opts.paper ?? true;
  }

  async getAccount(): Promise<BrokerAccount> {
    const equity = this.opts.equityCents ?? 10_000_000;
    return { equityCents: equity, cashCents: equity, buyingPowerCents: equity, lastEquityCents: equity, blocked: this.opts.blocked ?? false };
  }

  async getPositions(): Promise<BrokerPosition[]> {
    return Object.entries(this.opts.positions ?? {}).map(([symbol, qty]) => ({
      symbol,
      qty,
      avgEntryCents: 10_000,
      currentPriceCents: 10_000,
      marketValueCents: qty * 10_000,
      unrealizedPlCents: 0,
      unrealizedPlPct: 0,
    }));
  }

  async getClock(): Promise<BrokerClock> {
    const now = this.opts.now ?? "2025-06-13T14:00:00Z"; // 10:00 New York
    return { isOpen: true, now, nextOpen: now, nextClose: now };
  }

  async getBars(symbols: string[]): Promise<Record<string, Bar[]>> {
    return Object.fromEntries(symbols.filter((s) => this.opts.bars?.[s]).map((s) => [s, this.opts.bars![s]]));
  }

  async getEquityHistory() {
    return [];
  }

  async getOpenOrderCount(symbol: string) {
    return this.opts.openOrders?.includes(symbol) ? 1 : 0;
  }

  async buyWithStop(symbol: string, qty: number, stopPriceCents: number) {
    if (this.opts.failBuys?.includes(symbol)) throw new Error("insufficient buying power");
    this.calls.push(["buy", symbol, qty, stopPriceCents]);
    return { id: "order-1" };
  }

  async closePosition(symbol: string) {
    this.calls.push(["close", symbol]);
  }

  async symbolExists(symbol: string) {
    return symbol !== "ZZZZ";
  }
}

/**
 * Noisy daily bars that trend up (trend > 0) or down, ending 2025-06-12. A short pullback at the end
 * keeps an uptrend from also sitting at an RSI extreme, which the default trend strategy treats as
 * overbought.
 */
export function trendBars(trend: number, n = 300, seed = 7): Bar[] {
  const rand = rng(seed);
  const gaussian = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const noise = Array.from({ length: n }, () => 0.012 * gaussian());
  for (let i = n - 5; i < n; i++) noise[i] = -0.01;
  let close = 100;
  return barsFromCloses(noise.map((e) => (close *= Math.exp(trend + e))));
}
