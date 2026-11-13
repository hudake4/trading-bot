import { describe, expect, it } from "vitest";
import { roundDecimalToCents } from "@/domain/money";
import { AlpacaBroker } from "@/server/alpaca";
import { BrokerError, minutesSinceOpen, nyDate } from "@/server/broker";
import { DemoBroker } from "@/server/demo-broker";

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** A fake fetch that answers from a queue and records what was sent. */
function mockFetch(responses: { status?: number; body?: unknown }[]) {
  const sent: Recorded[] = [];
  const impl = (async (url: string, init: RequestInit = {}) => {
    sent.push({
      url,
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const next = responses.shift() ?? { status: 500, body: { message: "no response queued" } };
    const status = next.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(next.body ?? null), { status });
  }) as unknown as typeof fetch;
  return { sent, impl };
}

const KEY = "PKTESTKEY";
const SECRET = "supersecretvalue";
const make = (fetchImpl: typeof fetch, paper = true) =>
  new AlpacaBroker({ keyId: KEY, secretKey: SECRET, paper, dataFeed: "iex" }, fetchImpl);

describe("roundDecimalToCents", () => {
  it.each([
    ["100000", 10_000_000],
    ["12.99", 1299],
    ["0.1", 10],
    ["100000.4213", 10_000_042],
    ["1.005", 101],
    ["-5.678", -568],
    ["0", 0],
  ])("%s -> %i", (input, cents) => expect(roundDecimalToCents(input)).toBe(cents));

  it.each(["", "abc", "1,000.00", "1e5", "--1"])("rejects %j", (input) => expect(roundDecimalToCents(input)).toBeNull());
});

describe("AlpacaBroker", () => {
  it("authenticates with the key headers and targets the paper or live host", async () => {
    const paper = mockFetch([{ body: { timestamp: "t", is_open: true, next_open: "o", next_close: "c" } }]);
    await make(paper.impl, true).getClock();
    expect(paper.sent[0].url).toBe("https://paper-api.alpaca.markets/v2/clock");
    expect(paper.sent[0].headers).toMatchObject({ "APCA-API-KEY-ID": KEY, "APCA-API-SECRET-KEY": SECRET });

    const live = mockFetch([{ body: { timestamp: "t", is_open: false, next_open: "o", next_close: "c" } }]);
    await make(live.impl, false).getClock();
    expect(live.sent[0].url).toBe("https://api.alpaca.markets/v2/clock");
  });

  it("converts account and position strings to integer cents", async () => {
    const { impl } = mockFetch([
      { body: { equity: "100000.4213", last_equity: "99000", cash: "50000.50", buying_power: "200000", trading_blocked: false, account_blocked: true } },
      { body: [{ symbol: "AAPL", qty: "10", avg_entry_price: "150.1", current_price: "155.55", market_value: "1555.50", unrealized_pl: "54.50", unrealized_plpc: "0.0363" }] },
    ]);
    const broker = make(impl);
    expect(await broker.getAccount()).toEqual({
      equityCents: 10_000_042,
      cashCents: 5_000_050,
      buyingPowerCents: 20_000_000,
      lastEquityCents: 9_900_000,
      blocked: true,
    });
    expect(await broker.getPositions()).toEqual([
      { symbol: "AAPL", qty: 10, avgEntryCents: 15_010, currentPriceCents: 15_555, marketValueCents: 155_550, unrealizedPlCents: 5450, unrealizedPlPct: 0.0363 },
    ]);
  });

  it("pages through bars and converts timestamps to New York session dates", async () => {
    const bar = (t: string, c: number) => ({ t, o: c, h: c + 1, l: c - 1, c, v: 100 });
    const { sent, impl } = mockFetch([
      { body: { bars: { AAPL: [bar("2025-01-02T05:00:00Z", 100)] }, next_page_token: "abc" } },
      { body: { bars: { AAPL: [bar("2025-07-01T04:00:00Z", 110)] }, next_page_token: null } }, // daylight time: 04:00Z is midnight NY
    ]);
    const bars = await make(impl).getBars(["AAPL", "MSFT"], 400);
    expect(bars.AAPL.map((b) => b.date)).toEqual(["2025-01-02", "2025-07-01"]);
    expect(bars.MSFT).toEqual([]);
    expect(sent).toHaveLength(2);
    const first = new URL(sent[0].url);
    expect(first.hostname).toBe("data.alpaca.markets");
    expect(first.searchParams.get("symbols")).toBe("AAPL,MSFT");
    expect(first.searchParams.get("adjustment")).toBe("all");
    expect(first.searchParams.get("feed")).toBe("iex");
    expect(new URL(sent[1].url).searchParams.get("page_token")).toBe("abc");
  });

  it("buys with a stop-loss as a one-triggers-other order", async () => {
    const { sent, impl } = mockFetch([{ body: { id: "order-9" } }]);
    const res = await make(impl).buyWithStop("AAPL", 7, 19_005);
    expect(res).toEqual({ id: "order-9" });
    expect(sent[0]).toMatchObject({
      url: "https://paper-api.alpaca.markets/v2/orders",
      method: "POST",
      body: { symbol: "AAPL", qty: "7", side: "buy", type: "market", time_in_force: "gtc", order_class: "oto", stop_loss: { stop_price: "190.05" } },
    });
  });

  it("cancels the symbol's open orders before closing the position", async () => {
    const { sent, impl } = mockFetch([{ body: [{ id: "stop-1" }, { id: "stop-2" }] }, { status: 204 }, { status: 204 }, { body: { id: "x" } }]);
    await make(impl).closePosition("AAPL");
    expect(sent.map((s) => `${s.method} ${new URL(s.url).pathname}`)).toEqual([
      "GET /v2/orders",
      "DELETE /v2/orders/stop-1",
      "DELETE /v2/orders/stop-2",
      "DELETE /v2/positions/AAPL",
    ]);
  });

  it("builds equity history from the portfolio endpoint, skipping empty days", async () => {
    const epoch = (iso: string) => Date.parse(iso) / 1000;
    const { impl } = mockFetch([
      { body: { timestamp: [epoch("2025-01-01T14:30:00Z"), epoch("2025-01-02T14:30:00Z"), epoch("2025-01-03T14:30:00Z")], equity: [0, 100_000.5, null] } },
    ]);
    expect(await make(impl).getEquityHistory(90)).toEqual([{ date: "2025-01-02", equityCents: 10_000_050 }]);
  });

  it("checks that a ticker exists and is tradable", async () => {
    const found = mockFetch([{ body: { tradable: true, status: "active" } }]);
    expect(await make(found.impl).symbolExists("AAPL")).toBe(true);
    const missing = mockFetch([{ status: 404, body: { message: "asset not found" } }]);
    expect(await make(missing.impl).symbolExists("ZZZZ")).toBe(false);
    const halted = mockFetch([{ body: { tradable: false, status: "inactive" } }]);
    expect(await make(halted.impl).symbolExists("OLD")).toBe(false);
  });

  describe("errors", () => {
    it("explains bad keys without leaking them", async () => {
      const err = await make(mockFetch([{ status: 401, body: { message: "forbidden" } }]).impl).getAccount().catch((e) => e);
      expect(err).toBeInstanceOf(BrokerError);
      expect(err.message).toMatch(/rejected the API keys/);
      expect(err.message).not.toContain(KEY);
      expect(err.message).not.toContain(SECRET);
    });

    it("passes through Alpaca's own message on other failures", async () => {
      const err = await make(mockFetch([{ status: 422, body: { message: "insufficient buying power" } }]).impl).buyWithStop("AAPL", 1, 100).catch((e) => e);
      expect(err.message).toBe("Alpaca error (HTTP 422): insufficient buying power");
    });

    it("reports an unreachable network", async () => {
      const failing = (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch;
      await expect(make(failing).getClock()).rejects.toThrow(/Could not reach Alpaca/);
    });
  });
});

describe("New York time helpers", () => {
  it("nyDate uses the New York calendar day", () => {
    expect(nyDate("2025-06-13T02:00:00Z")).toBe("2025-06-12"); // still evening of the 12th in New York
    expect(nyDate("2025-06-13T14:00:00Z")).toBe("2025-06-13");
  });

  it("minutesSinceOpen counts from 9:30 New York, across daylight saving", () => {
    expect(minutesSinceOpen("2025-06-13T13:30:00Z")).toBe(0); // EDT
    expect(minutesSinceOpen("2025-06-13T14:00:00Z")).toBe(30);
    expect(minutesSinceOpen("2025-01-13T14:35:00Z")).toBe(5); // EST
    expect(minutesSinceOpen("2025-06-13T12:00:00Z")).toBeLessThan(0);
  });
});

describe("DemoBroker", () => {
  const broker = () => new DemoBroker(() => new Date("2025-06-13T14:00:00Z"));

  it("serves deterministic synthetic bars ending on the last weekday", async () => {
    const a = (await broker().getBars(["TSLA"], 365)).TSLA;
    const b = (await broker().getBars(["TSLA"], 365)).TSLA;
    expect(a).toEqual(b);
    expect(a[a.length - 1].date).toBe("2025-06-13");
    expect(a.length).toBeGreaterThan(240);
    expect(a.every((x) => x.low <= Math.min(x.open, x.close) && x.high >= Math.max(x.open, x.close))).toBe(true);
  });

  it("simulates buys and sells against its own account", async () => {
    const demo = broker();
    const before = await demo.getAccount();
    await demo.buyWithStop("TSLA", 10);
    const held = (await demo.getPositions()).find((p) => p.symbol === "TSLA")!;
    expect(held.qty).toBe(10);
    await demo.closePosition("TSLA");
    expect((await demo.getPositions()).some((p) => p.symbol === "TSLA")).toBe(false);
    // Round trip at the same price changes nothing.
    expect((await demo.getAccount()).equityCents).toBe(before.equityCents);
  });

  it("says it is the demo and never live", () => {
    expect(broker()).toMatchObject({ kind: "demo", paper: true });
  });
});
