// Paid-API market: input checks before the 402, real x402 V2 flow against a fake facilitator,
// and the rule that a failed service never settles (so the payer is never charged).
import { beforeEach, describe, expect, it } from "vitest";
import { FACILITATOR, MERCHANT, MINT, setTestEnv } from "./helpers.ts";

setTestEnv();
process.env.MARKET_PAY_TO = MERCHANT;
const { resetConfig, CAIP2 } = await import("../src/server/config.ts");
resetConfig();
const { marketApp, marketEnabled } = await import("../src/server/market.ts");
const { isPrivateIp } = await import("../src/server/market-services.ts");
type Deps = import("../src/server/market-services.ts").Deps;

const NET = CAIP2.devnet;
const WALLET = "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg";
const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

// ---------- fakes ----------
const fac = {
  verified: 0,
  settled: 0,
  async verify() { fac.verified++; return { isValid: true, payer: "PAYER" }; },
  async settle() { fac.settled++; return { success: true, transaction: "TXSIG", network: NET, payer: "PAYER" }; },
  async getSupported() { return { kinds: [{ x402Version: 2, scheme: "exact", network: NET, extra: { feePayer: FACILITATOR } }], extensions: [], signers: {} }; },
};

let upstreamDown = false;
let dns: Record<string, string[]> = {};
let pages: Record<string, Response> = {};
let rpcCalls: string[] = [];
let largestFails = false;

const deps: Deps = {
  fetch: (async (input: any) => {
    const url = input.toString();
    if (upstreamDown) throw new Error("down");
    if (url.startsWith("https://lite-api.jup.ag/")) {
      return Response.json({ So11111111111111111111111111111111111111112: { usdPrice: 150.5, priceChange24h: -1.5, liquidity: 9e8 } });
    }
    const p = pages[url];
    if (!p) throw new Error(`unexpected fetch ${url}`);
    return p.clone();
  }) as typeof fetch,
  rpc: async (method, params) => {
    rpcCalls.push(method);
    if (upstreamDown) throw new Error("down");
    switch (method) {
      case "getBalance": return { value: 2_500_000_000 };
      case "getTokenAccountsByOwner":
        return (params[1] as any).programId.startsWith("Tokenkeg")
          ? { value: [{ account: { data: { parsed: { info: { mint: BONK, tokenAmount: { amount: "100000", uiAmountString: "1", decimals: 5 } } } } } }] }
          : { value: [] };
      case "getSignaturesForAddress": return [{ signature: "SIG1", slot: 1, blockTime: 1_760_000_000, err: null }];
      case "getAccountInfo":
        return { value: { owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", data: { parsed: { type: "mint", info: { decimals: 5, supply: "1000", mintAuthority: "AUTH", freezeAuthority: null } } } } };
      case "getTokenLargestAccounts":
        if (largestFails) throw new Error("429");
        return { value: [{ amount: "600" }, { amount: "100" }] };
    }
    throw new Error(`unexpected rpc ${method}`);
  },
  lookup: async (host) => dns[host] ?? ["93.184.215.14"],
};

const app = marketApp({ facilitator: fac as any, deps, conn: {} as any });
const call = (path: string, headers: Record<string, string> = {}) => app.request(`http://localhost/api/market/${path}`, { headers });

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");
const unb64 = (s: string) => JSON.parse(Buffer.from(s, "base64").toString("utf8"));

/** Ask, take the 402, and come back with a payment the fake facilitator accepts. */
async function paid(path: string) {
  const first = await call(path);
  expect(first.status).toBe(402);
  const required = unb64(first.headers.get("PAYMENT-REQUIRED")!);
  const payment = { x402Version: 2, resource: required.resource, accepted: required.accepts[0], payload: { transaction: "AQ==" } };
  return call(path, { "PAYMENT-SIGNATURE": b64(payment) });
}

beforeEach(() => {
  fac.verified = 0; fac.settled = 0;
  upstreamDown = false; largestFails = false; dns = {}; pages = {}; rpcCalls = [];
});

describe("catalog", () => {
  it("is free and lists every service with its price", async () => {
    const res = await call("catalog");
    expect(res.status).toBe(200);
    const j: any = await res.json();
    expect(j.network).toBe(NET);
    expect(j.asset).toBe(MINT);
    expect(j.payTo).toBe(MERCHANT);
    expect(j.services.map((s: any) => s.id)).toEqual(["price", "wallet-report", "token-check", "read", "flaky"]);
    expect(j.services.find((s: any) => s.id === "price")).toMatchObject({ price: "10000", priceUsd: "0.01", url: "http://localhost/api/market/price" });
  });
});

describe("input is checked before any 402", () => {
  it("unknown service: 404, no payment asked", async () => {
    const res = await call("nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("PAYMENT-REQUIRED")).toBeNull();
  });

  it.each([
    ["price", "price"],
    ["price?tokens=not-a-token!", "price"],
    ["wallet-report?address=xyz", "wallet-report"],
    ["token-check", "token-check"],
    ["read?url=ftp://example.com/x", "read"],
    ["read?url=http://127.0.0.1:8787/api/v1/health", "read"],
    ["read?url=http://localhost/", "read"],
    ["read?url=http://[::1]/", "read"],
  ])("%s: 400 with no PAYMENT-REQUIRED", async (path) => {
    const res = await call(path);
    expect(res.status).toBe(400);
    expect(res.headers.get("PAYMENT-REQUIRED")).toBeNull();
    expect(fac.verified).toBe(0);
  });

  it("a host that resolves to a private address is refused before payment", async () => {
    dns["intranet.example.com"] = ["10.0.0.5"];
    const res = await call("read?url=https://intranet.example.com/admin");
    expect(res.status).toBe(400);
    expect(res.headers.get("PAYMENT-REQUIRED")).toBeNull();
  });
});

describe("x402 flow", () => {
  it("answers 402 with an exact Solana requirement and bazaar discovery info", async () => {
    const res = await call("price?tokens=SOL");
    expect(res.status).toBe(402);
    const r = unb64(res.headers.get("PAYMENT-REQUIRED")!);
    expect(r.x402Version).toBe(2);
    expect(r.accepts[0]).toMatchObject({ scheme: "exact", network: NET, amount: "10000", asset: MINT, payTo: MERCHANT });
    expect(r.accepts[0].extra.feePayer).toBe(FACILITATOR);
    expect(r.extensions?.bazaar).toBeDefined();
    expect(fac.settled).toBe(0);
  });

  it("paid price call: 200 with real-shaped data, settled exactly once", async () => {
    const res = await paid("price?tokens=SOL");
    expect(res.status).toBe(200);
    const j: any = await res.json();
    expect(j.prices[0]).toMatchObject({ token: "SOL", usd: 150.5 });
    expect(fac.settled).toBe(1);
    expect(unb64(res.headers.get("PAYMENT-RESPONSE")!)).toMatchObject({ success: true, transaction: "TXSIG" });
  });

  it("wallet report", async () => {
    const res = await paid(`wallet-report?address=${WALLET}`);
    expect(res.status).toBe(200);
    const j: any = await res.json();
    expect(j).toMatchObject({ address: WALLET, sol: "2.5", tokenAccounts: 1 });
    expect(j.tokens[0]).toMatchObject({ mint: BONK, amount: "1" });
    expect(j.recentActivity[0]).toMatchObject({ signature: "SIG1", ok: true });
    expect(fac.settled).toBe(1);
  });

  it("token check flags authorities and concentration", async () => {
    const res = await paid(`token-check?mint=${BONK}`);
    const j: any = await res.json();
    expect(j.holders).toEqual({ top1Pct: 60, top10Pct: 70 });
    expect(j.flags.join(" ")).toMatch(/Mint authority is set/);
    expect(j.flags.join(" ")).toMatch(/Top 10 accounts hold 70%/);
  });

  it("token check still answers when holder data is rate-limited", async () => {
    largestFails = true;
    const res = await paid(`token-check?mint=${BONK}`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).holders).toBeNull();
  });

  it("read returns clean text and drops scripts", async () => {
    pages["https://example.com/post"] = new Response(
      "<html><head><title>Hello &amp; welcome</title><script>steal()</script></head><body><nav>menu</nav><p>First line.</p><p>Second&nbsp;line.</p></body></html>",
      { headers: { "content-type": "text/html; charset=utf-8" } },
    );
    const res = await paid("read?url=https://example.com/post");
    const j: any = await res.json();
    expect(res.status).toBe(200);
    expect(j.title).toBe("Hello & welcome");
    expect(j.text).toBe("First line.\nSecond line.");
    expect(j.text).not.toMatch(/steal|menu/);
  });
});

describe("a failed call is never charged", () => {
  it("flaky: 503 and the facilitator never settles", async () => {
    const res = await paid("flaky");
    expect(res.status).toBe(503);
    expect(fac.verified).toBe(1);
    expect(fac.settled).toBe(0);
    expect(((await res.json()) as any).error.code).toBe("SERVICE_DOWN");
  });

  it("upstream down: 502 and no settle", async () => {
    upstreamDown = true;
    const res = await paid("price?tokens=SOL");
    expect(res.status).toBe(502);
    expect(fac.settled).toBe(0);
  });

  it("a redirect to a private address is refused and not charged", async () => {
    pages["https://example.com/go"] = new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } });
    const res = await paid("read?url=https://example.com/go");
    expect(res.status).toBe(400);
    expect(fac.settled).toBe(0);
  });
});

describe("isPrivateIp", () => {
  it.each([
    ["10.1.2.3", true], ["127.0.0.1", true], ["169.254.169.254", true], ["172.16.0.1", true], ["172.31.255.255", true],
    ["192.168.1.1", true], ["100.64.0.1", true], ["0.0.0.0", true], ["::1", true], ["fd00::1", true], ["fe80::1", true],
    ["::ffff:10.0.0.1", true], ["not-an-ip", true],
    ["8.8.8.8", false], ["172.32.0.1", false], ["93.184.215.14", false], ["2606:4700::1111", false],
  ])("%s -> %s", (ip, priv) => expect(isPrivateIp(ip)).toBe(priv));
});

describe("mainnet gate", () => {
  it("market is off on mainnet without the owner's MARKET_ON_MAINNET=1", () => {
    process.env.SOLANA_NETWORK = "mainnet";
    resetConfig();
    try {
      expect(marketEnabled()).toBe(false);
      process.env.MARKET_ON_MAINNET = "1";
      expect(marketEnabled()).toBe(true);
    } finally {
      delete process.env.MARKET_ON_MAINNET;
      process.env.SOLANA_NETWORK = "devnet";
      resetConfig();
    }
  });
});
