import { describe, expect, it, vi } from "vitest";
import { Tab } from "../src/index.ts";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");
const CRED = "tab_test_0123456789abcdef0123456789abcdef_" + "1".repeat(44);
const PR = {
  x402Version: 2, resource: { url: "https://m.example/x" },
  accepts: [{ scheme: "exact", network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", asset: "M", amount: "10000", payTo: "P", maxTimeoutSeconds: 60, extra: { feePayer: "F" } }],
};

function mockFetch(opts: { price?: string; merchantStatus?: number } = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const pr = { ...PR, accepts: [{ ...PR.accepts[0], amount: opts.price ?? "10000" }] };
  const f = vi.fn(async (input: any, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.startsWith("https://api.tab/v1/pay")) {
      return new Response(JSON.stringify({ paymentId: "pid", amount: pr.accepts[0].amount, recipient: "P", mint: "M", paymentSignature: "SIGNED", remaining: "40000", replayed: false }));
    }
    if (url.includes("/confirm")) return new Response(JSON.stringify({ state: "SETTLED" }));
    const h = new Headers(init?.headers);
    if (h.get("PAYMENT-SIGNATURE") === "SIGNED") {
      return new Response("paid content", { status: opts.merchantStatus ?? 200, headers: { "PAYMENT-RESPONSE": b64({ success: true, transaction: "TXID" }) } });
    }
    return new Response("pay up", { status: 402, headers: { "PAYMENT-REQUIRED": b64(pr) } });
  });
  return { f, calls };
}

describe("Tab.fetch", () => {
  it("pays a 402 and retries with PAYMENT-SIGNATURE, then confirms with the tx id", async () => {
    const { f, calls } = mockFetch();
    const events: any[] = [];
    const tab = new Tab({ credential: CRED, maxPayment: 50_000, apiUrl: "https://api.tab", fetch: f as any, onPayment: (e) => events.push(e) });
    const res = await tab.fetch("https://m.example/x");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("paid content");
    const pay = calls.find((c) => c.url === "https://api.tab/v1/pay")!;
    expect(new Headers(pay.init!.headers).get("authorization")).toBe(`Bearer ${CRED}`);
    expect(new Headers(pay.init!.headers).get("idempotency-key")).toBeTruthy();
    const confirm = calls.find((c) => c.url.includes("/confirm"))!;
    expect(JSON.parse(String(confirm.init!.body))).toEqual({ transaction: "TXID" });
    expect(events[0]).toMatchObject({ paymentId: "pid", amount: "10000", status: 200, transaction: "TXID" });
  });

  it("refuses before asking the API when the price is above maxPayment", async () => {
    const { f, calls } = mockFetch({ price: "999999" });
    const tab = new Tab({ credential: CRED, maxPayment: 50_000, apiUrl: "https://api.tab", fetch: f as any });
    await expect(tab.fetch("https://m.example/x")).rejects.toMatchObject({ code: "PAYMENT_EXCEEDS_TAB_LIMIT" });
    expect(calls.some((c) => c.url.includes("/v1/pay"))).toBe(false);
  });

  it("passes through non-402 responses untouched", async () => {
    const f = vi.fn(async () => new Response("free", { status: 200 }));
    const tab = new Tab({ credential: CRED, maxPayment: 1, apiUrl: "https://api.tab", fetch: f as any });
    expect(await (await tab.fetch("https://m.example/free")).text()).toBe("free");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("surfaces API rejections with their code", async () => {
    const f = vi.fn(async (input: any) => String(input).includes("/v1/pay")
      ? new Response(JSON.stringify({ error: { code: "TAB_REVOKED", message: "revoked" } }), { status: 403 })
      : new Response("", { status: 402, headers: { "PAYMENT-REQUIRED": b64(PR) } }));
    const tab = new Tab({ credential: CRED, maxPayment: 50_000, apiUrl: "https://api.tab", fetch: f as any });
    await expect(tab.fetch("https://m.example/x")).rejects.toMatchObject({ code: "TAB_REVOKED", status: 403 });
  });

  it("rejects malformed credentials up front", () => {
    expect(() => new Tab({ credential: "sk-123", maxPayment: 1 })).toThrow(/tab_live_/);
  });
});
