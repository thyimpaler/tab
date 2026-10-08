// Pushes production env vars to Vercel without printing secrets. Generates fresh secrets once,
// keeps a local copy in .env.vercel (gitignored). Usage: node scripts/vercel-env.mjs
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const FILE = ".env.vercel";
const env = existsSync(FILE) ? Object.fromEntries(readFileSync(FILE, "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])) : {};
const local = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
env.SOLANA_NETWORK ??= "devnet";
env.SOLANA_RPC_URL ??= "https://api.devnet.solana.com";
env.ACCEPTED_MINTS ??= "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
env.DELEGATE_PRIVATE_KEY ??= bs58.encode(Keypair.generate().secretKey);
env.CREDENTIAL_HASH_SECRET ??= randomBytes(32).toString("hex");
env.SESSION_SECRET ??= randomBytes(32).toString("hex");
env.CRON_SECRET ??= randomBytes(24).toString("hex");
env.DEMO_MERCHANT ??= local.DEMO_MERCHANT;
env.APP_ORIGIN = process.env.APP_ORIGIN ?? env.APP_ORIGIN ?? "https://tabpay.si";
env.PG_POOL_MAX ??= "3";
if (local.NEON_DATABASE_URL) env.DATABASE_URL = local.NEON_DATABASE_URL;
writeFileSync(FILE, "# Vercel production env (devnet). NEVER commit.\n" + Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");

const only = process.argv.slice(2);
for (const [k, v] of Object.entries(env)) {
  if (only.length && !only.includes(k)) continue;
  try { execSync(`npx vercel env rm ${k} production --yes`, { stdio: "ignore" }); } catch {}
  execSync(`npx vercel env add ${k} production`, { input: v, stdio: ["pipe", "ignore", "pipe"] });
  console.log("set", k);
}
console.log("delegate pubkey", Keypair.fromSecretKey(bs58.decode(env.DELEGATE_PRIVATE_KEY)).publicKey.toBase58());
