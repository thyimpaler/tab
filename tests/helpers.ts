import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { randomBytes } from "node:crypto";
import { inject } from "vitest";
import type { Chain, TxLookup } from "../src/server/chain.ts";

export const MINT = Keypair.generate().publicKey.toBase58();
export const OTHER_MINT = Keypair.generate().publicKey.toBase58();
export const MERCHANT = Keypair.generate().publicKey.toBase58();
export const FACILITATOR = Keypair.generate().publicKey.toBase58();
export const DELEGATE = Keypair.generate();

export function setTestEnv() {
  process.env.DATABASE_URL = inject("databaseUrl");
  process.env.CREDENTIAL_HASH_SECRET = "test-pepper";
  process.env.SESSION_SECRET = "test-session";
  process.env.DELEGATE_PRIVATE_KEY = bs58.encode(DELEGATE.secretKey);
  process.env.ACCEPTED_MINTS = MINT;
  process.env.SOLANA_NETWORK = "devnet";
  process.env.PG_POOL_MAX = "25";
}

/** In-memory chain. Tests control block height and which txs "landed". */
export class FakeChain implements Chain {
  height = 100n;
  lastValid = 250n;
  landed = new Map<string, { ok: boolean; id: string }>(); // delegate sig -> tx
  rpcDown = false;
  async getLatestBlockhash() {
    if (this.rpcDown) throw new Error("rpc down");
    return { blockhash: bs58.encode(randomBytes(32)), lastValidBlockHeight: this.lastValid };
  }
  async getBlockHeight() {
    if (this.rpcDown) throw new Error("rpc down");
    return this.height;
  }
  async getTokenAccount(_address: string): Promise<import("../src/server/chain.ts").TokenAccountInfo | null> { return null; }
  async getMint(address: string) { return { address, program: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", decimals: 6, extensions: [] }; }
  async getTx(signature: string): Promise<TxLookup> {
    if (this.rpcDown) throw new Error("rpc down");
    for (const [del, t] of this.landed) if (t.id === signature) return { found: true, ok: t.ok, signatures: [t.id, del] };
    return { found: false };
  }
  async findTxBySigner(_account: string, delegateSignature: string): Promise<TxLookup> {
    if (this.rpcDown) throw new Error("rpc down");
    const t = this.landed.get(delegateSignature);
    return t ? { found: true, ok: t.ok, signatures: [t.id, delegateSignature] } : { found: false };
  }
  land(delegateSig: string, ok = true) {
    const id = bs58.encode(randomBytes(64));
    this.landed.set(delegateSig, { ok, id });
    return id;
  }
}

export function paymentRequired(over: Partial<{ amount: string; payTo: string; asset: string; network: string; scheme: string }> = {}) {
  return {
    x402Version: 2,
    resource: { url: "https://api.example.com/data" },
    accepts: [{
      scheme: over.scheme ?? "exact",
      network: over.network ?? "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
      asset: over.asset ?? MINT,
      amount: over.amount ?? "10000",
      payTo: over.payTo ?? MERCHANT,
      maxTimeoutSeconds: 60,
      extra: { feePayer: FACILITATOR },
    }],
  };
}
