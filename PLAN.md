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
- [x] 10. Deployed: https://tabpay.si (was https://tab-agent-one.vercel.app) (devnet, Neon us-east-1 pooled). Live sign-in verified; live payment run waits on devnet USDC
- [x] 11. Mainnet: switched 2026-10-07 on owner's go (public RPC, delegate key in env, new key 5MEzFaP2…). Beta cap MAX_TAB_LIMIT = 1000 USDC. Devnet env backup: .env.vercel.devnet

## Needs from owner
- Devnet USDC (faucet.circle.com) to 4jukG76niybZH9UJyxgPGKx4gcCUi5b5eKceviGjnhM7 for the live payment run
- Mainnet: RPC choice (free tier), delegate key location (env vs KMS, open decision), X handle, token CA (domain done: tabpay.si)

## Verified
- 31 tests (50-parallel admission fails without the row lock, crash injection, replay, every error code, SDK)
- Devnet e2e via script and via the real dashboard UI: sign in, open, agent pays the demo API through x402.org, cap refusal, revoke, reclaim, close. DB = chain after every run.

## 2026-10-07 later (owner requests)
- [x] Tab opening fee: 0.20 USDC per tab to treasury 3Vjaxv…cBmH, in the same signature (owner decision). Simulated on mainnet: all 6 instructions pass.
- [x] Mainnet self-funding demo: in-process x402 facilitator, separate fee payer 9ZuZF2…FiD4o, pauses when low. **Waiting on owner: fund fee payer ~0.005 SOL.**
- [x] Redesign (kaos-studio as reference, not copied): chrome ring = limit, scroll-driven hero, graphite panels, ring-centric dashboard. Live on prod.
- [x] Design system artifact rebuilt to v2.
- [ ] Owner's real-money mainnet test (open ~1.2 USDC tab in Phantom, run test agent, revoke). I can't move real funds.
- [ ] Domain, X handle, npm publish of the SDK (owner accounts).
