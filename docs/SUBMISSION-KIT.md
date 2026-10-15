# Submission kit (Encode Solana Hackathon 2026, x402 track)

Final deadline: **Mon 9 Nov**. Midpoint checkpoint: **Mon 2 Nov**.

Encode requires four things:
- **A working demo on devnet.** https://tab-devnet.vercel.app (or devnet.tabpay.si once its DNS record is added). Verified live on 2026-10-15.
- **A repo with a README and setup steps.** README.md and HACKATHON.md. The repo is private, so either make it public or share it with the judges before submitting.
- **A 2–4 minute video.** Script below.
- **An explanation of how Solana powers the project.** See "How Solana powers TAB" in HACKATHON.md, and the short version below.

## Copy-paste: "How Solana powers it" (short)

> TAB puts the agent's spending cap on chain. Opening a tab funds a token account the user owns and sets an SPL Token delegate allowance equal to the limit, in one wallet signature. When an API answers HTTP 402, TAB checks the tab's rules and signs an x402 `exact` payment: a USDC `TransferChecked` on Solana that the service's facilitator submits. TAB counts a payment as paid only when a confirmed transaction with its signature is on chain. A failed call is never settled, and its hold is released once the signed transaction expires. Sub-second finality and fees of a fraction of a cent are what make 1-cent API calls work. The market's data is Solana data too: Jupiter prices, wallet reports and token safety checks.

## Copy-paste: midpoint update (Nov 2)

> Built so far: a paid-API market (5 real x402 services on Solana devnet, including a service that always fails to prove failed calls aren't charged), and an MCP server so Claude, Cursor or any MCP agent can pay from a TAB. A real MCP agent ran end to end on devnet: it bought 3 services with real x402 settlement, the failing call wasn't charged, the over-cap call was refused, revoking stopped the agent, and the ledger matched the chain. 89 tests pass. Live on devnet at tab-devnet.vercel.app. Next: demo video, polish.

## Demo video: 3 minutes, shot list

**The look:** the TAB site and dashboard as they are, plus Claude Desktop using the MCP server. Real cuts, no slideshow. Use screen capture at 1440 wide with a slow zoom on key numbers. A subtle UI click and a confirm sound go on every payment. Keep one consistent style throughout.

| # | Time | Shot | Voice-over |
|---|---|---|---|
| 1 | 0:00–0:15 | TAB hero, the ring turning | "AI agents need to pay for APIs. Giving one a wallet key is reckless. TAB gives it an allowance instead." |
| 2 | 0:15–0:40 | Dashboard on devnet: connect Phantom, open a tab with 0.30 USDC, a 0.03 cap, 1 day. One signature. Key shown once. | "One signature opens a tab. The money stays in a token account I own, and the cap is an SPL delegate allowance on Solana, so it's enforced on chain." |
| 3 | 0:40–0:55 | Paste the key into the Claude Desktop MCP config and restart. The four TAB tools appear. | "The agent gets a key, not a wallet. TAB plugs into Claude, Cursor or any MCP agent." |
| 4 | 0:55–1:45 | In Claude: "Check SOL and JUP prices, run a safety check on BONK, and read the Solana tokens docs. Tell me what each call cost." Claude calls `market_list`, then three `market_call`s. The receipts show 0.01, 0.03 and 0.02. | "Each call hits HTTP 402. TAB checks the rules, signs a USDC payment, and the service settles it on Solana through x402. The agent gets the data and a receipt." |
| 5 | 1:45–2:05 | Click one receipt's explorer link: the devnet tx with the TransferChecked from the tab account. | "This is a real transaction. The tab account paid the service, and the payment was signed by TAB's delegate, never by the agent." |
| 6 | 2:05–2:25 | Ask Claude to call the failing service. The tool returns `charged: false`. The dashboard ledger shows it held, then "not paid" a minute later. | "If a service fails, x402 doesn't settle and you aren't charged. TAB holds the amount until the signed payment expires, then releases it, so it can't be spent twice." |
| 7 | 2:25–2:40 | Ask for a wallet report (0.05). It's refused with `PAYMENT_EXCEEDS_TAB_LIMIT`, and Claude explains why. | "Over the cap? TAB refuses and signs nothing. The agent knows why." |
| 8 | 2:40–2:55 | Revoke in the dashboard. Claude's next call gets `TAB_REVOKED`. Reclaim the funds with one signature. | "Revoke, and the agent stops at once. The funds come back to your wallet." |
| 9 | 2:55–3:05 | Ledger, with spent matching the on-chain allowance. Logo. | "TAB. Spending limits for AI agents, on Solana." |

**Before recording:**
- A devnet wallet with devnet SOL and devnet USDC (faucet.circle.com).
- The MCP server set to `TAB_API_URL=https://tab-devnet.vercel.app/api`, built from this repo or installed with `npx` once it's published.
- Record shot 6 last. It needs a 1–2 minute wait, which gets cut out.
