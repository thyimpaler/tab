// Scripted agent session for the landing page. Clearly a simulation; the dashboard runs real ones.
// Amounts are micro-USDC integers.
export const SIM_LIMIT = 5_000_000;
export const SIM_CAP = 500_000;
export const SIM_CALLS: { url: string; amount: number; refuse?: string }[] = [
  { url: "api.pricefeed.dev/v1/quote?sym=SOL", amount: 10_000 },
  { url: "search.lens.ai/query?q=solana+fees", amount: 50_000 },
  { url: "api.pricefeed.dev/v1/quote?sym=BTC", amount: 10_000 },
  { url: "scrape.page/run?url=defillama.com", amount: 250_000 },
  { url: "llm.gateway/v1/chat  12k tokens", amount: 420_000 },
  { url: "data.vendor/bulk-export", amount: 2_400_000, refuse: "over the 0.50 per-payment cap" },
  { url: "unknown-host.xyz/drain", amount: 100_000, refuse: "not on the allowlist" },
  { url: "api.pricefeed.dev/v1/quote?sym=ETH", amount: 10_000 },
  { url: "llm.gateway/v1/chat  40k tokens", amount: 480_000 },
  { url: "search.lens.ai/query?q=x402", amount: 50_000 },
];

export const usdc = (u: number | bigint, places = 3) => (Number(u) / 1e6).toFixed(places);
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export const fakeSig = () => Array.from({ length: 4 }, () => B58[Math.floor(Math.random() * 58)]).join("");
export const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
