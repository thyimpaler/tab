// Minimal x402 V2 resource server. Two paid routes, one per test mint, 0.01 token each.
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { FACILITATOR, NETWORK, loadState } from "./common.ts";

const s = loadState();
const PORT = Number(process.env.SPIKE_PORT ?? 4021);
const AMOUNT = "10000"; // 0.01 with 6 decimals

const server = new x402ResourceServer(new HTTPFacilitatorClient({ url: FACILITATOR }))
  .register(NETWORK, new ExactSvmScheme());

const route = (mint: string) => ({
  accepts: [{ scheme: "exact", network: NETWORK, payTo: s.merchant, price: { asset: mint, amount: AMOUNT } }],
  description: "TAB spike paid resource",
});

const app = new Hono();
app.use(paymentMiddleware({
  "GET /paid/token": route(s.mints.token.mint),
  "GET /paid/token2022": route(s.mints.token2022.mint),
} as any, server));
app.get("/paid/:kind", (c) => c.json({ ok: true, kind: c.req.param("kind") }));

serve({ fetch: app.fetch, port: PORT }, () => console.log(`spike server on :${PORT}`));
