// Paid-API market: real pay-per-request services an agent buys over x402, from its tab or any x402 wallet.
//   GET /api/market/catalog       free: every service, its price and how to call it
//   GET /api/market/<service>     x402 V2 "exact" on Solana; answers 402 until paid
//
// Request order: input check (a bad request gets a 400 and never a 402, so no payment is ever signed for it)
// -> x402 payment middleware -> the service. If the service fails (4xx/5xx), x402 cancels settlement:
// the signed payment is never submitted and the payer isn't charged. TAB then releases the reservation
// once that signed payment can no longer land (blockhash expiry), see settle.ts.
//
// Off on mainnet unless MARKET_ON_MAINNET=1 (owner's go): on mainnet every call is real money.
import { Hono } from "hono";
import { Connection } from "@solana/web3.js";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { config } from "./config.js";
import { SERVICES, SERVICE_BY_ID, ServiceError, checkInput, defaultDeps, type Deps, type ServiceId } from "./market-services.js";
import { makeFacilitator, selfFacilitated, settlementRecovery, type FacilitatorClient } from "./x402kit.js";

const payToAddress = () => process.env.MARKET_PAY_TO ?? process.env.DEMO_MERCHANT ?? "";

export function marketEnabled(): boolean {
  if (!payToAddress()) return false;
  if (config().network === "mainnet" && process.env.MARKET_ON_MAINNET !== "1") return false;
  return !selfFacilitated() || !!process.env.DEMO_FEE_PAYER_KEY;
}

type Env = { Variables: { served: unknown } };

export function marketApp(o: { facilitator?: FacilitatorClient; deps?: Deps; conn?: Connection } = {}) {
  const app = new Hono<Env>().basePath("/api/market");
  const err = (code: string, message: string) => ({ error: { code, message } });
  if (!marketEnabled()) {
    app.all("*", (c) => c.json(err("NOT_FOUND", "The market isn't enabled on this deployment."), 404));
    return app;
  }
  const cfg = config();
  const payTo = payToAddress();
  const asset = cfg.acceptedMints[0];
  const deps = o.deps ?? defaultDeps();
  const conn = o.conn ?? new Connection(cfg.rpcUrl, "confirmed");
  const facilitator = o.facilitator ?? makeFacilitator().client;

  app.get("/catalog", (c) => {
    const origin = new URL(c.req.url).origin;
    return c.json({
      network: cfg.caip2,
      asset,
      payTo,
      decimals: 6,
      dataNetwork: "solana-mainnet",
      note: "Prices are in the asset's base units (USDC: 1 = 0.000001). Pay with any x402 V2 client, or a TAB credential.",
      services: SERVICES.map((s) => ({
        id: s.id, name: s.name, description: s.description, method: "GET", url: `${origin}/api/market/${s.id}`,
        price: s.price, priceUsd: (Number(s.price) / 1e6).toFixed(2),
        input: { type: "object", properties: s.query, required: s.required },
        outputExample: s.outputExample,
      })),
    });
  });

  // 1. Validate before asking for money.
  app.use("/:id", async (c, next) => {
    const id = c.req.param("id") as ServiceId;
    if (!SERVICE_BY_ID.has(id)) return c.json(err("NOT_FOUND", "No such service. See /api/market/catalog."), 404);
    try { await checkInput(deps, id, c.req.query()); } catch (e) {
      if (e instanceof ServiceError) return c.json(err(e.code, e.message), e.status);
      throw e;
    }
    await next();
  });

  // 2. Facilitator landed it but answered "settlement_pending": serve it if the chain says we were paid.
  app.use(settlementRecovery({
    conn, payTo, asset,
    priceOf: (c) => { const s = SERVICE_BY_ID.get(c.req.path.split("/").pop() as ServiceId); return s ? BigInt(s.price) : null; },
    serve: (c) => Response.json(c.get("served") ?? {}),
  }));

  // 3. x402.
  const server = new x402ResourceServer(facilitator)
    .register(cfg.caip2 as `${string}:${string}`, new ExactSvmScheme())
    .registerExtension(bazaarResourceServerExtension);
  const routes: Record<string, unknown> = {};
  for (const s of SERVICES) {
    routes[`GET /api/market/${s.id}`] = {
      accepts: [{ scheme: "exact", network: cfg.caip2, payTo, price: { asset, amount: s.price } }],
      description: s.description,
      mimeType: "application/json",
      serviceName: "TAB market",
      extensions: declareDiscoveryExtension({
        input: Object.fromEntries(Object.entries(s.query).map(([k, v]) => [k, v.example])),
        inputSchema: { properties: s.query, required: s.required },
        output: { example: s.outputExample },
      }),
    };
  }
  app.use(paymentMiddleware(routes as any, server));

  // 4. The services.
  for (const s of SERVICES) {
    app.get(`/${s.id}`, async (c) => {
      try {
        const out = await s.run(deps, c.req.query());
        c.set("served", out);
        return c.json(out as any);
      } catch (e) {
        if (e instanceof ServiceError) return c.json(err(e.code, e.message), e.status);
        console.error("market", s.id, e instanceof Error ? e.message : e);
        return c.json(err("SERVICE_FAILED", "The service failed. You weren't charged."), 502);
      }
    });
  }
  return app;
}
