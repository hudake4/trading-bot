/**
 * Built-in demo broker, used when no Alpaca keys are configured. Prices are synthetic (a seeded
 * random walk per ticker, identical on every run) and the account is simulated in memory, so the
 * whole app can be explored without an Alpaca account. It never touches the network and its
 * numbers say nothing about real markets. State resets when the server restarts.
 */
import { addDays } from "../domain/dates";
import type { Bar } from "../domain/types";
import { nyDate, type Broker, type BrokerAccount, type BrokerClock, type BrokerPosition } from "./broker";

const START_CASH_CENTS = 10_000_000; // $100,000
const HISTORY_YEARS = 12;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** mulberry32: small seeded PRNG. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lastWeekday(date: string): string {
  let d = date;
  for (;;) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) return d;
    d = addDays(d, -1);
  }
}

/** Every weekday from the start date through `end`, oldest first. */
function weekdaysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d);
  }
  return out;
}

const barCache = new Map<string, Bar[]>();

/** Deterministic synthetic history for a ticker, ending on the most recent weekday. */
function history(symbol: string, today: string): Bar[] {
  const end = lastWeekday(today);
  const key = `${symbol}:${end}`;
  const cached = barCache.get(key);
  if (cached) return cached;

  const rand = rng(hash(symbol));
  const gaussian = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const drift = 0.0001 + rand() * 0.0006;
  const vol = 0.011 + rand() * 0.012;
  let close = 40 + rand() * 260;
  const dates = weekdaysBetween(addDays(end, -HISTORY_YEARS * 365), end);
  const bars = dates.map((date) => {
    const open = close * (1 + gaussian() * 0.003);
    close = close * Math.exp(drift + vol * gaussian());
    const high = Math.max(open, close) * (1 + Math.abs(gaussian()) * 0.004);
    const low = Math.min(open, close) * (1 - Math.abs(gaussian()) * 0.004);
    return { date, open, high, low, close, volume: Math.round(1_000_000 + rand() * 4_000_000) };
  });
  barCache.set(key, bars);
  return bars;
}

interface DemoState {
  cashCents: number;
  positions: Map<string, { qty: number; avgEntryCents: number }>;
}

export class DemoBroker implements Broker {
  readonly kind = "demo" as const;
  readonly paper = true;
  readonly dataFeed = "demo";
  private readonly state: DemoState;

  constructor(private readonly now: () => Date = () => new Date()) {
    this.state = { cashCents: START_CASH_CENTS, positions: new Map() };
    // Start with a few positions so the dashboard has something to show.
    for (const [symbol, qty] of [["AAPL", 20], ["MSFT", 10], ["NVDA", 15]] as const) {
      const price = this.priceCents(symbol);
      this.state.positions.set(symbol, { qty, avgEntryCents: Math.round(price * 0.93) });
      this.state.cashCents -= Math.round(price * 0.93) * qty;
    }
  }

  private today(): string {
    return nyDate(this.now());
  }

  private priceCents(symbol: string): number {
    const bars = history(symbol, this.today());
    return Math.round(bars[bars.length - 1].close * 100);
  }

  private equityCents(): number {
    let total = this.state.cashCents;
    for (const [symbol, p] of this.state.positions) total += p.qty * this.priceCents(symbol);
    return total;
  }

  async getAccount(): Promise<BrokerAccount> {
    const equity = this.equityCents();
    return {
      equityCents: equity,
      cashCents: this.state.cashCents,
      buyingPowerCents: this.state.cashCents,
      lastEquityCents: Math.round(equity * 0.998),
      blocked: false,
    };
  }

  async getPositions(): Promise<BrokerPosition[]> {
    return [...this.state.positions].map(([symbol, p]) => {
      const price = this.priceCents(symbol);
      const value = p.qty * price;
      const pl = value - p.qty * p.avgEntryCents;
      return {
        symbol,
        qty: p.qty,
        avgEntryCents: p.avgEntryCents,
        currentPriceCents: price,
        marketValueCents: value,
        unrealizedPlCents: pl,
        unrealizedPlPct: pl / (p.qty * p.avgEntryCents),
      };
    });
  }

  async getClock(): Promise<BrokerClock> {
    const now = this.now();
    // The demo market is always open so "Run now" and the scheduler can be tried at any hour.
    return {
      isOpen: true,
      now: now.toISOString(),
      nextOpen: new Date(now.getTime() + 86_400_000).toISOString(),
      nextClose: new Date(now.getTime() + 3_600_000).toISOString(),
    };
  }

  async getBars(symbols: string[], days: number): Promise<Record<string, Bar[]>> {
    const from = addDays(this.today(), -days);
    return Object.fromEntries(symbols.map((s) => [s, history(s, this.today()).filter((b) => b.date >= from)]));
  }

  async getEquityHistory(days: number): Promise<{ date: string; equityCents: number }[]> {
    const end = this.equityCents();
    const dates = weekdaysBetween(addDays(this.today(), -days), lastWeekday(this.today()));
    const rand = rng(hash("equity"));
    // Walk backwards from today's equity so the curve ends where the account actually is.
    const values: number[] = [end];
    for (let i = dates.length - 1; i > 0; i--) values.unshift(Math.round(values[0] / (1 + (rand() - 0.46) * 0.012)));
    return dates.map((date, i) => ({ date, equityCents: values[i] }));
  }

  async getOpenOrderCount(): Promise<number> {
    return 0; // simulated orders fill immediately
  }

  async buyWithStop(symbol: string, qty: number): Promise<{ id: string }> {
    const price = this.priceCents(symbol);
    const existing = this.state.positions.get(symbol);
    const total = (existing?.qty ?? 0) + qty;
    const avg = Math.round(((existing?.qty ?? 0) * (existing?.avgEntryCents ?? 0) + qty * price) / total);
    this.state.positions.set(symbol, { qty: total, avgEntryCents: avg });
    this.state.cashCents -= qty * price;
    return { id: `demo-${symbol}-${this.now().getTime()}` };
  }

  async closePosition(symbol: string): Promise<void> {
    const p = this.state.positions.get(symbol);
    if (!p) return;
    this.state.cashCents += p.qty * this.priceCents(symbol);
    this.state.positions.delete(symbol);
  }

  async symbolExists(symbol: string): Promise<boolean> {
    return /^[A-Z]{1,5}([.-][A-Z])?$/.test(symbol);
  }
}
