// Shared helpers for the delegate spike. Devnet only.
import { Connection, Keypair } from "@solana/web3.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
export const NETWORK = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"; // devnet, CAIP-2
export const FACILITATOR = process.env.FACILITATOR_URL ?? "https://x402.org/facilitator";
export const DECIMALS = 6;
export const conn = new Connection(RPC, "confirmed");

const KEYS = join(import.meta.dirname, ".keys");

export function loadOrCreate(name: string): Keypair {
  mkdirSync(KEYS, { recursive: true });
  const p = join(KEYS, `${name}.json`);
  if (existsSync(p)) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));
  const kp = Keypair.generate();
  writeFileSync(p, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

// Public addresses created by setup.ts. No secrets in here.
export type State = {
  owner: string; delegate: string; merchant: string;
  mints: Record<"token" | "token2022", {
    mint: string; program: string; ownerAta: string; dedicated: string; merchantAta: string;
  }>;
};
const STATE = join(import.meta.dirname, ".keys", "state.json");
export const saveState = (s: State) => writeFileSync(STATE, JSON.stringify(s, null, 2));
export const loadState = (): State => JSON.parse(readFileSync(STATE, "utf8"));

export const explorer = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
