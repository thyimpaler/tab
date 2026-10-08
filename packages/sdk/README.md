# @tabpay/sdk

Give an AI agent a **capped, expiring, revocable USDC allowance** on Solana. The agent pays x402 V2 services through TAB and never holds a wallet key.

```bash
npm i @tabpay/sdk
```

```ts
import { Tab } from "@tabpay/sdk";

const tab = new Tab({
  credential: process.env.TAB_CREDENTIAL!, // tab_live_…, shown once when you open a tab
  maxPayment: "500000",                    // client-side ceiling per request: 0.50 USDC (base units)
});

const res = await tab.fetch("https://api.example.com/forecast");
const { remaining } = await tab.balance();
```

`tab.fetch` works like `fetch`. A response that isn't HTTP 402 comes back untouched. On an x402 V2 402 it:

1. refuses locally if the price is above `maxPayment`,
2. asks TAB to sign the payment within the tab's rules (status, expiry, per-payment cap, allowlist, remaining balance),
3. retries your request with the `PAYMENT-SIGNATURE` header,
4. reports the service's `PAYMENT-RESPONSE` so the tab settles straight away.

Refusals throw a `TabError` with a `code` such as `TAB_EXPIRED`, `PAYMENT_EXCEEDS_TAB_LIMIT`, `RECIPIENT_NOT_ALLOWED` or `INSUFFICIENT_TAB_BALANCE`. Nothing is signed when a check fails.

Request bodies must be re-sendable (string, bytes or FormData), because a paid request is sent twice.

## Options

| Option | Meaning |
|---|---|
| `credential` | The tab's agent key. |
| `maxPayment` | Max per request in token base units (USDC: 1,000,000 = 1 USDC). |
| `apiUrl` | TAB API base. Defaults to the hosted API. |
| `timeoutMs` | Per-request timeout, default 30 s. |
| `onPayment` | Called after every paid request with amount, recipient and what's left. |
| `fetch` | Custom fetch implementation. |

Open a tab and get a key at the [TAB dashboard](https://tabpay.si/app). Docs: https://tabpay.si/docs

MIT licensed.
