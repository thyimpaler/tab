// Paid-API market: the services themselves, with no payment code. Each one returns real data from a free
// source (Jupiter price API, public Solana RPC, the open web). Payments are on the deployment's network;
// the data is always Solana mainnet's, because that's the data an agent actually wants.
//
// A service throws ServiceError on bad input or upstream failure. The x402 layer turns that into a 4xx/5xx,
// and x402 never settles a payment for a 4xx/5xx response, so the caller isn't charged.
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export class ServiceError extends Error {
  constructor(public status: 400 | 404 | 502 | 503, public code: string, message: string) {
    super(message);
  }
}

export type Deps = {
  fetch: typeof fetch;
  /** JSON-RPC call against the data RPC (mainnet). */
  rpc: (method: string, params: unknown[]) => Promise<any>;
  /** DNS lookup, all addresses. Injected so tests can fake DNS. */
  lookup: (host: string) => Promise<string[]>;
};

const DATA_RPC = () => process.env.MARKET_DATA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const JUP_PRICE = "https://lite-api.jup.ag/price/v3";
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022 = "TokenzQdBNbLqP5VjQXoYfrBgqx2nX7S8L4c7Nfkx8wU";

export function defaultDeps(): Deps {
  const f = globalThis.fetch.bind(globalThis);
  return {
    fetch: f,
    rpc: async (method, params) => {
      const res = await f(DATA_RPC(), {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(10_000),
      });
      const j: any = await res.json().catch(() => null);
      if (!res.ok || !j || j.error) throw new ServiceError(502, "UPSTREAM_FAILED", "The Solana RPC didn't answer. You weren't charged.");
      return j.result;
    },
    lookup: async (host) => (await dnsLookup(host, { all: true })).map((a) => a.address),
  };
}

// ---------- input checks (run BEFORE the 402, so a bad request never gets a payment signed) ----------
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SYMBOLS: Record<string, string> = {
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  WIF: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
};

const bad = (msg: string) => new ServiceError(400, "BAD_INPUT", msg);

export async function checkInput(d: Deps, id: ServiceId, q: Record<string, string | undefined>): Promise<void> {
  switch (id) {
    case "price": {
      const ids = (q.tokens ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (!ids.length) throw bad("Pass ?tokens=SOL or ?tokens=<mint>,<mint> (up to 10).");
      if (ids.length > 10) throw bad("Up to 10 tokens per call.");
      for (const t of ids) if (!SYMBOLS[t.toUpperCase()] && !BASE58.test(t)) throw bad(`"${t.slice(0, 50)}" isn't a known symbol or a mint address.`);
      return;
    }
    case "wallet-report":
      if (!BASE58.test(q.address ?? "")) throw bad("Pass ?address=<Solana wallet address>.");
      return;
    case "token-check":
      if (!BASE58.test(q.mint ?? "")) throw bad("Pass ?mint=<token mint address>.");
      return;
    case "read": {
      let u: URL;
      try { u = new URL(q.url ?? ""); } catch { throw bad("Pass ?url=<http(s) page>."); }
      if (u.protocol !== "http:" && u.protocol !== "https:") throw bad("Only http and https pages can be read.");
      if (u.username || u.password) throw bad("URLs with credentials aren't allowed.");
      await assertPublicHost(d, u); // checked again on every redirect when the page is fetched
      return;
    }
    case "flaky":
      return;
  }
}

// ---------- services ----------
async function price(d: Deps, q: Record<string, string | undefined>) {
  const asked = (q.tokens ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const mints = asked.map((t) => SYMBOLS[t.toUpperCase()] ?? t);
  const res = await d.fetch(`${JUP_PRICE}?ids=${mints.join(",")}`, { signal: AbortSignal.timeout(8_000) }).catch(() => null);
  const j: any = res?.ok ? await res.json().catch(() => null) : null;
  if (!j) throw new ServiceError(502, "UPSTREAM_FAILED", "The price source didn't answer. You weren't charged.");
  const prices = asked.map((t, i) => {
    const p = j[mints[i]];
    return p ? { token: t, mint: mints[i], usd: p.usdPrice, change24hPct: p.priceChange24h ?? null, liquidityUsd: p.liquidity ?? null }
      : { token: t, mint: mints[i], usd: null, note: "No price: unknown or illiquid token." };
  });
  if (prices.every((p) => p.usd === null)) throw new ServiceError(404, "NO_PRICE", "None of these tokens has a price. You weren't charged.");
  return { source: "Jupiter Price API v3", at: new Date().toISOString(), prices };
}

async function walletReport(d: Deps, q: Record<string, string | undefined>) {
  const address = q.address!;
  const parsed = { encoding: "jsonParsed" };
  const [bal, t1, t2, sigs] = await Promise.all([
    d.rpc("getBalance", [address]),
    d.rpc("getTokenAccountsByOwner", [address, { programId: TOKEN }, parsed]),
    d.rpc("getTokenAccountsByOwner", [address, { programId: TOKEN_2022 }, parsed]),
    d.rpc("getSignaturesForAddress", [address, { limit: 10 }]),
  ]);
  const accounts = [...(t1?.value ?? []), ...(t2?.value ?? [])];
  const tokens = accounts
    .map((a: any) => a.account?.data?.parsed?.info)
    .filter((i: any) => i && i.tokenAmount && i.tokenAmount.amount !== "0")
    .map((i: any) => ({ mint: i.mint, amount: i.tokenAmount.uiAmountString, decimals: i.tokenAmount.decimals }))
    .sort((a: any, b: any) => Number(b.amount) - Number(a.amount))
    .slice(0, 25);
  return {
    address,
    network: "solana-mainnet",
    sol: (Number(bal?.value ?? 0) / 1e9).toString(),
    tokenAccounts: accounts.length,
    tokens,
    recentActivity: (sigs ?? []).map((s: any) => ({
      signature: s.signature, slot: s.slot, time: s.blockTime ? new Date(s.blockTime * 1000).toISOString() : null, ok: s.err == null,
    })),
  };
}

const RISKY_EXTENSIONS = new Set(["permanentDelegate", "transferHook", "transferFeeConfig", "nonTransferable", "defaultAccountState", "pausableConfig", "confidentialTransferMint"]);

async function tokenCheck(d: Deps, q: Record<string, string | undefined>) {
  const mint = q.mint!;
  const acc = await d.rpc("getAccountInfo", [mint, { encoding: "jsonParsed" }]);
  const v = acc?.value;
  const info = v?.data?.parsed?.type === "mint" ? v.data.parsed.info : null;
  if (!info) throw new ServiceError(404, "NOT_A_MINT", "That address isn't a token mint on Solana mainnet. You weren't charged.");
  const program = v.owner === TOKEN_2022 ? "token-2022" : "token";
  const extensions: string[] = (info.extensions ?? []).map((e: any) => e.extension);
  // Public RPCs often rate-limit this call. The rest of the report is still worth having.
  const largest = await d.rpc("getTokenLargestAccounts", [mint]).catch(() => null);
  const supply = BigInt(info.supply ?? "0");
  let holders: { top1Pct: number; top10Pct: number } | null = null;
  if (largest?.value?.length && supply > 0n) {
    const amts: bigint[] = largest.value.map((a: any) => BigInt(a.amount));
    const pct = (x: bigint) => Number((x * 10_000n) / supply) / 100;
    holders = { top1Pct: pct(amts[0]), top10Pct: pct(amts.slice(0, 10).reduce((s, x) => s + x, 0n)) };
  }
  const flags: string[] = [];
  if (info.mintAuthority) flags.push("Mint authority is set: supply can still grow.");
  if (info.freezeAuthority) flags.push("Freeze authority is set: holders' tokens can be frozen.");
  for (const e of extensions) if (RISKY_EXTENSIONS.has(e)) flags.push(`Token-2022 extension "${e}" can move, tax, block or freeze transfers.`);
  if (holders && holders.top10Pct >= 50) flags.push(`Top 10 accounts hold ${holders.top10Pct}% of supply (often pools or exchanges, check before reading it as risk).`);
  return {
    mint, network: "solana-mainnet", program, decimals: info.decimals, supply: info.supply,
    mintAuthority: info.mintAuthority ?? null, freezeAuthority: info.freezeAuthority ?? null,
    extensions, holders, holdersNote: holders ? undefined : "Holder data wasn't available from the RPC right now.",
    flags,
  };
}

// --- read: fetch a page and return clean text. SSRF-guarded: public http(s) hosts only, re-checked on every redirect.
const READ_MAX_BYTES = 1_000_000;
const READ_MAX_CHARS = 20_000;

export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19))
      || (a === 192 && b === 0);
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return s === "::" || s === "::1" || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || s.startsWith("ff");
  }
  return true; // not an IP at all: refuse
}

async function assertPublicHost(d: Deps, u: URL) {
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw bad("That address isn't on the public internet.");
  }
  const ips = isIP(host) ? [host] : await d.lookup(host).catch(() => [] as string[]);
  if (!ips.length) throw new ServiceError(404, "HOST_NOT_FOUND", "That host doesn't resolve. You weren't charged.");
  if (ips.some(isPrivateIp)) throw bad("That address isn't on the public internet.");
}

function htmlToText(html: string) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  const body = html
    .replace(/<(head|title|script|style|noscript|svg|nav|footer|header|form|iframe)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const decode = (s: string) => s
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n) % 0x110000));
  const text = decode(body).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
  return { title: decode(title), text };
}

async function read(d: Deps, q: Record<string, string | undefined>) {
  let url = new URL(q.url!);
  let res: Response | null = null;
  for (let hop = 0; hop <= 3; hop++) {
    await assertPublicHost(d, url);
    res = await d.fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8_000), headers: { "user-agent": "TAB-market-reader/1.0", accept: "text/html,text/plain;q=0.9" } })
      .catch(() => null);
    if (!res) throw new ServiceError(502, "UPSTREAM_FAILED", "The page didn't load. You weren't charged.");
    const loc = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!loc) break;
    url = new URL(loc, url);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw bad("The page redirected somewhere that can't be read.");
    if (hop === 3) throw new ServiceError(502, "TOO_MANY_REDIRECTS", "The page redirected too many times. You weren't charged.");
  }
  if (!res!.ok) throw new ServiceError(502, "UPSTREAM_FAILED", `The page answered ${res!.status}. You weren't charged.`);
  const type = res!.headers.get("content-type") ?? "";
  if (!/text\/html|text\/plain|application\/xhtml/.test(type)) throw new ServiceError(400, "NOT_TEXT", "That URL isn't a web page or text. You weren't charged.");
  // Read at most READ_MAX_BYTES.
  const reader = res!.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); size += value.byteLength;
    if (size >= READ_MAX_BYTES) { await reader.cancel().catch(() => {}); break; }
  }
  const raw = new TextDecoder().decode(Buffer.concat(chunks).subarray(0, READ_MAX_BYTES));
  const { title, text } = type.includes("text/plain") ? { title: "", text: raw } : htmlToText(raw);
  return { url: url.toString(), title, chars: Math.min(text.length, READ_MAX_CHARS), truncated: text.length > READ_MAX_CHARS, text: text.slice(0, READ_MAX_CHARS) };
}

async function flaky(): Promise<never> {
  throw new ServiceError(503, "SERVICE_DOWN", "This service failed on purpose, to show a failed call. x402 didn't settle the payment, so you weren't charged.");
}

// ---------- catalogue ----------
export type ServiceId = "price" | "wallet-report" | "token-check" | "read" | "flaky";

export type ServiceDef = {
  id: ServiceId;
  name: string;
  /** Token base units (USDC: 6 dp). */
  price: string;
  description: string;
  query: Record<string, { type: "string"; description: string; example: string }>;
  required: string[];
  outputExample: unknown;
  run: (d: Deps, q: Record<string, string | undefined>) => Promise<unknown>;
};

export const SERVICES: ServiceDef[] = [
  {
    id: "price", name: "Token prices", price: "10000",
    description: "Live USD price, 24h change and liquidity for up to 10 Solana tokens (Jupiter).",
    query: { tokens: { type: "string", description: "Comma-separated symbols (SOL, USDC, JUP, BONK, WIF) or mint addresses", example: "SOL,JUP" } },
    required: ["tokens"],
    outputExample: { prices: [{ token: "SOL", usd: 150.12, change24hPct: -1.2 }] },
    run: price,
  },
  {
    id: "wallet-report", name: "Wallet report", price: "50000",
    description: "SOL balance, token holdings and the last 10 transactions for any Solana mainnet wallet.",
    query: { address: { type: "string", description: "Solana wallet address", example: "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg" } },
    required: ["address"],
    outputExample: { sol: "12.5", tokens: [{ mint: "EPjF…", amount: "120.5" }], recentActivity: [{ signature: "…", ok: true }] },
    run: walletReport,
  },
  {
    id: "token-check", name: "Token safety check", price: "30000",
    description: "Mint and freeze authority, Token-2022 extensions and holder concentration for a token, with plain-language flags.",
    query: { mint: { type: "string", description: "Token mint address", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" } },
    required: ["mint"],
    outputExample: { program: "token", mintAuthority: null, freezeAuthority: null, extensions: [], flags: [] },
    run: tokenCheck,
  },
  {
    id: "read", name: "Read a web page", price: "20000",
    description: "Fetches a public web page and returns its title and clean text (up to 20,000 characters).",
    query: { url: { type: "string", description: "http(s) URL of a public page", example: "https://solana.com/docs" } },
    required: ["url"],
    outputExample: { title: "Solana Documentation", text: "…", truncated: false },
    run: read,
  },
  {
    id: "flaky", name: "Always-failing service", price: "10000",
    description: "Fails on purpose. Shows that a failed call is never charged: x402 doesn't settle a payment for an error response.",
    query: {},
    required: [],
    outputExample: { error: { code: "SERVICE_DOWN" } },
    run: flaky,
  },
];

export const SERVICE_BY_ID = new Map(SERVICES.map((s) => [s.id, s]));
