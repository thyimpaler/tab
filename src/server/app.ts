import { Hono, type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import { config, delegatePubkey } from "./config.js";
import { TabError } from "./errors.js";
import { issueNonce, makeSession, readSession, signInInput, verifySignIn, SESSION_COOKIE, SESSION_TTL_S } from "./auth.js";
import { authTab, pay } from "./pay.js";
import { confirmPayment, reconcile } from "./settle.js";
import {
  CreateTabBody, activateTab, closeTab, createTab, getTab, listTabs, publicTab, revokeTab, rotateCredential,
} from "./tabs.js";
import { db } from "./db.js";
import { demoApp } from "./demo.js";

type Env = { Variables: { wallet: string; tabId: string } };

export const app = new Hono<Env>().basePath("/api");

app.onError((err, c) => {
  if (err instanceof TabError) return c.json({ error: { code: err.code, message: err.message } }, err.status as any);
  if (err instanceof z.ZodError) return c.json({ error: { code: "BAD_REQUEST", message: err.issues[0]?.message ?? "invalid body" } }, 400);
  console.error("unhandled", err instanceof Error ? err.message : err);
  return c.json({ error: { code: "INTERNAL", message: "Something went wrong. Try again." } }, 500);
});

const json = async (c: Context) => {
  try { return await c.req.json(); } catch { throw new TabError("BAD_REQUEST", "body must be JSON"); }
};

app.get("/v1/health", (c) => c.json({ ok: true, network: config().network }));

app.get("/v1/config", (c) => c.json({
  network: config().network, caip2: config().caip2, mints: config().acceptedMints, delegate: delegatePubkey().toBase58(),
  // Public endpoint only: never expose a keyed RPC URL.
  rpcUrl: process.env.PUBLIC_RPC_URL ?? (config().network === "devnet" ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com"),
}));

// ---------- wallet session (dashboard) ----------
const appUrl = () => new URL(config().appOrigin);

app.post("/v1/auth/nonce", async (c) => {
  const nonce = await issueNonce();
  return c.json({ input: signInInput(appUrl().host, appUrl().origin, nonce) });
});

app.post("/v1/auth/verify", async (c) => {
  const body = await json(c);
  const wallet = await verifySignIn(body, appUrl().host);
  setCookie(c, SESSION_COOKIE, makeSession(wallet), {
    httpOnly: true, secure: appUrl().protocol === "https:", sameSite: "Lax", path: "/", maxAge: SESSION_TTL_S,
  });
  return c.json({ wallet });
});

app.post("/v1/auth/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

const session = async (c: Context<Env>, next: () => Promise<void>) => {
  // Cookie routes: block cross-site writes.
  if (c.req.method !== "GET") {
    const origin = c.req.header("origin");
    if (origin && origin !== appUrl().origin) throw new TabError("UNAUTHORIZED", "cross-site request");
  }
  const wallet = readSession(getCookie(c, SESSION_COOKIE));
  if (!wallet) throw new TabError("UNAUTHORIZED", "sign in with your wallet");
  c.set("wallet", wallet);
  await next();
};

app.get("/v1/me", session, (c) => c.json({ wallet: c.get("wallet") }));
app.get("/v1/tabs", session, async (c) => c.json({ tabs: await listTabs(c.get("wallet")) }));
app.post("/v1/tabs", session, async (c) => c.json(await createTab(c.get("wallet"), CreateTabBody.parse(await json(c))), 201));
app.get("/v1/tabs/:id", session, async (c) => c.json(await getTab(c.get("wallet"), uuid(c.req.param("id")))));
app.post("/v1/tabs/:id/activate", session, async (c) => {
  const body = await json(c).catch(() => ({}));
  return c.json(await activateTab(c.get("wallet"), uuid(c.req.param("id")), typeof body.signature === "string" ? body.signature : undefined));
});
app.post("/v1/tabs/:id/rotate", session, async (c) => c.json(await rotateCredential(c.get("wallet"), uuid(c.req.param("id")))));
app.post("/v1/tabs/:id/revoke", session, async (c) => c.json(await revokeTab(c.get("wallet"), uuid(c.req.param("id")))));
app.post("/v1/tabs/:id/close", session, async (c) => c.json(await closeTab(c.get("wallet"), uuid(c.req.param("id")))));

function uuid(s: string | undefined) {
  s ??= "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) throw new TabError("TAB_NOT_FOUND");
  return s;
}

// ---------- agent (credential) ----------
const agent = async (c: Context<Env>, next: () => Promise<void>) => {
  const h = c.req.header("authorization") ?? "";
  const cred = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  c.set("tabId", await authTab(cred));
  await next();
};

app.post("/v1/pay", async (c) => {
  const body = await json(c);
  const h = c.req.header("authorization") ?? "";
  const out = await pay({
    credential: h.startsWith("Bearer ") ? h.slice(7).trim() : "",
    idempotencyKey: c.req.header("idempotency-key") ?? body.idempotencyKey,
    paymentRequired: body.paymentRequired,
    resource: typeof body.resource === "string" ? body.resource.slice(0, 2048) : undefined,
  });
  return c.json(out);
});

app.post("/v1/payments/:id/confirm", agent, async (c) => {
  const body = await json(c).catch(() => ({}));
  const id = c.req.param("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new TabError("BAD_REQUEST", "unknown payment");
  const sig = typeof body.transaction === "string" && body.transaction.length <= 100 ? body.transaction : undefined;
  return c.json(await confirmPayment(c.get("tabId"), id, sig));
});

app.get("/v1/tab", agent, async (c) => {
  await reconcile(c.get("tabId")).catch(() => {});
  const t = (await db().query(`SELECT * FROM tabs WHERE id = $1`, [c.get("tabId")])).rows[0];
  const p = publicTab(t);
  return c.json({ id: p.id, status: p.status, mint: p.mint, decimals: p.decimals, limit: p.limit, spent: p.spent, reserved: p.reserved, remaining: p.remaining, perPaymentCap: p.perPaymentCap, expiresAt: p.expiresAt });
});

// ---------- cron ----------
app.get("/v1/internal/reconcile", async (c) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || c.req.header("authorization") !== `Bearer ${secret}`) throw new TabError("UNAUTHORIZED");
  return c.json(await reconcile());
});

// ---------- demo paid API (devnet) ----------
let demo: ReturnType<typeof demoApp> | undefined;
app.all("/demo/*", (c) => (demo ??= demoApp()).fetch(c.req.raw));
