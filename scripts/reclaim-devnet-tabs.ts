// Devnet cleanup: revoke, reclaim and close every open tab of the spike owner (left by an interrupted e2e run).
//   API=https://tab-devnet.vercel.app/api APP_ORIGIN=https://tab-devnet.vercel.app npx tsx scripts/reclaim-devnet-tabs.ts
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { readFileSync } from "node:fs";

const API = process.env.API ?? "http://localhost:8787/api";
const ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:5173";
const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const owner = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync("spike/.keys/owner.json", "utf8"))));
let cookie = "";
async function call(path: string, body?: unknown) {
  const res = await fetch(API + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", origin: ORIGIN, ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = res.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
  const j: any = await res.json(); if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(j)}`); return j;
}
const { input } = await call("/v1/auth/nonce", {});
const f = [`URI: ${input.uri}`, `Version: ${input.version}`, `Chain ID: ${input.chainId}`, `Nonce: ${input.nonce}`, `Issued At: ${input.issuedAt}`, `Expiration Time: ${input.expirationTime}`];
const message = `${input.domain} wants you to sign in with your Solana account:\n${owner.publicKey.toBase58()}\n\n${input.statement}\n\n${f.join("\n")}`;
await call("/v1/auth/verify", { address: owner.publicKey.toBase58(), message, signature: bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), owner.secretKey)) });
const { tabs } = await call("/v1/tabs");
for (const t of tabs.filter((t: any) => ["active", "empty", "expired", "revoked"].includes(t.status))) {
  // Revoked tabs that still hold funds get their reclaim tx from /close.
  const rev = t.status === "revoked" ? await call(`/v1/tabs/${t.id}/close`, {}) : await call(`/v1/tabs/${t.id}/revoke`, {});
  if (rev.reclaimTransaction) {
    const tx = VersionedTransaction.deserialize(Buffer.from(rev.reclaimTransaction, "base64")); tx.sign([owner]);
    const sig = await conn.sendTransaction(tx); await conn.confirmTransaction(sig, "confirmed");
  }
  console.log(t.id.slice(0, 8), t.status, "->", (await call(`/v1/tabs/${t.id}/close`, {})).status);
}
console.log("open tabs handled:", tabs.filter((t: any) => t.status !== "closed").length);
