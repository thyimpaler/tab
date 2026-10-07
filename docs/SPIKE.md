# Spike: can a delegate-signed transfer pass x402 on Solana?

Goal: answer one question in about a day. **Can a payment signed by an SPL-token delegate (not the account owner) be verified and settled through an x402 V2 flow on Solana?**

The answer decides custody:
- Yes -> TAB can be non-custodial. The user keeps the funds in their own token account and we only hold a capped delegate.
- No -> fall back to a server-held balance per TAB with a small cap, and design it so enforcement can move onchain later.

## Steps (devnet)
1. Create three keypairs: `owner` (the user), `delegate` (TAB backend), `merchant` (the paid service). Airdrop SOL to `owner` and `delegate` for fees.
2. Create a test USDC-like mint on devnet, or use devnet USDC if available. Create a token account for `owner` and fund it with 10 tokens.
3. Call `approve` on that token account: delegate = `delegate`, amount = 10 tokens.
4. Run a minimal x402 V2 test endpoint (or a public test one) that returns 402 and a payment requirement for 0.01 tokens to `merchant`.
5. Build the payment transfer so the **delegate** signs, with the owner's token account as the source. Submit it through the x402 flow and retry the request.
6. Record exactly what happens at each stage: facilitator verify, settle, and the final 200.

## Things to record
- Does the facilitator/verifier accept a transfer whose signer is the delegate rather than the source account owner?
- Does it work with the classic Token program, Token-2022, or both?
- Are fees paid by the delegate or by a facilitator fee payer?
- What happens when the transfer exceeds the allowance? (should fail onchain, confirm)
- What happens after `revoke`? (should fail onchain, confirm)

## Deliverable
`docs/SPIKE-RESULT.md` with: pass or fail per step, the exact error text on any failure, and a one-line recommendation (delegate custody, or server-held fallback).

Do not build the backend, dashboard, or SDK until this is written up.
