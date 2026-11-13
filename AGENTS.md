# AGENTS.md

TradeDesk is a local, private Next.js app for stock analysis, backtesting and an Alpaca trading bot with switchable strategies. The owner may connect a real Alpaca account, so treat anything near orders as safety-critical.

- Use Node from `.nvmrc`. Fresh checkout: `npm ci`, `cp .env.example .env`, `npm run db:deploy`.
- Before you finish: `npm run typecheck`, `npm run lint`, `npm test`.
- `prisma/dev.db` holds the owner's watchlist and bot history. Never reset it, `migrate dev` or `db push` against it. `scripts/screenshots.mjs` resets the database it points at, so only run it against a throwaway one.
- Migrations are forward-only and additive: `prisma migrate dev --create-only`, read the SQL, `npm run db:deploy`.
- Rules: [docs/CONVENTIONS.md](docs/CONVENTIONS.md). Setup and commands: [README.md](README.md). A changed rule changes doc, code and tests together.
- Never store, log or return Alpaca keys. Never weaken a safety default (dry run on, bot off, live needs `LIVE` confirmation) without the owner asking.
- Money is integer cents; strategies stay pure and causal (tested for every registered strategy).
- Reuse the shared primitives in `src/components/ui`. UI changes: look at screenshots in light and dark.
- Use `next start` (production) rather than `next dev` for browser verification; the dev server's manifest reads can flake under rapid edits.
- Conventional Commits.
