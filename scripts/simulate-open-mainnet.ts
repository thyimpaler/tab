// Builds the real open-tab transaction (production code path, mainnet, fee on) for a wallet that
// holds USDC, then SIMULATES it on mainnet with sigVerify off. Nothing is signed or sent; no funds move.
// Uses the local dev DB for the pending row. Usage: npx tsx scripts/simulate-open-mainnet.ts
import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const RPC = "https://api.mainnet-beta.solana.com";
process.env.SOLANA_NETWORK = "mainnet";
process.env.SOLANA_RPC_URL = RPC;
process.env.ACCEPTED_MINTS = USDC;
process.env.DATABASE_URL = "postgres://tab:tab@127.0.0.1:54329/tab";
process.env.CREDENTIAL_HASH_SECRET = "sim";
process.env.SESSION_SECRET = "sim";
process.env.DELEGATE_PRIVATE_KEY = bs58.encode(Keypair.generate().secretKey); // throwaway; nothing is signed by it
process.env.TAB_FEE = "200000";
process.env.TREASURY_WALLET = "3VjaxvebqEA8J6gCLLwU6Vu1jYdNQH4cYKFMiPN8cBmH";
process.env.MAX_TAB_LIMIT = "1000000000";

const conn = new Connection(RPC, "confirmed");

// Find an ordinary wallet (on-curve owner) holding a few USDC to simulate as.
async function findHolder(): Promise<string> {
  const sigs = await conn.getSignaturesForAddress(new PublicKey(USDC), { limit: 40 });
  for (const s of sigs) {
    const tx = await conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 }).catch(() => null);
    for (const b of tx?.meta?.postTokenBalances ?? []) {
      if (b.mint !== USDC || !b.owner) continue;
      const amt = BigInt(b.uiTokenAmount.amount);
      if (amt >= 2_000_000n && amt < 10_000_000_000n && PublicKey.isOnCurve(new PublicKey(b.owner).toBytes())) return b.owner;
    }
  }
  throw new Error("no suitable USDC holder found in recent activity, rerun");
}

const { migrate } = await import("../src/server/migrate.ts");
const { db, closeDb } = await import("../src/server/db.ts");
const { createTab } = await import("../src/server/tabs.ts");
await migrate(db(), () => {});

const wallet = await findHolder();
console.log("simulating as USDC holder", wallet.slice(0, 6) + "…");
const out = await createTab(wallet, { label: "mainnet sim", limit: "1000000", perPaymentCap: "100000", expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
const tx = VersionedTransaction.deserialize(Buffer.from(out.transaction, "base64"));
console.log("instructions:", tx.message.compiledInstructions.length, "fee:", out.fee);
const sim = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
console.log("simulation err:", JSON.stringify(sim.value.err));
console.log("compute units:", sim.value.unitsConsumed);
for (const l of sim.value.logs ?? []) if (/invoke \[1\]|success|failed|Error|Instruction:/.test(l)) console.log("  ", l);
await db().query(`DELETE FROM tabs WHERE id = $1`, [out.tabId]); // sim row only
await closeDb();
