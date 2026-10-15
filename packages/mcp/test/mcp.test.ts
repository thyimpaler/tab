// End to end in one process: MCP client -> TAB MCP server -> @tabpaysi/sdk -> the real TAB API (/v1/pay signs
// with the delegate against a real Postgres) -> the real market (x402 middleware). Only the facilitator and
// the chain are fakes: "settling" lands the delegate-signed tx in FakeChain, so TAB confirms it like on chain.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { VersionedTransaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";
import { DELEGATE, FACILITATOR, FakeChain, MERCHANT, MINT, setTestEnv } from "../../../tests/helpers.ts";

setTestEnv();
process.env.MARKET_PAY_TO = MERCHANT;
const { resetConfig, CAIP2 } = await import("../../../src/server/config.ts");
resetConfig();
const { db, closeDb } = await import("../../../src/server/db.ts");
const { migrate } = await import("../../../src/server/migrate.ts");
const { setChain } = await import("../../../src/server/chain.ts");
const { hashCredential, newCredential } = await import("../../../src/server/credential.ts");
const { reconcile } = await import("../../../src/server/settle.ts");
const { app } = await import("../../../src/server/app.ts");
const { marketApp } = await import("../../../src/server/market.ts");
const { createTabMcp, usd } = await import("../src/server.ts");

const NET = CAIP2.devnet;
const chain = new FakeChain();
setChain(chain);

// Facilitator: verify accepts; settle "lands" the delegate-signed tx on the fake chain.
const fac = {
  settled: 0,
  async verify() { return { isValid: true, payer: "PAYER" }; },
  async settle(p: any) {
    fac.settled++;
    const tx = VersionedTransaction.deserialize(Buffer.from(p.payload.transaction, "base64"));
    const sig = tx.signatures.find((s) => s.some((b) => b !== 0))!;
    const id = chain.land(bs58.encode(sig));
    return { success: true, transaction: id, network: NET, payer: "PAYER" };
  },
  async getSupported() { return { kinds: [{ x402Version: 2, scheme: "exact", network: NET, extra: { feePayer: FACILITATOR } }], extensions: [], signers: {} }; },
};
const deps = {
  fetch: (async () => Response.json({ So11111111111111111111111111111111111111112: { usdPrice: 150.5, priceChange24h: 1, liquidity: 1 } })) as any,
  rpc: async () => { throw new Error("not used"); },
  lookup: async () => ["93.184.215.14"],
};
const market = marketApp({ facilitator: fac as any, deps, conn: {} as any });

// Every HTTP call the MCP server makes lands in-process.
const router = (async (input: any, init?: RequestInit) => {
  const req = new Request(input.toString(), init);
  return new URL(req.url).pathname.startsWith("/api/market/") ? market.fetch(req) : app.fetch(req);
}) as typeof fetch;

let n = 0;
async function makeTab(o: { limit?: bigint; cap?: bigint | null } = {}) {
  const u = await db().query(`INSERT INTO users (wallet_address) VALUES ($1) RETURNING id`, [`mcp-wallet-${Date.now()}-${n++}`]);
  const t = await db().query(
    `INSERT INTO tabs (owner_id, mint, token_account, delegate_pubkey, limit_amount, per_payment_cap, expires_at, status,
                       credential_hash, network, token_program, decimals)
     VALUES ($1,$2,'9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin',$3,$4,$5,$6,'active','placeholder-'||gen_random_uuid(),'devnet',$7,6) RETURNING id`,
    [u.rows[0].id, MINT, DELEGATE.publicKey.toBase58(), (o.limit ?? 1_000_000n).toString(), o.cap ? o.cap.toString() : null,
      new Date(Date.now() + 3_600_000), TOKEN_PROGRAM_ID.toBase58()],
  );
  const id = t.rows[0].id as string;
  const credential = newCredential(id);
  await db().query(`UPDATE tabs SET credential_hash = $2 WHERE id = $1`, [id, hashCredential(credential)]);
  return { id, credential };
}
const tabRow = async (id: string) => (await db().query(`SELECT * FROM tabs WHERE id = $1`, [id])).rows[0];

async function connect(credential: string, maxPayment?: string) {
  const server = createTabMcp({ credential, apiUrl: "http://tab.test/api", fetch: router, maxPayment });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-agent", version: "1.0.0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r: any = await client.callTool({ name, arguments: args });
    return { isError: !!r.isError, body: JSON.parse(r.content[0].text) };
  };
  return { client, call };
}

beforeAll(async () => { await migrate(db(), () => {}); });
afterAll(async () => { await closeDb(); });
beforeEach(() => { chain.height = 100n; chain.lastValid = 250n; chain.landed.clear(); chain.rpcDown = false; fac.settled = 0; });

describe("TAB MCP server", () => {
  it("lists its four tools", async () => {
    const { credential } = await makeTab();
    const { client } = await connect(credential);
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["market_call", "market_list", "paid_fetch", "tab_balance"]);
  });

  it("market_list returns the catalogue with USD prices", async () => {
    const { credential } = await makeTab();
    const { call } = await connect(credential);
    const r = await call("market_list");
    expect(r.isError).toBe(false);
    expect(r.body.services.find((s: any) => s.id === "price")).toMatchObject({ priceUsd: "0.01" });
  });

  it("market_call pays from the tab, returns data and a settled receipt", async () => {
    const { id, credential } = await makeTab({ limit: 1_000_000n });
    const { call } = await connect(credential);
    const r = await call("market_call", { service: "price", params: { tokens: "SOL" } });
    expect(r.isError).toBe(false);
    expect(r.body).toMatchObject({ ok: true, charged: true });
    expect(r.body.data.prices[0]).toMatchObject({ token: "SOL", usd: 150.5 });
    expect(r.body.receipt).toMatchObject({ amount: "10000", amountUsd: "0.01", payTo: MERCHANT });
    expect(r.body.receipt.explorer).toMatch(/^https:\/\/explorer\.solana\.com\/tx\/.+\?cluster=devnet$/);
    expect(fac.settled).toBe(1);
    const t = await tabRow(id);
    expect(t.spent_amount).toBe(10_000n);
    expect(t.reserved_amount).toBe(0n);
    const bal = await call("tab_balance");
    expect(bal.body).toMatchObject({ status: "active", remainingUsd: "0.99", spentUsd: "0.01" });
  });

  it("a failing service isn't charged: held, then released once the signed payment expires", async () => {
    const { id, credential } = await makeTab({ limit: 1_000_000n });
    const { call } = await connect(credential);
    const r = await call("market_call", { service: "flaky" });
    expect(r.isError).toBe(true);
    expect(r.body).toMatchObject({ ok: false, status: 503, charged: false });
    expect(r.body.note).toMatch(/weren't charged/);
    expect(fac.settled).toBe(0);
    let t = await tabRow(id);
    expect(t.spent_amount).toBe(0n);
    expect(t.reserved_amount).toBe(10_000n); // held: the merchant still has a signed tx until expiry
    chain.height = 300n; // past lastValidBlockHeight + margin
    await reconcile(id);
    t = await tabRow(id);
    expect(t.reserved_amount).toBe(0n);
    expect(t.spent_amount).toBe(0n);
  });

  it("over the tab's per-payment cap: TAB refuses, nothing signed, agent told why", async () => {
    const { id, credential } = await makeTab({ cap: 20_000n });
    const { call } = await connect(credential);
    const r = await call("market_call", { service: "wallet-report", params: { address: "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg" } });
    expect(r.isError).toBe(true);
    expect(r.body).toMatchObject({ refusedBy: "TAB", code: "PAYMENT_EXCEEDS_TAB_LIMIT", charged: false });
    expect(r.body.next).toMatch(/cap/);
    const signed = await db().query(`SELECT count(*) FROM payments WHERE tab_id = $1`, [id]);
    expect(Number(signed.rows[0].count)).toBe(0);
  });

  it("above this server's own per-call ceiling: refused before TAB is even asked", async () => {
    const { id, credential } = await makeTab();
    const { call } = await connect(credential, "20000");
    const r = await call("market_call", { service: "wallet-report", params: { address: "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg" } });
    expect(r.body.code).toBe("PAYMENT_EXCEEDS_TAB_LIMIT");
    const signed = await db().query(`SELECT count(*) FROM payments WHERE tab_id = $1`, [id]);
    expect(Number(signed.rows[0].count)).toBe(0);
  });

  it("revoked tab: the agent is told to stop", async () => {
    const { id, credential } = await makeTab();
    await db().query(`UPDATE tabs SET status = 'revoked' WHERE id = $1`, [id]);
    const { call } = await connect(credential);
    const r = await call("market_call", { service: "price", params: { tokens: "SOL" } });
    expect(r.body).toMatchObject({ refusedBy: "TAB", code: "TAB_REVOKED" });
    expect(r.body.next).toMatch(/Stop/);
  });

  it("never echoes the credential in any tool result", async () => {
    const { credential } = await makeTab();
    const { client } = await connect(credential);
    for (const [name, args] of [["tab_balance", {}], ["market_list", {}], ["market_call", { service: "price", params: { tokens: "SOL" } }], ["market_call", { service: "flaky" }]] as const) {
      const r: any = await client.callTool({ name, arguments: args as any });
      expect(JSON.stringify(r)).not.toContain(credential.split("_").pop()!);
    }
  });

  it("unknown service lists the real ones", async () => {
    const { credential } = await makeTab();
    const { call } = await connect(credential);
    const r = await call("market_call", { service: "nope" });
    expect(r.isError).toBe(true);
    expect(r.body.services).toContain("price");
  });
});

describe("usd", () => {
  it.each([["10000", "0.01"], ["0", "0.00"], ["1000000", "1.00"], ["1234567", "1.234567"], ["50000", "0.05"]])("%s -> %s", (b, s) => expect(usd(b)).toBe(s));
});
