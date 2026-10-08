import { TopBar, Footer } from "../components/Chrome";

const ERRORS: [string, string, string][] = [
  ["INVALID_CREDENTIAL", "401", "The key is malformed, rotated or wrong. Ask the owner for a new one."],
  ["TAB_NOT_FOUND", "404", "The tab doesn't exist or hasn't been activated."],
  ["TAB_REVOKED", "403", "The owner revoked the tab. Nothing more will be signed."],
  ["TAB_CLOSED", "403", "The tab was closed and its funds returned."],
  ["TAB_EXPIRED", "403", "Past the tab's expiry."],
  ["PAYMENT_EXCEEDS_TAB_LIMIT", "403", "This payment is above the tab's per-payment cap (or the SDK's maxPayment)."],
  ["RECIPIENT_NOT_ALLOWED", "403", "The service's payTo address isn't on the tab's allowlist."],
  ["INSUFFICIENT_TAB_BALANCE", "402", "Not enough left: spent plus in-flight payments would pass the limit."],
  ["UNSUPPORTED_MINT", "400", "The service doesn't accept the tab's token (V1: USDC)."],
  ["UNSUPPORTED_PAYMENT_REQUIREMENT", "400", "Not an x402 V2 exact payment on this Solana network."],
  ["DUPLICATE_REQUEST", "409", "The idempotency key was reused with a different request."],
];

export function Docs() {
  return (
    <div>
      <TopBar current="docs" />
      <div className="wrap docs">
        <aside className="docs-nav" aria-label="On this page">
          <span className="label">On this page</span>
          <a href="#quickstart">Quickstart</a>
          <a href="#sdk">SDK</a>
          <a href="#api">HTTP API</a>
          <a href="#settlement">Settlement</a>
          <a href="#errors">Error codes</a>
          <a href="#security">Security model</a>
        </aside>
        <article className="prose">
          <h1 className="h1">Docs</h1>
          <p className="lede" style={{ marginTop: 24, maxWidth: "56ch" }}>TAB gives an AI agent a capped, expiring, revocable USDC allowance on Solana. The agent pays x402 V2 services through TAB and never holds a wallet key.</p>

          <h2 id="quickstart">Quickstart</h2>
          <ol>
            <li><a href="/app" data-nav>Open the dashboard</a>, connect a wallet and sign in. Signing in is a message signature.</li>
            <li>Open a tab: limit, per-payment cap, expiry and, optionally, the services it may spend at (by each service's payment address, the <code>payTo</code> in its 402 reply). Approve the one transaction in your wallet.</li>
            <li>Copy the key it shows you. It's shown once. Lost it? Rotate it from the tab page.</li>
            <li>Give the key to your agent as <code>TAB_CREDENTIAL</code> and use the SDK.</li>
          </ol>

          <h2 id="sdk">SDK</h2>
          <pre className="code"><code>{`npm i @tabpaysi/sdk`}</code></pre>
          <pre className="code"><code>{`import { Tab } from "@tabpaysi/sdk";

const tab = new Tab({
  credential: process.env.TAB_CREDENTIAL!,   // tab_live_… or tab_test_…
  maxPayment: "500000",                      // base units: 500000 = 0.50 USDC
  apiUrl: "${typeof location !== "undefined" ? location.origin : "https://<your-tab-host>"}/api",
  onPayment: (p) => console.log("paid", p.amount, "to", p.recipient, "left", p.remaining),
});

const res = await tab.fetch("https://api.example.com/forecast");
const { remaining } = await tab.balance();`}</code></pre>
          <p><code>tab.fetch</code> works like <code>fetch</code>. A non-402 response is returned untouched. On an x402 V2 402 it:</p>
          <ol>
            <li>refuses locally if the cheapest Solana option is above <code>maxPayment</code>,</li>
            <li>asks TAB to sign, with a fresh idempotency key,</li>
            <li>retries your request with the <code>PAYMENT-SIGNATURE</code> header,</li>
            <li>reports the service's <code>PAYMENT-RESPONSE</code> so the tab settles straight away.</li>
          </ol>
          <p>Rejections throw a <code>TabError</code> with a <code>code</code> from the table below. Request bodies must be re-sendable (string, bytes or FormData), because a paid request is sent twice.</p>

          <h2 id="api">HTTP API</h2>
          <p>Agent endpoints authenticate with <code>Authorization: Bearer tab_…</code>. Amounts are strings in base units. Errors are <code>{`{ "error": { "code", "message" } }`}</code>.</p>
          <div className="table-wrap"><table>
            <thead><tr><th>Endpoint</th><th>What it does</th></tr></thead>
            <tbody>
              <tr><td><code>POST /api/v1/pay</code></td><td>Body <code>{`{ paymentRequired, resource?, idempotencyKey }`}</code> (or an <code>Idempotency-Key</code> header). <code>paymentRequired</code> is the decoded <code>PAYMENT-REQUIRED</code> header or its raw base64. Returns <code>{`{ paymentId, amount, recipient, mint, paymentSignature, remaining, replayed }`}</code>.</td></tr>
              <tr><td><code>POST /api/v1/payments/:id/confirm</code></td><td>Body <code>{`{ transaction }`}</code>, the tx id from <code>PAYMENT-RESPONSE</code>. Settles the payment if that transaction carries TAB's signature.</td></tr>
              <tr><td><code>GET /api/v1/tab</code></td><td>Status, limit, spent, reserved, remaining, cap and expiry.</td></tr>
            </tbody>
          </table></div>

          <h2 id="settlement">Settlement</h2>
          <p>TAB signs a <code>TransferChecked</code> from the tab's token account with its delegate key. The service's facilitator adds its fee-payer signature and submits it. TAB treats the chain as the only source of truth:</p>
          <ul>
            <li><b>Reserved</b> the moment it's signed, so concurrent payments can't share the same balance.</li>
            <li><b>Settled</b> when a confirmed transaction carrying TAB's signature is found.</li>
            <li><b>Released</b> only after the transaction's blockhash has expired and no such transaction exists. A signed payment can't land after that.</li>
          </ul>
          <p>A service can land the payment and still answer 402 if its own facilitator is slow. TAB then counts it as spent, because it was. The SDK retries once with the same signed payment, which can't be charged twice.</p>

          <h2 id="errors">Error codes</h2>
          <div className="table-wrap"><table>
            <thead><tr><th>Code</th><th>HTTP</th><th>Meaning</th></tr></thead>
            <tbody>{ERRORS.map(([c, s, m]) => <tr key={c}><td><code>{c}</code></td><td className="num">{s}</td><td>{m}</td></tr>)}</tbody>
          </table></div>
          <p>Checks run in this order: status, expiry, per-payment cap, allowlist, remaining balance. A failed check signs nothing.</p>

          <h2 id="security">Security model</h2>
          <ul>
            <li>Funds sit in a token account owned by your wallet. TAB holds an SPL allowance on it, capped at the limit by the token program.</li>
            <li>Agent keys are random, shown once and stored only as a keyed hash. Each key works for one tab.</li>
            <li>The delegate key never leaves the server and is never logged or returned.</li>
            <li>You can revoke the allowance or close the account straight from your wallet, without TAB.</li>
            <li>Token-2022 mints with permanent delegates, transfer hooks, transfer fees, non-transferable, confidential, default-frozen, pausable or scaled extensions are refused.</li>
          </ul>
        </article>
      </div>
      <Footer />
    </div>
  );
}
