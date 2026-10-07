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
- [ ] 0. Spike on devnet -> docs/SPIKE-RESULT.md  (BLOCKED: owner devnet SOL from faucet)
- [ ] 1. Schema + migrations (add `pending` tab status, delegate sig / blockhash cols)
- [ ] 2. Tabs: create (returns unsigned create tx), activate (verifies on chain, shows credential once), get, list, revoke, close
- [ ] 3. `/v1/pay` reserve -> sign -> dispatch, invariant check order, idempotency
- [ ] 3b. Settle/confirm + reconcile (expiry-based), lazy + cron
- [ ] 3c. Required tests: 50-parallel admission, crash injection, replay, each error code
- [ ] 4. x402 V2 parse/build (shared with spike pay.ts)
- [ ] 5. SDK `new Tab({ credential, maxPayment }).fetch(url)`
- [ ] 6. Design system (fresh TAB identity) + checkpoint for owner
- [ ] 7. Site: product explainer + agent console demo
- [ ] 8. Dashboard: wallet connect, create TAB, balance, activity, revoke
- [ ] 9. Demo paid endpoint (devnet) so the agent console does real 402 payments
- [ ] 10. Deploy to Vercel (devnet), verify live at 1440/390, no overflow at 375
- [ ] 11. Mainnet switch: **owner's explicit go only**

## Needs from owner
- Devnet SOL to spike owner `4jukG76niybZH9UJyxgPGKx4gcCUi5b5eKceviGjnhM7` (faucet.solana.com)
- Neon pooled `DATABASE_URL` in `TAB/.env`
- Mainnet: RPC choice (free tier), delegate key location (env vs KMS, open decision), domain, X handle
