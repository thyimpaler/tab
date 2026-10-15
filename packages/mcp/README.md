# @tabpaysi/mcp

An MCP server that lets Claude, Cursor or any MCP agent **pay for APIs on Solana from a TAB**. A TAB is a capped, expiring, revocable USDC allowance. The agent holds a TAB credential, never a wallet key.

When a service answers HTTP 402 (x402 V2), the server asks TAB to sign the payment. TAB checks the rules first: tab status, expiry, per-payment cap, allowlist and remaining balance. The server then retries the request and hands the agent the data along with a receipt that links to the Solana transaction.

## Tools

| Tool | What it does |
|---|---|
| `tab_balance` | Remaining, spent and held amounts, per-payment cap, expiry, status |
| `market_list` | The paid APIs in the TAB market, with USDC prices and inputs |
| `market_call` | Calls one market service and pays for it. Returns the data plus a receipt (amount, tx, explorer link, remaining) |
| `paid_fetch` | Calls any http(s) URL. If it asks for an x402 Solana payment, pays from the tab |

Refusals come back as tool errors with a `code` and a `next` hint, so the agent can tell the user why it stopped. Examples: `PAYMENT_EXCEEDS_TAB_LIMIT`, `INSUFFICIENT_TAB_BALANCE`, `TAB_REVOKED`, `RECIPIENT_NOT_ALLOWED`.

A service that fails after the payment was signed reports `charged: false`. x402 doesn't settle failed calls, and TAB releases the held amount once the signed payment expires.

## Setup

1. Open a tab on the TAB dashboard and copy the tab key. It's shown once.
2. Add the server to your client.

| Variable | Meaning |
|---|---|
| `TAB_CREDENTIAL` | The tab key (`tab_live_…` / `tab_test_…`). Required. |
| `TAB_API_URL` | TAB API base. Defaults to `https://tabpay.si/api`. Use the devnet deployment's `/api` for the hackathon demo. |
| `TAB_MAX_PAYMENT` | This server's own ceiling per call, in base units (USDC: `100000` = 0.10). Default `1000000` (1.00). |
| `TAB_MARKET_URL` | Market catalogue URL. Defaults to `<TAB_API_URL>/market/catalog`. |

**Claude Desktop** (`claude_desktop_config.json`) or **Cursor** (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "tab": {
      "command": "npx",
      "args": ["-y", "@tabpaysi/mcp"],
      "env": {
        "TAB_CREDENTIAL": "tab_test_…",
        "TAB_API_URL": "https://YOUR-TAB-HOST/api",
        "TAB_MAX_PAYMENT": "100000"
      }
    }
  }
}
```

**Claude Code:**

```bash
claude mcp add tab --env TAB_CREDENTIAL=tab_test_… --env TAB_API_URL=https://YOUR-TAB-HOST/api -- npx -y @tabpaysi/mcp
```

**From this repo, before the package is on npm:** build it with `npm run build -w packages/sdk` then `npm run build -w packages/mcp`. Then set `"command": "node"` and `"args": ["<path to TAB>/packages/mcp/dist/index.js"]`.

## Try it

Ask your agent:

> Check my TAB balance, then use the TAB market to get the SOL and JUP prices and run a token safety check on BONK. Tell me what each call cost.
