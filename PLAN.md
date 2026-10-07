# TAB build tracker

Launch target: Thu 2026-10-08 (owner). Full build. Non-custodial only.

## Architecture (decided)
- **Custody:** non-custodial. Each TAB = a dedicated SPL token account **owned by the user's wallet**,
  funded by the user with `limit`, with `approve(delegate, limit)`. One wallet signature creates it.
  We never hold funds. The SPL allowance is the on-chain ceiling, so even a DB bug can't overspend.
  (One token account holds one delegate, which is why each TAB gets its own account.)
- **Signing:** backend builds the x402 `exact` SVM tx (TransferChecked, authority = delegate,
  source = TAB account, fee payer = merchant's facilitator), delegate partial-signs, returns the
  `PAYMENT-SIGNATURE` header to the SDK. We don't need our own facilitator and pay no fees.
- **Settle:** tx id is the facilitator's signature, unknown to us in advance. We store the delegate
  signature + `lastValidBlockHeight`. SDK reports the merchant's `PAYMENT-RESPONSE`; we confirm on
  chain. Stuck payments resolve after blockhash expiry by scanning the TAB account's signatures for
  our delegate signature: found+ok -> SETTLED, else RELEASED. Never released before expiry.
- **Stack:** Hono (Vercel Node function at `api/`), Postgres (Neon pooled), Vite + React frontend,
  Wallet Standard for wallets, SIWS sign-in (message signature only), SDK in `packages/sdk`.
- **Tests:** vitest + embedded-postgres (real Postgres, real row locks), mocked chain.

## Checklist
- [x] 0. Spike on devnet -> docs/SPIKE-RESULT.md (PASS: Token + Token-2022, non-ATA source)
- [x] 1. Schema + migrations (add `pending` tab status, delegate sig / blockhash cols)
- [x] 2. Tabs: create (returns unsigned create tx), activate (verifies on chain, shows credential once), get, list, revoke, close
- [x] 3. `/v1/pay` reserve -> sign -> dispatch, invariant check order, idempotency
- [x] 3b. Settle/confirm + reconcile (expiry-based), lazy + cron
- [x] 3c. Required tests: 50-parallel admission, crash injection, replay, each error code
- [x] 4. x402 V2 parse/build (shared with spike pay.ts)
- [x] 5. SDK `new Tab({ credential, maxPayment }).fetch(url)`
- [x] 6. Design system (Receipt direction, owner delegated the pick) + checkpoint artifact
- [x] 7. Site: product explainer + agent console demo
- [x] 8. Dashboard: wallet connect, create TAB, balance, activity, revoke
- [x] 9. Demo paid endpoint (devnet) so the agent console does real 402 payments
- [ ] 10. Deploy to Vercel (devnet), verify live at 1440/390, no overflow at 375  (BLOCKED: Neon DATABASE_URL; preview build already green)
- [ ] 11. Mainnet switch: **owner's explicit go only**

## Needs from owner
- Neon pooled `DATABASE_URL` in `TAB/.env`
- Mainnet: RPC choice (free tier), delegate key location (env vs KMS, open decision), domain, X handle

## Verified
- 31 tests (50-parallel admission fails without the row lock, crash injection, replay, every error code, SDK)
- Devnet e2e via script and via the real dashboard UI: sign in, open, agent pays the demo API through x402.org, cap refusal, revoke, reclaim, close. DB = chain after every run.
