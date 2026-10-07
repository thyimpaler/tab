// Demo paid API (devnet only). Real x402 V2 endpoints that a test agent pays from its tab,
// settled by the public x402.org facilitator. Lets anyone see TAB work end to end for free.
import { Hono, type Context } from "hono";
import { Connection } from "@solana/web3.js";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
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
  summary: (c) => ({ url: c.req.query("url") ?? "", summary: "Demo summary. A real service would return generated text here; you just paid 0.25 devnet USDC for it from a capped tab." }),
};

// Tx ids already served through the recovery path (per instance; demo data, soft guard).
const recovered = new Set<string>();

export function demoApp() {
  const app = new Hono().basePath("/api/demo");
  const cfg = config();
  const payTo = process.env.DEMO_MERCHANT;
  if (cfg.network !== "devnet" || !payTo) {
    app.all("*", (c) => c.json({ error: { code: "NOT_FOUND", message: "The demo API runs on devnet only." } }, 404));
    return app;
  }
  const asset = cfg.acceptedMints[0];
  const conn = new Connection(cfg.rpcUrl, "confirmed");

  // The public facilitator sometimes lands the payment but times out confirming it and answers
  // 402 "settlement_pending". We're the merchant here, so check the chain ourselves: if the tx
  // confirmed and paid us at least the price, serve the content instead of a false 402.
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

  const server = new x402ResourceServer(new HTTPFacilitatorClient({ url: process.env.FACILITATOR_URL ?? "https://x402.org/facilitator" }))
    .register(cfg.caip2 as `${string}:${string}`, new ExactSvmScheme());
  const route = (amount: string, description: string) => ({
    accepts: [{ scheme: "exact", network: cfg.caip2, payTo, price: { asset, amount } }],
    description,
  });
  app.use(paymentMiddleware({
    "GET /api/demo/quote": route(DEMO_PRICES.quote, "SOL/USD spot quote"),
    "GET /api/demo/search": route(DEMO_PRICES.search, "Web search, 5 results"),
    "GET /api/demo/summary": route(DEMO_PRICES.summary, "Summarise a page"),
  } as any, server));

  for (const p of Object.keys(CONTENT) as Path[]) app.get(`/${p}`, (c) => c.json(CONTENT[p](c) as any));
  return app;
}
