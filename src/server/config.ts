import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

export type Network = "devnet" | "mainnet";

// CAIP-2 ids used by x402 V2.
export const CAIP2: Record<Network, string> = {
  devnet: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  mainnet: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
};

// Verified on chain 2026-10-07: mainnet = Circle USDC (Token program, 6 dp); devnet = Circle devnet USDC.
export const USDC: Record<Network, string> = {
  devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  mainnet: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

let cached: ReturnType<typeof load> | undefined;

function load() {
  const network = (process.env.SOLANA_NETWORK ?? "devnet") as Network;
  if (network !== "devnet" && network !== "mainnet") throw new Error("SOLANA_NETWORK must be devnet or mainnet");
  // Comma-separated: V1 ships USDC only. Never hardcoded in logic, always read from here / the tab row.
  const mints = (process.env.ACCEPTED_MINTS ?? process.env.USDC_MINT ?? USDC[network])
    .split(",").map((s) => s.trim()).filter(Boolean);
  return {
    network,
    caip2: CAIP2[network],
    rpcUrl: process.env.SOLANA_RPC_URL ?? (network === "devnet" ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com"),
    acceptedMints: mints,
    databaseUrl: req("DATABASE_URL"),
    credentialPepper: req("CREDENTIAL_HASH_SECRET"),
    sessionSecret: req("SESSION_SECRET"),
    appOrigin: process.env.APP_ORIGIN ?? "http://localhost:5173",
    // Every origin the dashboard may be served from (sign-in domain + cookie-route origin check).
    // APP_ORIGIN first; APP_ALT_ORIGINS (comma-separated) adds more, e.g. while moving domains.
    appOrigins: [...new Set([process.env.APP_ORIGIN ?? "http://localhost:5173", ...(process.env.APP_ALT_ORIGINS ?? "https://tappay.si").split(",")]
      .map((s) => s.trim()).filter(Boolean).map((s) => new URL(s).origin))],
    // Fee charged when a tab is opened, in the tab mint's base units, paid to TREASURY_WALLET.
    // Off unless both are set.
    tabFee: process.env.TAB_FEE && process.env.TREASURY_WALLET ? BigInt(process.env.TAB_FEE) : 0n,
    treasury: process.env.TAB_FEE && process.env.TREASURY_WALLET ? process.env.TREASURY_WALLET : null,
  };
}

export function config() {
  return (cached ??= load());
}

/** Test hook. */
export function resetConfig() {
  cached = undefined;
  delegateCache = undefined;
}

let delegateCache: Keypair | undefined;

/** Delegate key: loaded only from env. Never logged, never returned. */
export function delegateKeypair(): Keypair {
  if (delegateCache) return delegateCache;
  const raw = req("DELEGATE_PRIVATE_KEY").trim();
  const bytes = raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw)) : bs58.decode(raw);
  delegateCache = Keypair.fromSecretKey(bytes);
  return delegateCache;
}

export function delegatePubkey(): PublicKey {
  return delegateKeypair().publicKey;
}
