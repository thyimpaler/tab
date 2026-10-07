// Delegate-signed x402 V2 payer. The delegate signs a TransferChecked whose source is
// the owner's token account. The facilitator is the fee payer and adds its signature.
import {
  ComputeBudgetProgram, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction, type Keypair,
} from "@solana/web3.js";
import { createTransferCheckedInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { randomBytes } from "node:crypto";
import { conn } from "./common.ts";

const MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export type PayResult = {
  stage: "402" | "build" | "paid";
  status: number;
  requirements?: any;
  error?: string;
  body?: any;
  paymentResponse?: any;
  txSignature?: string;
};

const b64json = (s: string) => JSON.parse(Buffer.from(s, "base64").toString("utf8"));

export async function payWithDelegate(opts: {
  url: string; delegate: Keypair; source: PublicKey; program: PublicKey; decimals: number; amountOverride?: bigint;
}): Promise<PayResult> {
  const first = await fetch(opts.url);
  if (first.status !== 402) return { stage: "402", status: first.status, error: "expected 402" };
  const header = first.headers.get("PAYMENT-REQUIRED");
  if (!header) return { stage: "402", status: 402, error: "no PAYMENT-REQUIRED header" };
  const required = b64json(header);
  const req = required.accepts.find((a: any) => a.scheme === "exact" && a.network.startsWith("solana:"));
  if (!req) return { stage: "402", status: 402, error: "no solana exact requirement", requirements: required };

  const feePayer = new PublicKey(req.extra.feePayer);
  const mint = new PublicKey(req.asset);
  const dest = getAssociatedTokenAddressSync(mint, new PublicKey(req.payTo), true, opts.program);
  const amount = opts.amountOverride ?? BigInt(req.amount);

  const ixs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 20_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
    createTransferCheckedInstruction(opts.source, mint, dest, opts.delegate.publicKey, amount, opts.decimals, [], opts.program),
    new TransactionInstruction({ programId: MEMO, keys: [], data: Buffer.from(randomBytes(16).toString("hex")) }),
  ];
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const msg = new TransactionMessage({ payerKey: feePayer, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([opts.delegate]); // partial: fee payer slot left empty for the facilitator

  const payload = {
    x402Version: 2,
    resource: required.resource,
    accepted: req,
    payload: { transaction: Buffer.from(tx.serialize()).toString("base64") },
  };
  const second = await fetch(opts.url, {
    headers: { "PAYMENT-SIGNATURE": Buffer.from(JSON.stringify(payload)).toString("base64") },
  });
  const pr = second.headers.get("PAYMENT-RESPONSE");
  const paymentResponse = pr ? b64json(pr) : undefined;
  let body: any = await second.text();
  try { body = JSON.parse(body); } catch {}
  const retryReq = second.headers.get("PAYMENT-REQUIRED");
  return {
    stage: "paid",
    status: second.status,
    requirements: req,
    body,
    paymentResponse: paymentResponse ?? (retryReq ? b64json(retryReq) : undefined),
    txSignature: paymentResponse?.transaction,
  };
}
