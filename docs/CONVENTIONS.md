# TradeDesk conventions

Rules that code, tests and docs must agree on. A changed rule changes all three together.

## 1. Money and numbers

- Account money (equity, cash, prices the bot trades on, order sizes) is **integer cents**. Never floats. Alpaca's decimal strings are converted with `roundDecimalToCents` (string arithmetic, half away from zero). `parseFloat` is banned by ESLint.
- Percentages that are settings are **integer basis points** (`positionBps`, `stopLossBps`).
- Hypothetical backtest equity and indicator values are plain numbers. They are never stored or traded on.
- Share quantities are whole numbers. `positionSize` uses integer math: `floor(floor(equity * bps / 10000) / price)`.

## 2. Dates and time

- Calendar dates are `YYYY-MM-DD` strings. Daily bars use the **New York session date**.
- "Today" comes from the broker's clock (`nyDate(clock.now)`), never from `Date.now()` inside `src/domain`.
- The bot runs once per New York trading day, at least `entryDelayMinutes` after 09:30 ET.

## 3. Strategies

- A strategy is a pure function of bars: `signals(bars, params)` returns one `0 | 1` per bar (1 = want long, 0 = flat). It may keep state while scanning, but a bar's signal depends only on that bar and earlier ones. **Causality is tested** for every registered strategy: signals on a prefix equal the prefix of signals on the full series.
- Each strategy declares its `params` (key, label, min, max, step, integer), `defaults`, optional `crossCheck`, and `warmup`. Validation lives in `validateParams`; the API and the UI both rely on it.
- Saved parameters that no longer validate fall back to the defaults (`resolveParams`).
- Settings holds the **default strategy**. A `WatchSymbol.strategyId` of null follows it; a value pins that symbol. The effective strategy is resolved per run, so changes apply on the next run with no restart.

## 4. Backtesting

- The signal on the close of day *t-1* is traded at the **open of day *t***. Each position change costs `costBps`.
- Signals are computed on the full fetched history (so indicators are warm), then the window is trimmed to the requested years. The benchmark starts at the same first bar as the window.
- The benchmark ("hold from day one") differs slightly from the *Buy and hold* strategy, which enters at the next open. They are labelled differently on purpose.

## 5. The bot

- Uses **completed bars only** (`date < today`). Too little history, or a latest bar older than 5 days, skips the symbol and records why.
- Order of operations: sells first, then buys. Buys need a free slot (`maxPositions`), no open order on the symbol, and at least one whole share within `positionBps` of equity.
- Every buy is a market order with a server-side stop-loss (an OTO order, GTC). A sell cancels the symbol's open orders first, because the stop reserves the shares.
- Every run is recorded as a `BotRun` with one `BotDecision` per symbol, including skips and failures.
- One run at a time. A second concurrent run is a 409.

## 6. Safety

- Alpaca keys come from environment variables only. They are never stored, returned by an API, or logged, and broker error messages never include them (tested).
- New installs have **dry run on** and the **bot off**.
- A live (real-money) account is blocked from placing orders until `liveAcknowledged` is set by typing `LIVE` in Settings. Until then runs are forced to dry run, even a manual one with `dryRun: false`.
- Demo mode (no keys) uses synthetic prices and a simulated in-memory account, and says so on every page.

## 7. Layering

- `src/domain` is pure: no Prisma, no I/O, no framework, no clock.
- `src/server` owns I/O. Repositories hold all Prisma access; routes only validate and call them.
- The UI never computes trading decisions. It renders what the API returns.

## 8. API

- Errors are `{ error: { code, message, fieldErrors? } }` with codes `VALIDATION_ERROR`, `NOT_FOUND`, `BAD_REQUEST`, `CONFLICT`, `UPSTREAM_ERROR` (Alpaca unreachable or rejected the request, 502), `INTERNAL_ERROR`.
- Endpoints: `GET/PATCH /api/settings`; `GET /api/strategies`, `PUT/DELETE /api/strategies/:id`; `GET/POST /api/symbols`, `PATCH/DELETE /api/symbols/:id`; `GET /api/signals`; `GET /api/account`; `GET /api/analyze`; `POST /api/backtest`; `GET /api/bot`, `POST /api/bot/run`; `GET /api/activity`; `POST /api/data/reset`.
- The shapes are in `src/contracts/api.ts`.

## 9. UI

Follows CashFlow Planner's visual contract: paper and ink surfaces, tabular numerals, one primary action per view, loading/empty/error states on every data view, sign and icon alongside color for gains and losses, charts with a readable summary and a table alternative, dark by default (`localStorage["tradedesk-theme"]`). Take screenshots in both themes at 1440×900 and 390×844 (`node scripts/screenshots.mjs`) before calling UI work done.
