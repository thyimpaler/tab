// Shared merchant-side x402 plumbing for TAB's own paid endpoints (the demo API and the market).
import type { Context, MiddlewareHandler } from "hono";
import { Connection, Keypair } from "@solana/web3.js";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import bs58 from "bs58";
import type { x402ResourceServer } from "@x402/hono";
import { registerExactSvmScheme } from "@x402/svm/exact/facilitator";
import { toFacilitatorSvmSigner } from "@x402/svm";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { x402Facilitator } from "@x402/core/facilitator";
import { config } from "./config.js";

export type FacilitatorClient = ConstructorParameters<typeof x402ResourceServer>[0];

const FACILITATOR_TIMEOUT_MS = 20_000;

export const DEFAULT_FACILITATOR = { devnet: "https://x402.org/facilitator", mainnet: "https://facilitator.payai.network" } as const;

/** mainnet + DEMO_FACILITATOR=self: settle in-process with DEMO_FEE_PAYER_KEY instead of a hosted facilitator. */
export const selfFacilitated = () => config().network === "mainnet" && process.env.DEMO_FACILITATOR === "self";

/**
 * The facilitator our paid endpoints settle through.
 *   devnet:  the public x402.org facilitator (free).
 *   mainnet: a hosted facilitator (PayAI by default, DEMO_FACILITATOR_URL to change it) that pays the SOL fee,
 *            or, with DEMO_FACILITATOR=self, an in-process one whose fee payer is DEMO_FEE_PAYER_KEY
 *            (a separate key, never the TAB delegate).
 */
export function makeFacilitator(): { client: FacilitatorClient; feePayer: Keypair | null } {
  const cfg = config();
  if (!selfFacilitated()) {
    // The library waits 90s by default; a cold or slow facilitator should fail fast (nothing is charged) instead.
    return { client: new HTTPFacilitatorClient({ url: process.env.DEMO_FACILITATOR_URL ?? DEFAULT_FACILITATOR[cfg.network], timeoutMs: FACILITATOR_TIMEOUT_MS }), feePayer: null };
  }
  const raw = process.env.DEMO_FEE_PAYER_KEY!.trim();
  const bytes = raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw)) : bs58.decode(raw);
  const local = new x402Facilitator();
  const signerPromise = createKeyPairSignerFromBytes(bytes).then((s) => toFacilitatorSvmSigner(s, { defaultRpcUrl: cfg.rpcUrl }));
  // Lazy: the kit signer is async to build; register on first use.
  let ready: Promise<void> | null = null;
  const init = () => (ready ??= signerPromise.then((signer) => { registerExactSvmScheme(local, { signer, networks: cfg.caip2 as `${string}:${string}` }); }));
  const client = {
    verify: async (p: any, r: any) => { await init(); return local.verify(p, r); },
    settle: async (p: any, r: any) => { await init(); return local.settle(p, r); },
    getSupported: async () => { await init(); return local.getSupported(); },
  } as any;
  return { client, feePayer: Keypair.fromSecretKey(bytes) };
}

// Tx ids already served through the recovery path (per instance; soft guard).
const recovered = new Set<string>();

/**
 * A facilitator can land the payment but time out confirming it and answer 402 "settlement_pending".
 * We're the merchant, so we check the chain ourselves: if the tx confirmed and paid `payTo` at least the
 * price, we serve the content instead of a false 402.
 * Mount it BEFORE paymentMiddleware so it sees the final response.
 */
export function settlementRecovery(o: {
  conn: Connection;
  payTo: string;
  asset: string;
  /** Price in base units for this request, or null if it isn't a paid route. */
  priceOf: (c: Context) => bigint | null;
  /** The content to serve once the payment is confirmed on chain. */
  serve: (c: Context) => Response | Promise<Response>;
}): MiddlewareHandler {
  return async (c, next) => {
    await next();
    if (c.res.status !== 402) return;
    const price = o.priceOf(c);
    if (price === null) return;
    const h = c.res.headers.get("PAYMENT-RESPONSE");
    if (!h) return;
    let r: any;
    try { r = JSON.parse(Buffer.from(h, "base64").toString("utf8")); } catch { return; }
    if (r?.success !== false || r.errorReason !== "settlement_pending" || typeof r.transaction !== "string" || recovered.has(r.transaction)) return;
    for (let i = 0; i < 6; i++) {
      const tx = await o.conn.getTransaction(r.transaction, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null);
      if (tx) {
        if (tx.meta?.err) return;
        const bal = (list: any[] | null | undefined) => BigInt(list?.find((b) => b.owner === o.payTo && b.mint === o.asset)?.uiTokenAmount.amount ?? "0");
        const received = bal(tx.meta?.postTokenBalances) - bal(tx.meta?.preTokenBalances);
        if (received < price) return;
        recovered.add(r.transaction);
        const receipt = Buffer.from(JSON.stringify({ success: true, transaction: r.transaction, network: config().caip2, payer: r.payer })).toString("base64");
        const res = await o.serve(c);
        const headers = new Headers(res.headers);
        headers.set("PAYMENT-RESPONSE", receipt);
        // Clear first: Hono's res setter copies the old response's headers (the failed receipt) onto the new one.
        c.res = undefined;
        c.res = new Response(res.body, { status: res.status, headers });
        return;
      }
      await new Promise((res) => setTimeout(res, 2000));
    }
  };
}
