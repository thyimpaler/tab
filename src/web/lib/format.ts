// Money is integers in base units end to end. These only convert for display and input.

export function toUnits(input: string, decimals: number): string | null {
  const s = input.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [w, f = ""] = s.split(".");
  if (f.length > decimals) return null;
  const v = BigInt(w) * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0");
  return v > 0n ? v.toString() : null;
}

export function fromUnits(units: string | bigint, decimals: number, places = 2): string {
  const v = BigInt(units);
  const neg = v < 0n;
  const a = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = a / base;
  let frac = (a % base).toString().padStart(decimals, "0");
  // Show at least `places`, more only if needed.
  frac = frac.replace(/0+$/, "");
  if (frac.length < places) frac = frac.padEnd(places, "0");
  return `${neg ? "-" : ""}${whole.toLocaleString("en-US")}${frac ? "." + frac : ""}`;
}

export const short = (a: string, n = 4) => (a.length > 2 * n + 1 ? `${a.slice(0, n)}…${a.slice(-n)}` : a);

export function until(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h left`;
  if (h > 0) return `${h}h ${m % 60}m left`;
  return `${m}m left`;
}

export const explorerTx = (sig: string, net: string) =>
  `https://explorer.solana.com/tx/${sig}${net === "devnet" ? "?cluster=devnet" : ""}`;
export const explorerAddr = (a: string, net: string) =>
  `https://explorer.solana.com/address/${a}${net === "devnet" ? "?cluster=devnet" : ""}`;
