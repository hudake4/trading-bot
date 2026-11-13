# TradeDesk

A local, single-user app to analyze stocks, backtest strategies, and run an [Alpaca](https://alpaca.markets) trading bot, where **you choose which strategy the bot follows, any time, from the UI**. Built on the same stack and design as CashFlow Planner.

> **Not financial advice.** The strategies are simple, rule-based examples. Backtests are hypothetical, and past performance does not predict future results. Trading can lose money. Run on a paper account for a good while before even considering real money.

- Runs entirely on your machine at **http://localhost:3100** (CashFlow Planner uses 3000, so both can run together).
- No accounts, no analytics. The only network calls are to Alpaca, and only with your keys.
- **Demo mode:** with no Alpaca keys configured, the app runs on synthetic prices and a simulated account so you can explore everything. It is labelled on every page, and its results mean nothing about real markets.

## Features

- **Dashboard:** account equity, today's change, cash and buying power, market open/closed, a 90-day equity chart (with a table alternative), open positions with unrealized P/L, and the bot's on/off switch and last run. **Run now** triggers a cycle immediately.
- **Strategies:** six switchable strategies. Pick the **default** the bot follows, tune each one's parameters (validated on the server), reset to defaults, and see which symbols are pinned to which. Changes apply on the next run, with no restart.
- **Watchlist:** the symbols the bot manages. Each follows the default strategy or is **pinned to its own**. Shows each symbol's current signal and what the bot would do right now (buy, sell, hold). Asking places no orders. Enable or disable symbols individually.
- **Analyze:** one ticker's price with 20/50-day averages and Bollinger bands, RSI, MACD, a snapshot (returns, volatility, drawdown, ATR) and what any strategy says today.
- **Backtest:** run several strategies against buy-and-hold on one stock, with costs, and compare return, Sharpe, drawdown, win rate and time in market. **Use as default** on any result row switches the bot to it.
- **Activity:** every bot run and its per-symbol decisions, including why something was skipped.
- **Settings:** connection status, bot limits (position size, stop-loss, max positions, delay after the open), dry-run, live-trading confirmation, dark mode, and data reset.

### Strategies

| Strategy | Style | Idea |
|---|---|---|
| Trend following | Trend | Long while the fast average is above the slow one, unless RSI is overbought |
| Momentum | Momentum | Long while the multi-month return is positive |
| Pullback buyer | Mean reversion | Buy sharp dips in uptrends, sell the bounce |
| Breakout | Breakout | Buy a new N-day high, sell a new M-day low |
| MACD crossover | Trend | Long while MACD is above its signal line |
| Buy and hold | Passive | Always long; the benchmark |

To add one, write a `StrategyDefinition` in `src/domain/strategies/definitions.ts`, add its id to `STRATEGY_IDS`, and list it in `index.ts`. The Strategies, Backtest and Watchlist pages and the bot all pick it up automatically.

## Prerequisites

- **Node.js 24 LTS** (24.22.1 or newer within Node 24) and npm. `.nvmrc` pins 24.22.1.
- No database server: SQLite lives in `prisma/dev.db`.

## Setup

```bash
npm ci                      # installs locked dependencies and generates the Prisma client
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
npm run db:deploy           # creates prisma/dev.db and applies migrations
```

### Connect Alpaca (optional)

1. Sign in at <https://app.alpaca.markets>, switch to the **Paper** account, and generate API keys.
2. Put them in `.env` as `ALPACA_API_KEY` and `ALPACA_SECRET_KEY`. Keep `ALPACA_PAPER=true`.
3. Restart the app. Settings now shows "Paper account".

Keys live only in `.env`. They are never stored in the database, returned by any API, or logged. The free plan serves the **IEX** data feed (`ALPACA_DATA_FEED=iex`); prices are fine for daily signals, volume is understated.

## Run

```bash
npm run dev      # development server on http://localhost:3100
# or
npm run build
npm start        # production server on http://localhost:3100
```

The app only runs on port 3100. If it's busy, startup stops with a clear message instead of switching ports.

## How the bot works

- **When:** once per trading day, a few minutes after the open (default 5), **only while this app is running**. If the PC sleeps or the app is closed, nothing trades (server-side stops stay live at Alpaca). Turn it on from the Dashboard or Settings.
- **What:** each enabled symbol follows its strategy (its pin, else the default). The bot reads **completed** daily bars only (today's partial bar is ignored so signals don't flicker) and trades the difference between the strategy's long/flat target and what you hold. A symbol with too little or stale data is skipped and the reason is logged.
- **Orders:** sells first (they free capital and slots), then buys sized to a share of equity in **whole shares**, each with a **server-side stop-loss** (a one-triggers-other order), so a crashed app can't leave a position unprotected. To sell, the bot first cancels the symbol's stop, then closes the position.
- **Limits:** position size (default 10% of equity), stop-loss (5%), max positions (5), no buy when an order for the symbol is already open, and no run on a blocked account.
- **Timing matches the backtest:** a signal on day *t*'s close is acted on at day *t+1*'s open.
- **Reliability:** a failed run is retried each minute, up to three times a day. Runs left "running" by a crash are marked as errors on the next start.

### Safety defaults

- **Dry run is on by default.** The bot logs what it would do until you turn it off.
- **The bot is off by default.**
- **Real money needs three things:** `ALPACA_PAPER=false` in `.env`, typing `LIVE` in Settings, and dry run turned off. Until you confirm, a live account only gets logged decisions, even if you press Run now. The Dashboard also asks before a manual run that places real orders.
- Demo mode simulates orders in memory and never touches the network.

## Test & quality checks

```bash
npm run typecheck          # TypeScript
npm run lint               # ESLint
npm run test:unit          # indicators, strategies, backtest, bot logic, Alpaca client (mocked fetch), demo broker
npm run test:integration   # API routes and the bot cycle against a separate test SQLite DB and a fake broker
npm test                   # everything
node scripts/screenshots.mjs   # with the app running: screenshots of every page, both themes and sizes, in test-evidence/
```

Integration tests use `prisma/test-integration.db` and never touch `prisma/dev.db`. Screenshots reset the dev database (they seed a small watchlist), so don't run them against data you want to keep.

## Architecture

```
src/
  contracts/api.ts      Zod schemas + typed API contract shared by server, UI and tests
  domain/               Pure, deterministic code (no I/O): indicators, strategies, backtest, analysis, bot rules
  server/               Prisma, repositories, Alpaca client, demo broker, bot cycle, scheduler, API helpers
  app/api/              Next.js route handlers (REST)
  app/                  Pages: / (dashboard), /strategies, /watchlist, /analyze, /backtest, /activity, /settings
  components/, lib/     UI components (shared primitives from CashFlow Planner) and the typed API client
  instrumentation.ts    Starts the scheduler when the server boots
prisma/                 schema.prisma and migrations
tests/                  unit and integration
docs/                   CONVENTIONS.md
```

The bot, Analyze and Backtest all talk to a `Broker` interface, so they run unchanged against Alpaca, the demo broker, or a fake in tests. Strategies and the backtester are pure functions of price bars, so the live bot evaluates exactly what you backtested.

## Known limitations

- Backtests assume fills at the next open plus a flat per-trade cost, with no taxes, partial fills or dividends beyond Alpaca's adjusted prices. Picking the best performer on past data overfits.
- Long-only, daily bars, whole shares, US equities.
- Alpaca calls are verified against a mocked `fetch` and the documented API; the app hasn't yet been run against a live Alpaca account, so test it on paper first.
