# Spike result: delegate-signed x402 V2 on Solana

**Date:** 2026-10-07. **Network:** devnet. **Facilitator:** public `https://x402.org/facilitator` (x402 V2, `exact` SVM).
**Packages:** `@x402/core` / `@x402/hono` / `@x402/svm` 2.28.0, `@solana/web3.js` 1.99, `@solana/spl-token` 0.4.15.
**Code:** `spike/` (`setup.ts`, `server.ts`, `pay.ts`, `run-cases.ts`; the case C rerun was a one-off script).

## Verdict: PASS
An SPL-token **delegate** can sign an x402 V2 `exact` payment on Solana. The facilitator verifies,
simulates, co-signs as fee payer and settles it, and the resource returns 200.

**Recommendation: delegate custody (non-custodial).** Each TAB gets its own token account owned by the
user's wallet, with the allowance approved to our delegate. This matches the owner's decision on
2026-10-07: non-custodial only, no server-held balance.

## Steps
| Step | Result |
|---|---|
| 1. Keypairs owner / delegate / merchant | PASS. Public airdrop was rate-limited (429). Owner funded from faucet.solana.com. Delegate never held SOL. |
| 2. Test mints (6 dp), owner accounts funded with 10 | PASS. One classic Token mint, one Token-2022 mint with no extensions. |
| 3. `approve` delegate for 10 | PASS, on the owner ATA and on a non-ATA dedicated account for each mint. |
| 4. x402 V2 endpoint, 0.01 token to merchant | PASS. `@x402/hono` returns 402 with a `PAYMENT-REQUIRED` header (base64 JSON, `x402Version: 2`, `extra.feePayer` = facilitator). |
| 5. Delegate-signed tx through x402, retry | PASS. Tx = [SetComputeUnitLimit, SetComputeUnitPrice, TransferChecked(authority = delegate), Memo], fee payer = facilitator, delegate partial-signs, sent as `PAYMENT-SIGNATURE`. |
| 6. Verify, settle, final 200 | PASS. See cases. |

## Cases
| # | Case | Result | Evidence |
|---|---|---|---|
| A | Classic Token, owner ATA source | **200, settled** | [3dgBJN…](https://explorer.solana.com/tx/3dgBJNqb2GgQw6rLLz6EmzFVu7M736MPt8yM1dToh8Y2T958nA4jerNswmDWtE5TC9ZxG6hvLJTUxxkyWQQUvyj5?cluster=devnet) |
| B | Token-2022 (no extensions), owner ATA source | **200, settled** | [4mufEr…](https://explorer.solana.com/tx/4mufErGojicGPxG44jZ87NMo4kJRjGmWkSNAa7Q8vrmaD3b3PHm8pobNzBvAjJY5VMvFDrMXJPhgM8VU5Y18YNzb?cluster=devnet) |
| C | Classic Token, **non-ATA dedicated account** source | **200, settled** on rerun | [54wJVQ…](https://explorer.solana.com/tx/54wJVQdSdZyVAvDzpzFUKQnqM2isHEBtnvEmiZ1QBaNH7XjsD7hATkJUZB8CWZtXE8a7nw2ZuCCxWnQJ6heZ7AF1?cluster=devnet) |
| C (1st try) | same | Tx **landed on chain** (funds moved, `err: null`) but the merchant answered **402** | facilitator: `settlement_pending`, "Solana error #8100002 … Too Many Requests 429" (its own RPC was rate-limited while confirming). [44FpdV…](https://explorer.solana.com/tx/44FpdVLpz3hsZmgoo1Fymc2Z4SFXr3T6f25HZTauM8dnEG341hx2uf3uTRDn6aDURVc3uAsvpXXQiZ6Y4mF6ccvF?cluster=devnet) |
| D | Allowance shrunk to 0.005, pay 0.01 | **Rejected at verify, nothing moved** | `invalid_exact_svm_transaction_simulation_failed`; balance and allowance unchanged |
| E | After `revoke` | **Rejected at verify, nothing moved** | `invalid_exact_svm_transaction_simulation_failed`; revoke tx [65bHnV…](https://explorer.solana.com/tx/65bHnVph6erLdL7rHMVHGwRvLGoWJvcieLGS5j3iiT1fw8kmEhpkgj4rtbp2mqAzXcaKnXRfc5mYGGrgBnBn3cir?cluster=devnet) |

## Answers to "things to record"
- **Does the facilitator accept a delegate signer?** Yes. It only rejects an authority that is one of its own
  signers. There is no owner check. Its `payer` field reports the delegate address.
- **Token vs Token-2022?** Both work.
- **Who pays fees?** The facilitator's fee payer (`CKPKJWNd…`) paid 10,001 lamports per tx. The delegate needs **no SOL**.
- **Over the allowance?** Fails in the facilitator's simulation and is rejected before settlement. Nothing moves.
- **After revoke?** Same: simulation fails and nothing moves. The user can kill a TAB on chain from their own
  wallet without us.
- **Allowance accounting:** `delegatedAmount` drops by exactly the amount paid (10,000,000 to 9,990,000). The SPL
  allowance is a hard on-chain ceiling, independent of our DB.
- **Non-ATA source:** works. The spec says "source ATA", but the reference facilitator doesn't require an ATA.

## Design consequences (built into the backend)
1. **One token account per TAB.** An SPL account holds one delegate and one allowance, so each TAB creates a
   dedicated account (owner = user) in a single wallet transaction: create, fund `limit`, approve delegate for `limit`.
2. **Ledger truth is the chain.** Case C's first try shows the merchant can say "not paid" while the transfer
   landed. TAB never trusts the HTTP answer for accounting. A payment settles only when a tx carrying our delegate
   signature is found on chain. It releases only after its blockhash has expired and no such tx exists.
3. **Facilitator flakiness is the merchant's problem, but the user pays.** If a merchant's facilitator lands the
   tx and still returns 402, the user is charged and gets nothing. The dashboard shows this as "settled, merchant
   returned 402" so it's visible. The SDK does not blindly re-pay: it retries with the **same** signed header
   (same tx, can't land twice) once, then reports.
4. The TAB has no fee exposure: we never pay SOL fees for payments. The user pays about 0.002 SOL rent once at
   creation, refunded when they close the TAB.
