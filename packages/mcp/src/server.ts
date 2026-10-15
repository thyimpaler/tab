// TAB MCP server: lets any MCP agent (Claude, Cursor, …) pay x402 APIs on Solana from a TAB.
// The agent holds a TAB credential only, never a wallet key. Every payment goes through TAB's rules
// (status, expiry, per-payment cap, allowlist, remaining balance) and this server's own per-call ceiling.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Tab, TabError, type PaymentEvent } from "@tabpaysi/sdk";

export type TabMcpOptions = {
  /** tab_live_… / tab_test_…  Never echoed back to the agent. */
  credential: string;
  /** TAB API base, e.g. https://tabpay.si/api. */
  apiUrl?: string;
  /** Market catalogue. Defaults to <apiUrl>/market/catalog. */
  marketUrl?: string;
  /** Per-call ceiling in base units (USDC: 1000000 = 1.00). Default 1 USDC. */
  maxPayment?: string;
  fetch?: typeof fetch;
};

const DEFAULT_API = "https://tabpay.si/api";
const MAX_TEXT = 20_000;

// What the agent should do next, per TAB refusal.
const HINTS: Record<string, string> = {
  INSUFFICIENT_TAB_BALANCE: "Not enough left on the tab. Stop paying and tell the user; they can open a new tab.",
  PAYMENT_EXCEEDS_TAB_LIMIT: "This costs more than the allowed per-payment cap. Skip it or ask the user to raise the cap.",
  RECIPIENT_NOT_ALLOWED: "This service isn't on the tab's allowlist. Don't retry; ask the user to allow it.",
  TAB_REVOKED: "The owner revoked this tab. Stop making paid calls.",
  TAB_EXPIRED: "The tab expired. Stop making paid calls and ask the user for a new one.",
  TAB_CLOSED: "The tab is closed. Stop making paid calls.",
  INVALID_CREDENTIAL: "The TAB credential is invalid or was rotated. Ask the user to update TAB_CREDENTIAL.",
  UNSUPPORTED_PAYMENT_REQUIREMENT: "This service doesn't accept a payment TAB can make (x402 V2 exact, USDC, this Solana network).",
  UNSUPPORTED_MINT: "This service wants a token the tab doesn't hold.",
};

type Receipt = { amount: string; amountUsd: string; payTo: string; transaction: string | null; explorer: string | null; remaining: string; remainingUsd: string };

/** Base units -> "0.05" style, exact (no floats), at least 2 decimals. */
export const usd = (base: string, decimals = 6) => {
  const n = BigInt(base), d = 10n ** BigInt(decimals);
  const frac = (n % d).toString().padStart(decimals, "0").replace(/0+$/, "").padEnd(2, "0");
  return `${n / d}.${frac}`;
};

const text = (o: unknown, isError = false) => ({ content: [{ type: "text" as const, text: typeof o === "string" ? o : JSON.stringify(o, null, 2) }], ...(isError ? { isError: true } : {}) });

export function createTabMcp(o: TabMcpOptions) {
  const apiUrl = (o.apiUrl ?? DEFAULT_API).replace(/\/$/, "");
  const marketUrl = o.marketUrl ?? `${apiUrl}/market/catalog`;
  const maxPayment = o.maxPayment ?? "1000000";
  const f = o.fetch ?? globalThis.fetch.bind(globalThis);
  // Validates the credential shape up front (throws before the server starts on a bad one).
  new Tab({ credential: o.credential, maxPayment, apiUrl, fetch: f });

  let cluster: string | undefined;
  async function explorer(tx: string | undefined) {
    if (!tx) return null;
    cluster ??= await f(`${apiUrl}/v1/config`, { signal: AbortSignal.timeout(5_000) })
      .then((r) => r.json()).then((j: any) => (j?.network === "mainnet" ? "" : "devnet")).catch(() => "devnet");
    return `https://explorer.solana.com/tx/${tx}${cluster ? `?cluster=${cluster}` : ""}`;
  }

  let catalog: { at: number; v: any } | undefined;
  async function getCatalog() {
    if (catalog && Date.now() - catalog.at < 60_000) return catalog.v;
    const res = await f(marketUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`market catalogue answered ${res.status}`);
    catalog = { at: Date.now(), v: await res.json() };
    return catalog.v;
  }

  /** One paid request. A new Tab per call so concurrent calls never mix up receipts. */
  async function payFetch(url: string, init?: RequestInit) {
    let paid: PaymentEvent | undefined;
    const tab = new Tab({ credential: o.credential, maxPayment, apiUrl, fetch: f, onPayment: (p) => { paid = p; } });
    try {
      const res = await tab.fetch(url, init);
      const raw = await res.text();
      let data: unknown = raw;
      try { data = JSON.parse(raw); } catch { data = raw.length > MAX_TEXT ? `${raw.slice(0, MAX_TEXT)}…[truncated]` : raw; }
      const charged = !!paid && res.ok && !!paid.transaction;
      const receipt: Receipt | null = paid ? {
        amount: paid.amount, amountUsd: usd(paid.amount), payTo: paid.recipient,
        transaction: paid.transaction ?? null, explorer: charged ? await explorer(paid.transaction) : null,
        remaining: paid.remaining, remainingUsd: usd(paid.remaining),
      } : null;
      if (!res.ok) {
        return text({
          ok: false, status: res.status, error: data,
          charged: false,
          note: paid
            ? "The service failed after TAB signed the payment, so x402 didn't settle it and you weren't charged. TAB holds the amount until the signed payment expires (about 1-2 minutes), then releases it."
            : "The service failed. No payment was made.",
          receipt,
        }, true);
      }
      return text({ ok: true, status: res.status, charged, data, receipt });
    } catch (e) {
      if (e instanceof TabError) {
        return text({ ok: false, refusedBy: "TAB", code: e.code, number: e.number ?? null, message: e.message, next: HINTS[e.code] ?? "Don't retry this call.", charged: false }, true);
      }
      const msg = e instanceof Error && e.name === "TimeoutError" ? "The request timed out." : "The request failed.";
      return text({ ok: false, message: msg, charged: false }, true);
    }
  }

  const server = new McpServer({ name: "tab", version: "0.1.1" });

  server.registerTool("tab_balance", {
    title: "TAB balance",
    description: "How much is left on your TAB spending allowance, its per-payment cap, expiry and status. Check this before a run of paid calls.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    const tab = new Tab({ credential: o.credential, maxPayment, apiUrl, fetch: f });
    try {
      const b = await tab.balance();
      return text({
        status: b.status, remainingUsd: usd(b.remaining, b.decimals), limitUsd: usd(b.limit, b.decimals), spentUsd: usd(b.spent, b.decimals),
        heldUsd: usd(b.reserved, b.decimals), perPaymentCapUsd: b.perPaymentCap ? usd(b.perPaymentCap, b.decimals) : null,
        expiresAt: b.expiresAt, thisServerMaxPerCallUsd: usd(maxPayment), raw: b,
      });
    } catch (e) {
      if (e instanceof TabError) return text({ code: e.code, number: e.number ?? null, message: e.message, next: HINTS[e.code] }, true);
      return text({ message: "Couldn't reach TAB." }, true);
    }
  });

  server.registerTool("market_list", {
    title: "List paid APIs",
    description: "Paid APIs you can call with market_call, each with its price in USDC and its inputs. Prices are per call, paid from your TAB on Solana via x402.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    try {
      const c = await getCatalog();
      return text({
        network: c.network,
        services: c.services.map((s: any) => ({ id: s.id, name: s.name, priceUsd: s.priceUsd, description: s.description, input: s.input })),
      });
    } catch {
      return text({ message: "Couldn't load the market catalogue." }, true);
    }
  });

  server.registerTool("market_call", {
    title: "Call a paid API",
    description: "Calls one market service by id and pays for it from your TAB (x402 on Solana). Returns the data and a receipt with the Solana transaction. Failed calls aren't charged.",
    inputSchema: {
      service: z.string().describe("Service id from market_list, e.g. \"price\""),
      params: z.record(z.string(), z.string()).optional().describe("Query inputs, e.g. {\"tokens\":\"SOL,JUP\"}"),
    },
    annotations: { openWorldHint: true },
  }, async ({ service, params }) => {
    let c: any;
    try { c = await getCatalog(); } catch { return text({ message: "Couldn't load the market catalogue." }, true); }
    const s = c.services.find((x: any) => x.id === service);
    if (!s) return text({ message: `No service "${service}". Use market_list.`, services: c.services.map((x: any) => x.id) }, true);
    const url = new URL(s.url);
    for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
    return payFetch(url.toString());
  });

  server.registerTool("paid_fetch", {
    title: "Fetch a paid URL",
    description: "Fetches any http(s) URL. If it answers HTTP 402 with an x402 V2 Solana payment request, pays from your TAB within its rules and returns the result with a receipt.",
    inputSchema: {
      url: z.string().url().describe("http(s) URL"),
      method: z.enum(["GET", "POST"]).optional(),
      body: z.string().optional().describe("Request body for POST (sent as-is)"),
      contentType: z.string().optional().describe("Content-Type for the body, default application/json"),
    },
    annotations: { openWorldHint: true },
  }, async ({ url, method, body, contentType }) => {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return text({ message: "Only http and https URLs." }, true);
    return payFetch(u.toString(), {
      method: method ?? "GET",
      ...(body !== undefined ? { body, headers: { "content-type": contentType ?? "application/json" } } : {}),
    });
  });

  return server;
}
