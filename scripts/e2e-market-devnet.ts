// Hackathon end-to-end on devnet: a real MCP client drives the built TAB MCP server (stdio), which pays the
// market through a running TAB API with real x402 settlement (x402.org facilitator) on Solana devnet.
//
//   npm run dev:db ; npm run dev:api          (local, SOLANA_NETWORK=devnet, DEMO_MERCHANT set)
//   npm run build -w packages/sdk ; npm run build -w packages/mcp
//   npx tsx scripts/e2e-market-devnet.ts      (API=https://<devnet host>/api to run against a deployment)
//
// Plays the user with the spike owner keypair (devnet only): sign in -> open a tab -> agent works through
// the market over MCP -> failing service isn't charged -> cap refusal -> revoke stops the agent ->
// reclaim + close. Ends by checking the ledger against the chain. Prints no secrets.
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { readFileSync } from "node:fs";

const API = process.env.API ?? "http://localhost:8787/api";
const ORIGIN = process.env.APP_ORIGIN ?? new URL(API).origin.replace(":8787", ":5173");
const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const owner = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync("spike/.keys/owner.json", "utf8"))));
let cookie = "";
let failures = 0;

async function call(path: string, body?: unknown) {
  const res = await fetch(API + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  const j: any = await res.json();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(j)}`);
  return j;
}

async function signSend(b64: string) {
  const tx = VersionedTransaction.deserialize(Buffer.from(b64, "base64"));
  tx.sign([owner]);
  const sig = await conn.sendTransaction(tx);
  await conn.confirmTransaction(sig, "confirmed");
  return sig;
}

const step = (s: string) => console.log(`\n# ${s}`);
const check = (ok: boolean, what: string) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) failures++; };

step("sign in (SIWS message signature)");
const { input } = await call("/v1/auth/nonce", {});
const f = [`URI: ${input.uri}`, `Version: ${input.version}`, `Chain ID: ${input.chainId}`, `Nonce: ${input.nonce}`, `Issued At: ${input.issuedAt}`, `Expiration Time: ${input.expirationTime}`];
const message = `${input.domain} wants you to sign in with your Solana account:\n${owner.publicKey.toBase58()}\n\n${input.statement}\n\n${f.join("\n")}`;
const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), owner.secretKey));
await call("/v1/auth/verify", { address: owner.publicKey.toBase58(), message, signature });

const cfg = await call("/v1/config");
check(cfg.network === "devnet" && cfg.market === true, `API is devnet with the market on (${cfg.network}, market=${cfg.market})`);
const catalog = await call("/market/catalog");

step("open a tab: limit 0.30, cap 0.03 per payment, 1 day, allowlist = market merchant");
const created = await call("/v1/tabs", {
  label: "hackathon MCP agent", limit: "300000", perPaymentCap: "30000",
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(), allowlist: [catalog.payTo], mint: cfg.mints[0],
});
const createSig = await signSend(created.transaction);
console.log("open tx", `https://explorer.solana.com/tx/${createSig}?cluster=devnet`);
const { credential } = await call(`/v1/tabs/${created.tabId}/activate`, { signature: createSig });
console.log("agent key issued (not printed)");

step("start the MCP server as an agent would (stdio)");
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["packages/mcp/dist/index.js"],
  env: { ...process.env as Record<string, string>, TAB_CREDENTIAL: credential, TAB_API_URL: API, TAB_MAX_PAYMENT: "100000" },
  stderr: "inherit",
});
const agent = new Client({ name: "e2e-agent", version: "1.0.0" });
await agent.connect(transport);
const tool = async (name: string, args: Record<string, unknown> = {}) => {
  const r: any = await agent.callTool({ name, arguments: args });
  return { isError: !!r.isError, body: JSON.parse(r.content[0].text) };
};
console.log("tools:", (await agent.listTools()).tools.map((t) => t.name).join(", "));

step("agent browses the market");
const list = await tool("market_list");
console.log(list.body.services.map((s: any) => `${s.id} $${s.priceUsd}`).join(" · "));

step("agent buys data (real x402 settlement on devnet)");
const buys: [string, Record<string, string>][] = [
  ["price", { tokens: "SOL,JUP,BONK" }],
  ["token-check", { mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
  ["read", { url: "https://solana.com/docs/core/tokens" }],
];
let spent = 0n;
for (const [service, params] of buys) {
  const r = await tool("market_call", { service, params });
  const ok = !r.isError && r.body.charged === true && !!r.body.receipt?.transaction;
  check(ok, `${service}: paid ${r.body.receipt?.amountUsd ?? "?"} USDC, got data`);
  if (ok) { spent += BigInt(r.body.receipt.amount); console.log("   ", r.body.receipt.explorer); }
  else console.log("   ", JSON.stringify(r.body).slice(0, 300));
}

step("a failing service: not charged");
const flaky = await tool("market_call", { service: "flaky" });
check(flaky.isError && flaky.body.charged === false && flaky.body.status === 503, `flaky answered ${flaky.body.status}, charged=${flaky.body.charged}`);

step("over the per-payment cap: TAB refuses, nothing signed");
const capped = await tool("market_call", { service: "wallet-report", params: { address: owner.publicKey.toBase58() } });
check(capped.body.code === "PAYMENT_EXCEEDS_TAB_LIMIT", `wallet-report ($0.05 > $0.03 cap): ${capped.body.code}`);

step("balance right after: flaky's 0.01 is held, not spent");
let bal = await tool("tab_balance");
console.log(bal.body);
check(BigInt(bal.body.raw.spent) === spent, `spent ${bal.body.spentUsd} = sum of paid receipts`);

step("wait for the failing call's signed payment to expire, then it's released (up to 3 min)");
for (let i = 0; i < 18 && BigInt(bal.body.raw.reserved) > 0n; i++) {
  await new Promise((r) => setTimeout(r, 10_000));
  bal = await tool("tab_balance");
  process.stdout.write(`  held ${bal.body.heldUsd}\n`);
}
check(BigInt(bal.body.raw.reserved) === 0n && BigInt(bal.body.raw.spent) === spent, `held released, spent still ${bal.body.spentUsd}`);

step("ledger vs chain");
const detail = await call(`/v1/tabs/${created.tabId}`);
console.log("db:", { spent: detail.tab.spent, reserved: detail.tab.reserved, remaining: detail.tab.remaining }, "chain allowance:", detail.tab.chain?.delegatedAmount);
check(String(detail.tab.chain?.delegatedAmount) === String(detail.tab.remaining), "on-chain allowance left = TAB's remaining");
console.log("payments:", detail.payments.map((p: any) => `${p.amount}:${p.state}`).join(", "));

step("revoke: the agent is stopped");
const rev = await call(`/v1/tabs/${created.tabId}/revoke`, {});
const after = await tool("market_call", { service: "price", params: { tokens: "SOL" } });
check(after.body.code === "TAB_REVOKED", `after revoke: ${after.body.code}`);
await agent.close();

step("reclaim + close (owner signs)");
const reclaimSig = await signSend(rev.reclaimTransaction);
console.log("reclaim tx", `https://explorer.solana.com/tx/${reclaimSig}?cluster=devnet`);
console.log(await call(`/v1/tabs/${created.tabId}/close`, {}));

console.log(failures ? `\n${failures} check(s) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
