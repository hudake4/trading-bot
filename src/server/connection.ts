/**
 * Chooses the broker from environment variables: Alpaca when both keys are set, otherwise the demo
 * broker. Cached on globalThis so the demo account survives Next.js hot reloads and the scheduler
 * and the API routes share one instance. Tests swap it with `setBrokerForTests`.
 */
import type { ConnectionDTO } from "../contracts/api";
import { AlpacaBroker } from "./alpaca";
import type { Broker } from "./broker";
import { DemoBroker } from "./demo-broker";

const globalForBroker = globalThis as unknown as { __tradedeskBroker?: Broker };

function fromEnvironment(): Broker {
  const keyId = process.env.ALPACA_API_KEY?.trim();
  const secretKey = process.env.ALPACA_SECRET_KEY?.trim();
  if (!keyId || !secretKey) return new DemoBroker();
  const feed = (process.env.ALPACA_DATA_FEED ?? "iex").trim().toLowerCase();
  return new AlpacaBroker({
    keyId,
    secretKey,
    paper: (process.env.ALPACA_PAPER ?? "true").trim().toLowerCase() !== "false",
    dataFeed: feed === "sip" ? "sip" : "iex",
  });
}

export function getBroker(): Broker {
  return (globalForBroker.__tradedeskBroker ??= fromEnvironment());
}

export function setBrokerForTests(broker: Broker | undefined) {
  globalForBroker.__tradedeskBroker = broker;
}

export function connectionInfo(broker: Broker = getBroker()): ConnectionDTO {
  return { mode: broker.kind, paper: broker.paper, dataFeed: broker.dataFeed };
}

/** Real money: an Alpaca account that is not the paper account. */
export function isLive(broker: Broker = getBroker()): boolean {
  return broker.kind === "alpaca" && !broker.paper;
}
