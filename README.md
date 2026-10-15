# TAB

Capped, expiring, revocable USDC allowances for AI agents on Solana. Agents pay x402 V2 services through TAB and never hold a wallet key. Non-custodial: funds sit in a token account owned by the user's wallet; TAB holds an SPL allowance capped at the limit.

**Solana Hackathon 2026 (x402 track):** see [`HACKATHON.md`](HACKATHON.md) for what's new since tag `hackathon-baseline`, how Solana powers TAB, and how failed payments are handled.

- **Spike result:** `docs/SPIKE-RESULT.md` (delegate-signed x402 passes on devnet)
- **Build tracker:** `PLAN.md`
- **Project rules / invariants:** `CLAUDE.md`
- **Design system:** `design/` (source) and the published design system artifact

## Layout

```
api/index.ts            Vercel function: all /api/* → Hono app
src/server/             API: config, db, pay engine, settlement, tabs, auth (SIWS), x402, demo paid API
src/web/                Vite + React site, docs and dashboard
packages/sdk/           @tabpaysi/sdk: new Tab({ credential, maxPayment }).fetch(url)
packages/mcp/           @tabpaysi/mcp: MCP server, agents pay x402 APIs from a tab (hackathon)
src/server/market*.ts   paid-API market: real x402 services at /api/market/* (hackathon)
db/migrations/          SQL migrations (applied in order, once)
tests/                  vitest on a real embedded Postgres (concurrency, crash injection, replay, errors)
scripts/e2e-devnet.ts   full devnet run against a local API: sign-in → open → agent pays → revoke → reclaim
scripts/e2e-market-devnet.ts  same, with a real MCP agent buying from the market (hackathon)
spike/                  step-0 delegate spike (devnet)
```

## Run locally (Windows PowerShell)

```powershell
npm ci
npm run dev:db      # terminal 1: local Postgres on 127.0.0.1:54329 (no Docker)
npm run dev:api     # terminal 2: API on :8787, runs migrations, reads TAB/.env
npm run dev:web     # terminal 3: site on http://localhost:5173 (proxies /api)
npm test            # 89 tests, starts its own throwaway Postgres
```

Agent over MCP, on devnet (with `dev:db` and `dev:api` running, `.env` on devnet with `DEMO_MERCHANT` set):

```powershell
npm run build:mcp
npm run e2e:market  # real MCP client -> MCP server -> TAB API -> market, real x402 settlement on devnet
```

macOS/Linux use the same commands. Run `dev:db`, `dev:api` and `dev:web` in separate terminals.

`.env` (gitignored) holds `DATABASE_URL`, `SOLANA_NETWORK`, `SOLANA_RPC_URL`, `ACCEPTED_MINTS`, `DELEGATE_PRIVATE_KEY`, `CREDENTIAL_HASH_SECRET`, `SESSION_SECRET`, `CRON_SECRET`, `APP_ORIGIN`, `DEMO_MERCHANT`. See `env.example`.

Market (optional): `MARKET_PAY_TO` (defaults to `DEMO_MERCHANT`), `MARKET_DATA_RPC_URL` (mainnet RPC for market data, defaults to the public one), `MARKET_ON_MAINNET=1` (off by default; on mainnet every market call is real money).

## Deploy (Vercel + Neon)

- Project `tab-agent` in team `1mplrs-projects`. `vercel.json` pins `framework: vite`, `npm ci --include=dev`.
- Env vars are pushed with `node scripts/vercel-env.mjs` (secrets generated once, local copy in `.env.vercel`, gitignored, never printed).
- Migrations: `npm run migrate` with `DATABASE_URL` set to the Neon **pooled** URL.
- `package.json` overrides `uuid@9.0.1` under `rpc-websockets`: Vercel's runtime can't `require()` the ESM-only uuid that `@solana/web3.js` pulls in.

## Mainnet

Not switched. Needs the owner's explicit go: `SOLANA_NETWORK=mainnet`, mainnet USDC in `ACCEPTED_MINTS`, a mainnet RPC (free tier), a new delegate key, and a decision on where that key lives (env vs KMS, open decision in CLAUDE.md).
