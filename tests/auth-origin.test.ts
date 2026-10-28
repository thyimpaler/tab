import { beforeAll, describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { setTestEnv } from "./helpers.ts";

setTestEnv();
process.env.APP_ORIGIN = "https://tab-agent-one.vercel.app";
process.env.APP_ALT_ORIGINS = "https://tabpay.si";
const { db } = await import("../src/server/db.ts");
const { migrate } = await import("../src/server/migrate.ts");
const { app } = await import("../src/server/app.ts");
const { siwsMessage } = await import("../src/server/auth.ts");

beforeAll(async () => { await migrate(db(), () => {}); });

const post = (path: string, host: string, body?: unknown, origin?: string) =>
  app.fetch(new Request(`http://internal/api/v1${path}`, {
    method: "POST",
    headers: { host, "content-type": "application/json", ...(origin ? { origin } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));

async function signIn(host: string) {
  const { input } = await (await post("/auth/nonce", host)).json();
  const kp = Keypair.generate();
  const address = kp.publicKey.toBase58();
  const message = siwsMessage(address, input);
  const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey));
  return { input, res: await post("/auth/verify", host, { address, message, signature }) };
}

describe("app origins", () => {
  it("signs in on each allowed host, with that host as the SIWS domain", async () => {
    for (const host of ["tabpay.si", "tab-agent-one.vercel.app"]) {
      const { input, res } = await signIn(host);
      expect(input.domain).toBe(host);
      expect(input.uri).toBe(`https://${host}`);
      expect(res.status).toBe(200);
    }
  });

  it("falls back to APP_ORIGIN for an unknown host", async () => {
    const { input } = await (await post("/auth/nonce", "evil.example")).json();
    expect(input.domain).toBe("tab-agent-one.vercel.app");
  });

  it("issuing a nonce writes nothing to the database", async () => {
    const count = async () => Number((await db().query(`SELECT count(*) FROM auth_nonces`)).rows[0].count);
    const before = await count();
    for (let i = 0; i < 5; i++) expect((await post("/auth/nonce", "tabpay.si")).status).toBe(200);
    expect(await count()).toBe(before);
  });

  it("a nonce signs in once; a replay and a forged nonce are refused", async () => {
    const kp = Keypair.generate();
    const address = kp.publicKey.toBase58();
    const verify = (input: any) => {
      const message = siwsMessage(address, input);
      const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey));
      return post("/auth/verify", "tabpay.si", { address, message, signature });
    };
    const { input } = await (await post("/auth/nonce", "tabpay.si")).json();
    expect((await verify(input)).status).toBe(200);
    expect((await verify(input)).status).toBe(401);
    const forged = { ...input, nonce: bs58.encode(Buffer.alloc(36, 7)) };
    expect((await verify(forged)).status).toBe(401);
  });

  it("refuses cookie-route writes from an origin that isn't allowed", async () => {
    const res = await post("/tabs", "tabpay.si", {}, "https://evil.example");
    expect(res.status).toBe(401);
    expect((await res.json()).error?.code ?? "").toMatch(/UNAUTHORIZED/);
  });
});
