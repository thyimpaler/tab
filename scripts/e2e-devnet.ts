// Full end-to-end on devnet against a running local API (npm run dev:api) with
// ACCEPTED_MINTS set to the spike's test mint. Plays the user with the spike owner keypair:
// SIWS sign-in -> create tab -> sign+send -> activate -> SDK pays the demo API through the
// public x402 facilitator -> confirm -> revoke -> reclaim tx -> close. Prints no secrets.
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { readFileSync } from "node:fs";
import { Tab } from "../packages/sdk/src/index.ts";

const API = process.env.API ?? "http://localhost:8787/api";
const ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:5173";
const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const owner = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync("spike/.keys/owner.json", "utf8"))));
let cookie = "";

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

step("sign in (SIWS message signature)");
const { input } = await call("/v1/auth/nonce", {});
const f = [`URI: ${input.uri}`, `Version: ${input.version}`, `Chain ID: ${input.chainId}`, `Nonce: ${input.nonce}`, `Issued At: ${input.issuedAt}`, `Expiration Time: ${input.expirationTime}`];
const message = `${input.domain} wants you to sign in with your Solana account:\n${owner.publicKey.toBase58()}\n\n${input.statement}\n\n${f.join("\n")}`;
const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), owner.secretKey));
console.log(await call("/v1/auth/verify", { address: owner.publicKey.toBase58(), message, signature }));
console.log("replayed nonce rejected:", await call("/v1/auth/verify", { address: owner.publicKey.toBase58(), message, signature }).then(() => "NO (bug)", (e) => e.message.includes("401") ? "yes" : e.message));

step("create tab: limit 0.30, cap 0.10, 1 day, allowlist = demo merchant");
const cfg = await call("/v1/config");
const merchant = JSON.parse(readFileSync("spike/.keys/state.json", "utf8")).merchant;
const created = await call("/v1/tabs", {
  label: "e2e research agent", limit: "300000", perPaymentCap: "100000",
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(), allowlist: [merchant], mint: cfg.mints[0],
});
console.log("tab", created.tabId, "account", created.tokenAccount);
const createSig = await signSend(created.transaction);
console.log("create tx", `https://explorer.solana.com/tx/${createSig}?cluster=devnet`);

step("activate (on-chain verification, credential shown once)");
const { credential } = await call(`/v1/tabs/${created.tabId}/activate`, { signature: createSig });
console.log("credential issued:", credential.slice(0, 14) + "…");
console.log("activate twice rejected:", await call(`/v1/tabs/${created.tabId}/activate`, {}).then(() => "NO (bug)", () => "yes"));

step("agent pays the demo API via SDK (real x402 facilitator)");
const events: any[] = [];
const tab = new Tab({ credential, maxPayment: 100_000, apiUrl: API, onPayment: (e) => events.push(e) });
for (const path of ["quote", "search", "quote"]) {
  const r = await tab.fetch(`${API}/demo/${path}`);
  console.log(path, r.status, (await r.text()).slice(0, 80));
}
console.log("payments:", events.map((e) => `${e.amount}@${e.status} ${e.transaction?.slice(0, 8) ?? "-"}`).join(", "));

step("over the cap is refused, nothing signed");
await tab.fetch(`${API}/demo/summary`).then(() => console.log("NO (bug)"), (e) => console.log("refused:", e.code));

step("balance");
console.log(await tab.balance());
const detail = await call(`/v1/tabs/${created.tabId}`);
console.log("db:", { spent: detail.tab.spent, reserved: detail.tab.reserved, remaining: detail.tab.remaining }, "chain:", detail.tab.chain);
console.log("payment states:", detail.payments.map((p: any) => p.state).join(", "));

step("revoke -> signing stops immediately");
const rev = await call(`/v1/tabs/${created.tabId}/revoke`, {});
await tab.fetch(`${API}/demo/quote`).then(() => console.log("NO (bug)"), (e) => console.log("after revoke:", e.code));

step("reclaim: user signs revoke + sweep + close");
const reclaimSig = await signSend(rev.reclaimTransaction);
console.log("reclaim tx", `https://explorer.solana.com/tx/${reclaimSig}?cluster=devnet`);
console.log(await call(`/v1/tabs/${created.tabId}/close`, {}));
