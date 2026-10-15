// Demo paid API: real x402 V2 endpoints that a test agent pays from its tab.
//   devnet:  settled by the public x402.org facilitator (free).
//   mainnet: settled by a hosted facilitator (PayAI by default, DEMO_FACILITATOR_URL to change it), which
//            pays the SOL network fee itself, so TAB keeps no fee-payer wallet to top up. Each call
//            pays real USDC to DEMO_MERCHANT (the owner's wallet), so the demo funds itself.
//            DEMO_FACILITATOR=self switches back to the in-process facilitator, whose fee payer is
//            DEMO_FEE_PAYER_KEY (a separate key, never the TAB delegate).
import { Hono, type Context } from "hono";
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { config } from "./config.js";
import { makeFacilitator, selfFacilitated, settlementRecovery } from "./x402kit.js";

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

/** Whether this deployment serves the demo API (used by /v1/config so the UI can show the test agent). */
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

  const { client: facilitatorClient, feePayer } = makeFacilitator();

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

  // Facilitator landed it but answered "settlement_pending": serve it if the chain says we were paid.
  app.use(settlementRecovery({
    conn, payTo, asset,
    priceOf: (c) => { const p = c.req.path.split("/").pop() as Path; return p in DEMO_PRICES ? BigInt(DEMO_PRICES[p]) : null; },
    serve: (c) => Response.json(CONTENT[c.req.path.split("/").pop() as Path](c)),
  }));

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
