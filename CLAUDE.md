# TAB — project context for Claude Code

## What TAB is (read this first)
TAB lets a human give an AI agent a **capped, expiring, revocable spending allowance** in USDC on Solana, without giving the agent a wallet key.

The agent holds only a credential (`tab_live_<id>_<secret>`). It calls our backend (`POST /v1/pay`) whenever an x402 service returns HTTP 402. The backend checks the rules, and only then signs the payment with a **delegate key** that has an SPL-token allowance on a dedicated token account. The agent never sees the delegate key.

This is the same shape as KEYPASS (capped pass in front of a real secret), but the secret is a token allowance instead of an API key.

## Hard invariants (never break these)
1. The agent credential must never grant more than the remaining TAB balance.
2. Two concurrent payments must never spend the same remaining balance. Use a DB transaction with `SELECT ... FOR UPDATE` on the tab row, and reserve before signing, settle after. Same reserve/settle pattern as KEYPASS.
3. Every `/v1/pay` request carries an idempotency key. A repeated key returns the original result and never pays twice.
4. Check order on every payment: tab `active` -> `now < expires_at` -> amount <= `per_payment_cap` -> recipient on allowlist (if allowlist set) -> amount <= `limit - spent - reserved`. Any failure rejects with a typed error and signs nothing.
5. Credentials are random, shown once, stored only as a hash, scoped to one TAB.
6. The delegate private key is never logged, never returned by any endpoint, and is loaded only from a KMS/env secret.
7. All amounts are integers in token base units (bigint). No floats for money anywhere.
8. `mint` is stored on every tab. V1 only accepts USDC, but never hardcode it in logic.
9. Reject any mint using Token-2022 extensions: permanent delegate, transfer hook, transfer fee, non-transferable, confidential transfer.

## Stack
TypeScript, Node.js, Hono, PostgreSQL, `@solana/web3.js` + `@solana/spl-token`, x402 **V2** (not V1 headers). SDK is a separate TypeScript package exposing `new Tab({ credential, maxPayment }).fetch(url)`.

## Build order
0. **Delegate spike** (see `docs/SPIKE.md`). Its result decides custody design. Do this before anything else.
1. Schema + migrations (`db/schema.sql`).
2. Tab create/get/revoke/close endpoints + credential generation.
3. `/v1/pay` with reserve/settle and all invariant checks, plus tests.
4. x402 V2 client logic: parse 402, build payment, delegate-sign, retry.
5. SDK `tab.fetch()`.
6. Minimal dashboard (balance, activity, revoke). Wallet connect last.

## Required tests before calling anything done
- Concurrent admission: 50 parallel `/v1/pay` calls against a tab with room for 5. Exactly 5 succeed.
- Crash injection: kill the process between reserve and settle. On restart, stuck reservations resolve to settled or released, never lost, never double-spent.
- Replay: same idempotency key twice pays once.
- Expiry, revoked, over-cap, bad-recipient, and bad-mint each return the right error and sign nothing.

## Out of scope for V1
Token swaps, non-USDC assets, multichain, payment channels, marketplace, token launch, fiat, DAO, staking. Do not add these.

## Open decisions (ask the owner, don't guess)
- Custody model: delegate allowance vs server-held balance. Decided by the spike result.
- Where the delegate key lives (KMS vs env) for production.
- Pricing / protocol fee. Free beta for now.

## Error codes
`TAB_NOT_FOUND`, `TAB_EXPIRED`, `TAB_REVOKED`, `TAB_CLOSED`, `INSUFFICIENT_TAB_BALANCE`, `PAYMENT_EXCEEDS_TAB_LIMIT`, `RECIPIENT_NOT_ALLOWED`, `UNSUPPORTED_MINT`, `UNSUPPORTED_PAYMENT_REQUIREMENT`, `DUPLICATE_REQUEST`, `INVALID_CREDENTIAL`.
