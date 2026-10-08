// Demo paid API: real x402 V2 endpoints that a test agent pays from its tab.
//   devnet:  settled by the public x402.org facilitator (free).
//   mainnet: settled by a hosted facilitator (PayAI by default, DEMO_FACILITATOR_URL to change it), which
//            pays the SOL network fee itself, so TAB keeps no fee-payer wallet to top up. Each call
//            pays real USDC to DEMO_MERCHANT (the owner's wallet), so the demo funds itself.
//            DEMO_FACILITATOR=self switches back to the in-process facilitator, whose fee payer is
//            DEMO_FEE_PAYER_KEY (a separate key, never the TAB delegate).
import { Hono, type Context } from "hono";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import bs58 from "bs58";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { registerExactSvmScheme } from "@x402/svm/exact/facilitator";
import { toFacilitatorSvmSigner } from "@x402/svm";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { x402Facilitator } from "@x402/core/facilitator";
import { config } from "./config.js";

export const DEMO_PRICES = {
  quote: "10000",     // 0.01
  search: "50000",    // 0.05
  summary: "250000",  // 0.25
} as const;

type Path = keyof typeof DEMO_PRICES;

const CONTENT: Record<Path, (c: Context) => unknown> = {
  quote: () => ({ pair: "SOL/USD", note: "demo data", price: (140 + Math.random() * 10).toFixed(2), at: new Date().toISOString() }),
  search: (c) => ({ q: c.req.query("q") ?? "", results: [
    { title: "x402: HTTP 402 payments", url: "https://x402.org" },
    { title: "SPL Token: delegates and allowances", url: "https://spl.solana.com/token" },
    { title: "Solana devnet faucet", url: "https://faucet.solana.com" },
  ] }),
  summary: (c) => ({ url: c.req.query("url") ?? "", summary: "Demo summary. A real service would return generated text here; you just paid for it from a capped tab." }),
};

// Below this the mainnet demo pauses instead of failing mid-settlement (~400 calls of headroom).
const MIN_FEE_PAYER_LAMPORTS = 0.002 * LAMPORTS_PER_SOL;

// Tx ids already served through the recovery path (per instance; demo data, soft guard).
const recovered = new Set<string>();

/** Whether this deployment serves the demo API (used by /v1/config so the UI can show the test agent). */
const selfFacilitated = () => config().network === "mainnet" && process.env.DEMO_FACILITATOR === "self";
const DEFAULT_FACILITATOR = { devnet: "https://x402.org/facilitator", mainnet: "https://facilitator.payai.network" } as const;

export function demoEnabled(): boolean {
  if (!process.env.DEMO_MERCHANT) return false;
  return !selfFacilitated() || !!process.env.DEMO_FEE_PAYER_KEY;
}

export function demoApp() {
  const app = new Hono().basePath("/api/demo");
  const cfg = config();
  const payTo = process.env.DEMO_MERCHANT!;
  if (!demoEnabled()) {
    app.all("*", (c) => c.json({ error: { code: "NOT_FOUND", message: "The demo API isn't enabled on this deployment." } }, 404));
    return app;
  }
  const asset = cfg.acceptedMints[0];
  const conn = new Connection(cfg.rpcUrl, "confirmed");

  let facilitatorClient: ConstructorParameters<typeof x402ResourceServer>[0];
  let feePayer: Keypair | null = null;
  if (selfFacilitated()) {
    const raw = process.env.DEMO_FEE_PAYER_KEY!.trim();
    const bytes = raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw)) : bs58.decode(raw);
    feePayer = Keypair.fromSecretKey(bytes);
    const local = new x402Facilitator();
    const signerPromise = createKeyPairSignerFromBytes(bytes).then((s) => toFacilitatorSvmSigner(s, { defaultRpcUrl: cfg.rpcUrl }));
    // Lazy: the kit signer is async to build; register on first use.
    let ready: Promise<void> | null = null;
    const init = () => (ready ??= signerPromise.then((signer) => { registerExactSvmScheme(local, { signer, networks: cfg.caip2 as `${string}:${string}` }); }));
    facilitatorClient = {
      verify: async (p: any, r: any) => { await init(); return local.verify(p, r); },
      settle: async (p: any, r: any) => { await init(); return local.settle(p, r); },
      getSupported: async () => { await init(); return local.getSupported(); },
    } as any;
  } else {
    facilitatorClient = new HTTPFacilitatorClient({ url: process.env.DEMO_FACILITATOR_URL ?? DEFAULT_FACILITATOR[cfg.network] });
  }

  // Mainnet: pause cleanly if the fee payer can't cover fees.
  if (feePayer) {
    const fp = feePayer.publicKey;
    app.use(async (c, next) => {
      const lamports = await conn.getBalance(fp, "confirmed").catch(() => null);
      if (lamports !== null && lamports < MIN_FEE_PAYER_LAMPORTS) {
        return c.json({ error: { code: "DEMO_PAUSED", message: "The demo service is paused while it's topped up. Your tab wasn't charged." } }, 503);
      }
      await next();
    });
  }

  // A facilitator can land the payment but time out confirming it and answer 402 "settlement_pending".
  // We're the merchant here, so check the chain ourselves: if the tx confirmed and paid us at least the
  // price, serve the content instead of a false 402.
  app.use(async (c, next) => {
    await next();
    if (c.res.status !== 402) return;
    const path = c.req.path.split("/").pop() as Path;
    if (!(path in DEMO_PRICES)) return;
    const h = c.res.headers.get("PAYMENT-RESPONSE");
    if (!h) return;
    let r: any;
    try { r = JSON.parse(Buffer.from(h, "base64").toString("utf8")); } catch { return; }
    if (r?.success !== false || r.errorReason !== "settlement_pending" || typeof r.transaction !== "string" || recovered.has(r.transaction)) return;
    for (let i = 0; i < 6; i++) {
      const tx = await conn.getTransaction(r.transaction, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null);
      if (tx) {
        if (tx.meta?.err) return;
        const bal = (list: any[] | null | undefined) => BigInt(list?.find((b) => b.owner === payTo && b.mint === asset)?.uiTokenAmount.amount ?? "0");
        const received = bal(tx.meta?.postTokenBalances) - bal(tx.meta?.preTokenBalances);
        if (received < BigInt(DEMO_PRICES[path])) return;
        recovered.add(r.transaction);
        const receipt = Buffer.from(JSON.stringify({ success: true, transaction: r.transaction, network: cfg.caip2, payer: r.payer })).toString("base64");
        c.res = new Response(JSON.stringify(CONTENT[path](c)), { status: 200, headers: { "content-type": "application/json", "PAYMENT-RESPONSE": receipt } });
        return;
      }
      await new Promise((res) => setTimeout(res, 2000));
    }
  });

  const server = new x402ResourceServer(facilitatorClient).register(cfg.caip2 as `${string}:${string}`, new ExactSvmScheme());
  const route = (amount: string, description: string) => ({
    accepts: [{ scheme: "exact", network: cfg.caip2, payTo, price: { asset, amount } }],
    description,
  });
  app.use(paymentMiddleware({
    "GET /api/demo/quote": route(DEMO_PRICES.quote, "SOL/USD spot quote"),
    "GET /api/demo/search": route(DEMO_PRICES.search, "Web search, 3 results"),
    "GET /api/demo/summary": route(DEMO_PRICES.summary, "Summarise a page"),
  } as any, server));

  for (const p of Object.keys(CONTENT) as Path[]) app.get(`/${p}`, (c) => c.json(CONTENT[p](c) as any));
  return app;
}
