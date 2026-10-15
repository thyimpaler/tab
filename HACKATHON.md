# TAB at Solana Hackathon 2026 (Encode Club)

Track: **Best Use of x402 on Solana**.

## Disclosure: what existed before the hackathon

TAB existed before the hackathon started on 2026-10-12. The git tag **`hackathon-baseline`** (commit `cbb08be`, 2026-10-08) marks exactly what was already built:

- Capped, expiring, revocable USDC allowances ("tabs"). Each tab is a token account the user owns, plus an SPL delegate allowance.
- `/v1/pay`, which signs x402 V2 `exact` payments for an agent within the tab's rules. Reserve, settle and reconcile happen against the chain.
- The `@tabpaysi/sdk` TypeScript SDK (`tab.fetch(url)`).
- The site, the dashboard, and a three-endpoint demo paid API.

TAB has raised no outside funding and has no token.

**Everything judged is the work after that tag.** See it with:

```
git diff hackathon-baseline..HEAD --stat
git log hackathon-baseline..HEAD --oneline
```

## Built during the hackathon

| What | Where |
|---|---|
| **Paid-API market.** Five real pay-per-request services over x402 on Solana: token prices (Jupiter), wallet report, token safety check, web page reader, and a service that always fails, which shows a failed call is never charged. It includes a free catalogue and x402 Bazaar discovery metadata. | `src/server/market.ts`, `src/server/market-services.ts` |
| **Input checks before payment.** A bad request gets a 400, never a 402, so no payment is ever signed for it. The page reader refuses private and internal addresses before payment, and again on every redirect. | same |
| **Shared merchant plumbing.** Facilitator selection and recovery from `settlement_pending`. This fixes a header bug where a recovered 200 still carried the failed receipt. | `src/server/x402kit.ts` |
| **MCP server.** Claude, Cursor or any MCP agent can browse the market and pay from a TAB. | `packages/mcp` |
| Tests for all of the above. Each was checked once against a reinstated bug. | `tests/market.test.ts`, `packages/mcp/test` |

## How a failed payment is handled

| What goes wrong | What happens | Charged? |
|---|---|---|
| Bad input | 400 before any 402 | No, nothing is signed |
| Over the tab's cap, past expiry, revoked, recipient not allowed, or not enough left | TAB refuses with a typed error and signs nothing | No |
| The service fails after the payment is signed (4xx/5xx) | x402 cancels settlement and the signed payment is never submitted | No. TAB holds the reservation until the signed payment's blockhash expires (about 1–2 minutes), then releases it. Releasing earlier would let a merchant who kept the signed tx spend it twice. |
| The facilitator lands the payment but times out confirming it | The merchant checks the chain and serves the content anyway | Yes, and the payer gets what they paid for |
| The RPC is down while TAB reconciles | The payment is marked AMBIGUOUS, stays reserved, and is retried later | Never guessed |
