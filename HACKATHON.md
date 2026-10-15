# TAB at Solana Hackathon 2026 (Encode Club)

Track: **Best Use of x402 on Solana**.

**Live demo (Solana devnet):** https://devnet.tabpay.si (mirror: https://tab-devnet.vercel.app). The dashboard is at `/app`, the docs at `/docs`, and the free market catalogue at `/api/market/catalog`. You need a devnet wallet with devnet SOL and devnet USDC (faucet.circle.com). The production site, tabpay.si, runs on mainnet and is a separate deployment.

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
| **Dashboard agent and docs.** The tab page's test agent buys from the market, the ledger labels market payments, and the docs cover MCP setup and the market. | `src/web/app/TabDetail.tsx`, `src/web/site/Docs.tsx` |
| **Devnet end-to-end over MCP.** | `scripts/e2e-market-devnet.ts` |
| Tests for all of the above (52 new, 89 in total). Each new suite was checked once against a reinstated bug. | `tests/market.test.ts`, `packages/mcp/test` |

## How a failed payment is handled

| What goes wrong | What happens | Charged? |
|---|---|---|
| Bad input | 400 before any 402 | No, nothing is signed |
| Over the tab's cap, past expiry, revoked, recipient not allowed, or not enough left | TAB refuses with a typed error and signs nothing | No |
| The service fails after the payment is signed (4xx/5xx) | x402 cancels settlement and the signed payment is never submitted | No. TAB holds the reservation until the signed payment's blockhash expires (about 1–2 minutes), then releases it. Releasing earlier would let a merchant who kept the signed tx spend it twice. |
| The facilitator lands the payment but times out confirming it | The merchant checks the chain and serves the content anyway | Yes, and the payer gets what they paid for |
| The RPC is down while TAB reconciles | The payment is marked AMBIGUOUS, stays reserved, and is retried later | Never guessed |

## How Solana powers TAB

- **The cap lives on chain.** Opening a tab creates a token account owned by the user's wallet, funds it with the limit, and calls SPL Token `approve(delegate, limit)`, all in one signature. TAB's delegate can never move more than that allowance, even if TAB's database were wrong. The user can revoke it or close the account from their own wallet without TAB.
- **Every payment is a Solana transaction.** For each x402 402, TAB builds the `exact` scheme payment: a `TransferChecked` of USDC from the tab's token account, signed by the delegate. The service's facilitator adds the fee-payer signature and submits it. On devnet the market settles through the public x402.org facilitator.
- **The chain decides what was paid.** A payment is *settled* only when a confirmed transaction carrying TAB's signature is found. It is *released* only after its blockhash has expired with no such transaction. Fast finality and low fees are what make a 1-cent API call sensible.
- **Solana data in the market.** Prices come from Jupiter, and wallet reports and token safety checks come from Solana RPC. An agent pays on Solana for Solana data.

## Verified on devnet (2026-10-15)

`npm run e2e:market` runs a real MCP client against the built `@tabpaysi/mcp` server, a TAB API on devnet, and real x402 settlement:

| Step | Result | Tx |
|---|---|---|
| Open tab (0.30 USDC, 0.03 cap) | wallet signs once | [open](https://explorer.solana.com/tx/3LKsPYAVjNkzjibkMTt2NSeAZCvThgudRqaVYXvbqPd2XjYiMaP9SJddU2QPgnqp6fokRQsHXVu5RWxKD4Ab7dVi?cluster=devnet) |
| `price` | paid 0.01, data returned | [tx](https://explorer.solana.com/tx/5LByFrduyU5AEXN4mxWz1d1Y946ybyTnGF4WcMC1CxjYvKaz2m3xSzwSn8DtMi7XhexFA4hcY8CnbUA57j7yECCq?cluster=devnet) |
| `token-check` | paid 0.03, data returned | [tx](https://explorer.solana.com/tx/2KgXyFsguBskctZvv6RqiHvgLupMh4hda2LVejNNGZSEAxZ1X7Z44NiUdNugNYJXuXQPc4xdNeKr8vQkD5k6SJoS?cluster=devnet) |
| `read` | paid 0.02, data returned | [tx](https://explorer.solana.com/tx/3gGn52U5HTKSXR9Qgt7fYFAF7nkZP6dSmebbrVBz7NX8CK33qBtjjpbmH8o4JHMv7ECGAf1GiRSRJmHnMuDq2YTU?cluster=devnet) |
| `flaky` (fails) | 503, not charged; 0.01 held, then released after expiry | none |
| `wallet-report` (0.05 > cap) | refused `PAYMENT_EXCEEDS_TAB_LIMIT`, nothing signed | none |
| Ledger vs chain | spent 0.06, on-chain allowance left 0.24 = TAB's remaining | |
| Revoke | agent gets `TAB_REVOKED` | |
| Reclaim + close | funds back to the wallet | [reclaim](https://explorer.solana.com/tx/2JNixJPFzCrtUMQQb3hXzrYQNTQ3sXPEEqKBsc9WwcaF3FjNgLFAm5gFwSUyk8prRYqrW68K4iBArDnGrURaGRqf?cluster=devnet) |

The same run against the live deployment (`API=https://tab-devnet.vercel.app/api`) also passed every check. Its paid calls: [price](https://explorer.solana.com/tx/tAHnJGNFQqR7qhKxjjuJJtVDvCVP154455eRhpDwBAEe2bf7XNtTRGkYSBMgsNQcZsma71srjeN8LmTwnjemhfN?cluster=devnet), [token-check](https://explorer.solana.com/tx/2VvgngxQqrxh5reQmMd6xaNWzcbKvgvCmGFXofCN2nohFfL8my3oirUUFAWaXBYH6Y1jFJ9vEtRpU1T4P7BXBo2g?cluster=devnet), [read](https://explorer.solana.com/tx/9Nd1SBArBrKr1TMAGwgfo5KSGBYk3XWXZngso3FsNcK7Npc6R4BFZ4QTP875F6ZHXhzxsJjAQ2XGoPW82jdCuyG?cluster=devnet).

## Run it

See the README: `npm ci`, `npm run dev:db`, `npm run dev:api`, `npm run dev:web`, `npm test`. Then `npm run build:mcp` and `npm run e2e:market`. To use it from Claude, see [`packages/mcp/README.md`](packages/mcp/README.md).
