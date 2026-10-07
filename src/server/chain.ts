// Everything that touches Solana RPC goes through this interface, so tests can swap in a fake.
import { Connection, PublicKey } from "@solana/web3.js";
import {
  AccountLayout, AccountState, ExtensionType, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID,
  getExtensionTypes, unpackMint,
} from "@solana/spl-token";

import bs58 from "bs58";
import { config } from "./config.js";

export type TokenAccountInfo = {
  address: string;
  program: string;
  mint: string;
  owner: string;
  amount: bigint;
  delegate: string | null;
  delegatedAmount: bigint;
  closeAuthority: string | null;
  frozen: boolean;
};

export type MintInfo = { address: string; program: string; decimals: number; extensions: string[] };

export type TxLookup = { found: false } | { found: true; ok: boolean; signatures: string[] };

export interface Chain {
  getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: bigint }>;
  getBlockHeight(): Promise<bigint>;
  getTokenAccount(address: string): Promise<TokenAccountInfo | null>;
  getMint(address: string): Promise<MintInfo | null>;
  /** Looks up a tx by its id (first signature). */
  getTx(signature: string): Promise<TxLookup>;
  /** Searches recent txs touching `account` for one carrying `delegateSignature`. */
  findTxBySigner(account: string, delegateSignature: string, limit?: number): Promise<TxLookup>;
}

// Token-2022 extensions that would let someone else move, tax, hook or hide the funds.
// The first five are invariant 9; the last three can freeze or rescale balances under us.
export const BANNED_EXTENSIONS = new Set<string>([
  "PermanentDelegate", "TransferHook", "TransferFeeConfig", "NonTransferable", "ConfidentialTransferMint",
  "DefaultAccountState", "PausableConfig", "ScaledUiAmountConfig",
]);

export class RpcChain implements Chain {
  conn: Connection;
  private bh?: { at: number; v: { blockhash: string; lastValidBlockHeight: bigint } };

  constructor(rpcUrl = config().rpcUrl) {
    this.conn = new Connection(rpcUrl, "confirmed");
  }

  async getLatestBlockhash() {
    // Cache ~15s. A blockhash is valid for ~60-90s, so this leaves plenty of window.
    if (this.bh && Date.now() - this.bh.at < 15_000) return this.bh.v;
    const r = await this.conn.getLatestBlockhash("confirmed");
    const v = { blockhash: r.blockhash, lastValidBlockHeight: BigInt(r.lastValidBlockHeight) };
    this.bh = { at: Date.now(), v };
    return v;
  }

  async getBlockHeight() {
    return BigInt(await this.conn.getBlockHeight("confirmed"));
  }

  async getTokenAccount(address: string): Promise<TokenAccountInfo | null> {
    const info = await this.conn.getAccountInfo(new PublicKey(address), "confirmed");
    if (!info) return null;
    const program = info.owner.toBase58();
    if (program !== TOKEN_PROGRAM_ID.toBase58() && program !== TOKEN_2022_PROGRAM_ID.toBase58()) return null;
    if (info.data.length < AccountLayout.span) return null;
    const a = AccountLayout.decode(info.data.subarray(0, AccountLayout.span));
    return {
      address, program,
      mint: a.mint.toBase58(),
      owner: a.owner.toBase58(),
      amount: a.amount,
      delegate: a.delegateOption ? a.delegate.toBase58() : null,
      delegatedAmount: a.delegateOption ? a.delegatedAmount : 0n,
      closeAuthority: a.closeAuthorityOption ? a.closeAuthority.toBase58() : null,
      frozen: a.state === AccountState.Frozen,
    };
  }

  async getMint(address: string): Promise<MintInfo | null> {
    const pk = new PublicKey(address);
    const info = await this.conn.getAccountInfo(pk, "confirmed");
    if (!info) return null;
    const program = info.owner;
    if (!program.equals(TOKEN_PROGRAM_ID) && !program.equals(TOKEN_2022_PROGRAM_ID)) return null;
    const m = unpackMint(pk, info, program);
    const extensions = program.equals(TOKEN_2022_PROGRAM_ID)
      ? getExtensionTypes(m.tlvData).map((t) => ExtensionType[t])
      : [];
    return { address, program: program.toBase58(), decimals: m.decimals, extensions };
  }

  async getTx(signature: string): Promise<TxLookup> {
    const tx = await this.conn.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    if (!tx) return { found: false };
    return { found: true, ok: tx.meta?.err == null, signatures: tx.transaction.signatures };
  }

  async findTxBySigner(account: string, delegateSignature: string, limit = 50): Promise<TxLookup> {
    const sigs = await this.conn.getSignaturesForAddress(new PublicKey(account), { limit }, "confirmed");
    for (const s of sigs) {
      const tx = await this.getTx(s.signature);
      if (tx.found && tx.signatures.includes(delegateSignature)) return tx;
    }
    return { found: false };
  }
}

let chainInstance: Chain | undefined;
export const chain = (): Chain => (chainInstance ??= new RpcChain());
export const setChain = (c: Chain | undefined) => { chainInstance = c; };

export const isBase58Pubkey = (s: unknown): s is string => {
  if (typeof s !== "string" || s.length < 32 || s.length > 44) return false;
  try { return bs58.decode(s).length === 32; } catch { return false; }
};
