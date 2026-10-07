// x402 V2, `exact` scheme on Solana. Builds the payment tx the facilitator expects:
// [SetComputeUnitLimit, SetComputeUnitPrice, TransferChecked, Memo], fee payer = facilitator,
// authority = our delegate, source = the TAB's dedicated token account. Delegate partial-signs.
import {
  ComputeBudgetProgram, Keypair, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction,
} from "@solana/web3.js";
import { createTransferCheckedInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { randomBytes } from "node:crypto";
import bs58 from "bs58";
import { TabError } from "./errors.ts";
import { isBase58Pubkey } from "./chain.ts";

export const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const CU_LIMIT = 20_000;
const CU_PRICE_MICROLAMPORTS = 1;
const MAX_MEMO_BYTES = 256;

export type Requirement = {
  scheme: "exact";
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { feePayer: string; memo?: string; [k: string]: unknown };
};

export type PaymentRequired = { x402Version: number; resource?: unknown; accepts: unknown[]; error?: string };

/** Accepts the decoded PAYMENT-REQUIRED object or the raw base64 header value. */
export function decodePaymentRequired(input: unknown): PaymentRequired {
  let v = input;
  if (typeof v === "string") {
    try { v = JSON.parse(Buffer.from(v, "base64").toString("utf8")); } catch {
      throw new TabError("UNSUPPORTED_PAYMENT_REQUIREMENT", "PAYMENT-REQUIRED is not valid base64 JSON");
    }
  }
  const pr = v as PaymentRequired;
  if (!pr || typeof pr !== "object" || !Array.isArray(pr.accepts)) {
    throw new TabError("UNSUPPORTED_PAYMENT_REQUIREMENT", "missing accepts[]");
  }
  if (pr.x402Version !== 2) throw new TabError("UNSUPPORTED_PAYMENT_REQUIREMENT", "only x402 V2 is supported");
  return pr;
}

/**
 * Picks the requirement TAB can pay: exact scheme, our network, and (preferably) the tab's mint.
 * If the network matches but no option uses the tab's mint -> UNSUPPORTED_MINT.
 */
export function selectRequirement(pr: PaymentRequired, caip2: string, mint: string): Requirement {
  const onNetwork = pr.accepts.filter((a: any) => a?.scheme === "exact" && a?.network === caip2) as any[];
  if (onNetwork.length === 0) throw new TabError("UNSUPPORTED_PAYMENT_REQUIREMENT", `no exact option on ${caip2}`);
  const r = onNetwork.find((a) => a.asset === mint);
  if (!r) throw new TabError("UNSUPPORTED_MINT", "service does not accept this tab's token");
  if (typeof r.amount !== "string" || !/^[1-9][0-9]{0,30}$/.test(r.amount)) {
    throw new TabError("UNSUPPORTED_PAYMENT_REQUIREMENT", "amount must be a positive integer string");
  }
  if (!isBase58Pubkey(r.payTo)) throw new TabError("UNSUPPORTED_PAYMENT_REQUIREMENT", "bad payTo");
  if (!isBase58Pubkey(r.extra?.feePayer)) throw new TabError("UNSUPPORTED_PAYMENT_REQUIREMENT", "missing extra.feePayer");
  if (r.extra.memo !== undefined && (typeof r.extra.memo !== "string" || Buffer.byteLength(r.extra.memo) > MAX_MEMO_BYTES)) {
    throw new TabError("UNSUPPORTED_PAYMENT_REQUIREMENT", "bad memo");
  }
  return r as Requirement;
}

export type SignedPayment = {
  header: string;               // PAYMENT-SIGNATURE value
  delegateSignature: string;    // base58, our signature inside the tx
  lastValidBlockHeight: bigint;
};

export function buildDelegatePayment(args: {
  pr: PaymentRequired;
  req: Requirement;
  source: string;               // TAB token account
  tokenProgram: string;
  decimals: number;
  delegate: Keypair;
  blockhash: string;
  lastValidBlockHeight: bigint;
}): SignedPayment {
  const { req, delegate } = args;
  const feePayer = new PublicKey(req.extra.feePayer);
  if (feePayer.equals(delegate.publicKey)) throw new TabError("UNSUPPORTED_PAYMENT_REQUIREMENT", "fee payer cannot be the delegate");
  const program = new PublicKey(args.tokenProgram);
  const mint = new PublicKey(req.asset);
  const dest = getAssociatedTokenAddressSync(mint, new PublicKey(req.payTo), true, program);
  const memo = req.extra.memo ?? randomBytes(16).toString("hex");

  const msg = new TransactionMessage({
    payerKey: feePayer,
    recentBlockhash: args.blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: CU_LIMIT }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: CU_PRICE_MICROLAMPORTS }),
      createTransferCheckedInstruction(
        new PublicKey(args.source), mint, dest, delegate.publicKey, BigInt(req.amount), args.decimals, [], program,
      ),
      new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [], data: Buffer.from(memo, "utf8") }),
    ],
  }).compileToV0Message();

  const tx = new VersionedTransaction(msg);
  tx.sign([delegate]);
  const idx = msg.staticAccountKeys.findIndex((k) => k.equals(delegate.publicKey));
  const delegateSignature = bs58.encode(tx.signatures[idx]);

  const payload = {
    x402Version: 2,
    resource: args.pr.resource,
    accepted: req,
    payload: { transaction: Buffer.from(tx.serialize()).toString("base64") },
  };
  return {
    header: Buffer.from(JSON.stringify(payload)).toString("base64"),
    delegateSignature,
    lastValidBlockHeight: args.lastValidBlockHeight,
  };
}
