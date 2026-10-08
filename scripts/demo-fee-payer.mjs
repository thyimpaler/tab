// Only for DEMO_FACILITATOR=self (the default mainnet demo uses a hosted facilitator that pays its own fees).
// Prints the self-run demo fee payer's address and SOL balance, so you know where to send SOL.
// Reads DEMO_FEE_PAYER_KEY from .env.vercel or .env (never prints the key). Usage: node scripts/demo-fee-payer.mjs
import { existsSync, readFileSync } from "node:fs";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";

const file = [".env.vercel", ".env"].find((f) => existsSync(f) && /^DEMO_FEE_PAYER_KEY=/m.test(readFileSync(f, "utf8")));
if (!file) throw new Error("DEMO_FEE_PAYER_KEY not found in .env.vercel or .env");
const raw = readFileSync(file, "utf8").match(/^DEMO_FEE_PAYER_KEY=(.*)$/m)[1].trim().replace(/^["']|["']$/g, "");
const kp = Keypair.fromSecretKey(raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw)) : bs58.decode(raw));
const rpc = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const lamports = await new Connection(rpc, "confirmed").getBalance(kp.publicKey).catch(() => null);
console.log(`demo fee payer (from ${file}): ${kp.publicKey.toBase58()}`);
console.log(lamports === null ? "balance: couldn't reach Solana" : `balance: ${lamports / LAMPORTS_PER_SOL} SOL (demo pauses below 0.002)`);
