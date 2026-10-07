// Demo paid API (devnet only). Real x402 V2 endpoints that a test agent pays from its tab,
// settled by the public x402.org facilitator. Lets anyone see TAB work end to end for free.
import { Hono } from "hono";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { config } from "./config.js";

export const DEMO_PRICES = {
  quote: "10000",     // 0.01
  search: "50000",    // 0.05
  summary: "250000",  // 0.25
} as const;

export function demoApp() {
  const app = new Hono().basePath("/api/demo");
  const cfg = config();
  const payTo = process.env.DEMO_MERCHANT;
  if (cfg.network !== "devnet" || !payTo) {
    app.all("*", (c) => c.json({ error: { code: "NOT_FOUND", message: "The demo API runs on devnet only." } }, 404));
    return app;
  }
  const server = new x402ResourceServer(new HTTPFacilitatorClient({ url: process.env.FACILITATOR_URL ?? "https://x402.org/facilitator" }))
    .register(cfg.caip2 as `${string}:${string}`, new ExactSvmScheme());
  const route = (amount: string, description: string) => ({
    accepts: [{ scheme: "exact", network: cfg.caip2, payTo, price: { asset: cfg.acceptedMints[0], amount } }],
    description,
  });
  app.use(paymentMiddleware({
    "GET /api/demo/quote": route(DEMO_PRICES.quote, "SOL/USD spot quote"),
    "GET /api/demo/search": route(DEMO_PRICES.search, "Web search, 5 results"),
    "GET /api/demo/summary": route(DEMO_PRICES.summary, "Summarise a page"),
  } as any, server));

  app.get("/quote", (c) => c.json({ pair: "SOL/USD", note: "demo data", price: (140 + Math.random() * 10).toFixed(2), at: new Date().toISOString() }));
  app.get("/search", (c) => c.json({ q: c.req.query("q") ?? "", results: [
    { title: "x402: HTTP 402 payments", url: "https://x402.org" },
    { title: "SPL Token: delegates and allowances", url: "https://spl.solana.com/token" },
    { title: "Solana devnet faucet", url: "https://faucet.solana.com" },
  ] }));
  app.get("/summary", (c) => c.json({ url: c.req.query("url") ?? "", summary: "Demo summary. A real service would return generated text here; you just paid 0.25 devnet USDC for it from a capped tab." }));
  return app;
}
