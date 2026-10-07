// Runs spike cases A-G against a running server.ts and writes results.json.
import { PublicKey } from "@solana/web3.js";
import { approve, getAccount, revoke } from "@solana/spl-token";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { conn, loadOrCreate, loadState, DECIMALS, explorer } from "./common.ts";
import { payWithDelegate } from "./pay.ts";

const s = loadState();
const owner = loadOrCreate("owner");
const delegate = loadOrCreate("delegate");
const BASE = `http://localhost:${process.env.SPIKE_PORT ?? 4021}`;
const results: Record<string, any> = {};

async function acct(addr: string, program: string) {
  const a = await getAccount(conn, new PublicKey(addr), "confirmed", new PublicKey(program));
  return { amount: a.amount.toString(), delegatedAmount: a.delegatedAmount.toString(), delegate: a.delegate?.toBase58() ?? null };
}

async function run(name: string, kind: "token" | "token2022", source: string, amountOverride?: bigint) {
  const m = s.mints[kind];
  const before = await acct(source, m.program);
  const r = await payWithDelegate({
    url: `${BASE}/paid/${kind}`, delegate, source: new PublicKey(source), program: new PublicKey(m.program),
    decimals: DECIMALS, amountOverride,
  });
  let txInfo: any;
  if (r.txSignature) {
    await new Promise((res) => setTimeout(res, 2500));
    const tx = await conn.getTransaction(r.txSignature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    const keys = tx?.transaction.message.staticAccountKeys.map((k) => k.toBase58()) ?? [];
    txInfo = { feePayer: keys[0], fee: tx?.meta?.fee, err: tx?.meta?.err ?? null, explorer: explorer(r.txSignature) };
  }
  const after = await acct(source, m.program);
  results[name] = { kind, source, before, after, ...r, txInfo };
  console.log(`\n== ${name}: status ${r.status}`, r.txSignature ? explorer(r.txSignature) : "", r.error ?? "");
  if (r.status !== 200) console.log(JSON.stringify(r.paymentResponse ?? r.body, null, 1).slice(0, 800));
}

await run("A_token_ownerAta", "token", s.mints.token.ownerAta);
await run("B_token2022_ownerAta", "token2022", s.mints.token2022.ownerAta);
await run("C_token_dedicatedNonAta", "token", s.mints.token.dedicated);
// D: shrink the allowance on the dedicated account below the 0.01 price, then pay.
await approve(conn, owner, new PublicKey(s.mints.token.dedicated), delegate.publicKey, owner, 5_000n, [], undefined, new PublicKey(s.mints.token.program));
await run("D_overAllowance", "token", s.mints.token.dedicated);
// E: revoke the delegate on the owner ATA, then try again.
const sig = await revoke(conn, owner, new PublicKey(s.mints.token.ownerAta), owner, [], undefined, new PublicKey(s.mints.token.program));
results.revokeTx = explorer(sig);
await run("E_afterRevoke", "token", s.mints.token.ownerAta);

writeFileSync(join(import.meta.dirname, "results.json"), JSON.stringify(results, (_k, v) => typeof v === "bigint" ? v.toString() : v, 2));
console.log("\nwrote results.json");
