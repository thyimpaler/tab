// TAB SDK. The agent holds a credential, never a key.
//
//   const tab = new Tab({ credential: process.env.TAB_CREDENTIAL!, maxPayment: "50000" }); // 0.05 USDC
//   const res = await tab.fetch("https://api.example.com/paid");
//
// On HTTP 402 (x402 V2) it asks the TAB API to sign a payment within the tab's rules, retries the
// request with PAYMENT-SIGNATURE, then reports the merchant's PAYMENT-RESPONSE so the tab settles.

export type TabOptions = {
  /** `tab_live_…` / `tab_test_…`, shown once when the tab was activated. */
  credential: string;
  /** Hard client-side ceiling per request, in token base units (USDC: 1 = 0.000001). */
  maxPayment: bigint | number | string;
  /** Defaults to the hosted TAB API. */
  apiUrl?: string;
  /** Custom fetch (tests, proxies). */
  fetch?: typeof fetch;
  /** Per-request timeout in ms. Default 30s. */
  timeoutMs?: number;
  /** Called after every paid request. */
  onPayment?: (p: PaymentEvent) => void;
};

export type PaymentEvent = {
  paymentId: string;
  url: string;
  amount: string;
  recipient: string;
  remaining: string;
  status: number;
  transaction?: string;
};

export class TabError extends Error {
  constructor(public code: string, message: string, public status?: number) {
    super(message);
    this.name = "TabError";
  }
}

const DEFAULT_API = "https://tab-agent-one.vercel.app/api";
const SOLANA = /^solana:/;

function b64json(s: string): any {
  const bin = typeof atob === "function" ? atob(s) : Buffer.from(s, "base64").toString("binary");
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function uuid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

export class Tab {
  private credential: string;
  private max: bigint;
  private api: string;
  private f: typeof fetch;
  private timeoutMs: number;
  private onPayment?: (p: PaymentEvent) => void;

  constructor(o: TabOptions) {
    if (!o?.credential || !/^tab_(live|test)_/.test(o.credential)) throw new TabError("INVALID_CREDENTIAL", "credential must start with tab_live_ or tab_test_");
    this.credential = o.credential;
    this.max = BigInt(o.maxPayment);
    if (this.max <= 0n) throw new TabError("BAD_REQUEST", "maxPayment must be positive");
    this.api = (o.apiUrl ?? DEFAULT_API).replace(/\/$/, "");
    this.f = o.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = o.timeoutMs ?? 30_000;
    this.onPayment = o.onPayment;
  }

  private signal(init?: RequestInit) {
    const t = AbortSignal.timeout(this.timeoutMs);
    return init?.signal ? AbortSignal.any([init.signal, t]) : t;
  }

  private async call(path: string, body?: unknown, idem?: string) {
    const res = await this.f(`${this.api}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: `Bearer ${this.credential}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(idem ? { "idempotency-key": idem } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new TabError(data?.error?.code ?? "TAB_API_ERROR", data?.error?.message ?? `TAB API ${res.status}`, res.status);
    return data;
  }

  /** Remaining allowance and status. */
  balance(): Promise<{ status: string; limit: string; spent: string; reserved: string; remaining: string; perPaymentCap: string | null; expiresAt: string; mint: string; decimals: number }> {
    return this.call("/v1/tab");
  }

  /** Drop-in fetch that pays x402 V2 402s from the tab. Request bodies must be re-sendable (string, bytes, FormData). */
  async fetch(input: string | URL, init?: RequestInit): Promise<Response> {
    const url = input.toString();
    const first = await this.f(url, { ...init, signal: this.signal(init) });
    if (first.status !== 402) return first;

    const header = first.headers.get("PAYMENT-REQUIRED");
    if (!header) return first; // not x402 V2
    let required: any;
    try { required = b64json(header); } catch { throw new TabError("UNSUPPORTED_PAYMENT_REQUIREMENT", "unreadable PAYMENT-REQUIRED header"); }
    const options = (required?.accepts ?? []).filter((a: any) => a?.scheme === "exact" && SOLANA.test(a?.network ?? ""));
    if (!options.length) throw new TabError("UNSUPPORTED_PAYMENT_REQUIREMENT", "service does not accept Solana exact payments");
    const cheapest = options.reduce((m: bigint, a: any) => { try { const v = BigInt(a.amount); return v < m ? v : m; } catch { return m; } }, BigInt(2) ** 64n);
    if (cheapest > this.max) throw new TabError("PAYMENT_EXCEEDS_TAB_LIMIT", `service asks ${cheapest} base units, above maxPayment ${this.max}`);

    const idem = uuid();
    const signed = await this.call("/v1/pay", { paymentRequired: required, resource: url, idempotencyKey: idem }, idem);
    if (BigInt(signed.amount) > this.max) throw new TabError("PAYMENT_EXCEEDS_TAB_LIMIT", "signed amount above maxPayment");

    const headers = new Headers(init?.headers);
    headers.set("PAYMENT-SIGNATURE", signed.paymentSignature);
    let res = await this.f(url, { ...init, headers, signal: this.signal(init) });
    let receipt = readReceipt(res);
    // Facilitator landed it but couldn't confirm in time: retry once with the SAME signed tx (can't land twice).
    if (res.status === 402 && receipt?.errorReason === "settlement_pending") {
      await new Promise((r) => setTimeout(r, 2000));
      res = await this.f(url, { ...init, headers, signal: this.signal(init) });
      receipt = readReceipt(res) ?? receipt;
    }

    const transaction: string | undefined = receipt?.transaction || undefined;
    // Report back so the tab settles now instead of at blockhash expiry. Never blocks the caller on failure.
    await this.call(`/v1/payments/${signed.paymentId}/confirm`, { transaction }).catch(() => {});
    this.onPayment?.({
      paymentId: signed.paymentId, url, amount: signed.amount, recipient: signed.recipient,
      remaining: signed.remaining, status: res.status, transaction,
    });
    return res;
  }
}

function readReceipt(res: Response): any {
  const h = res.headers.get("PAYMENT-RESPONSE");
  if (h) { try { return b64json(h); } catch { return undefined; } }
  return undefined;
}

export default Tab;
