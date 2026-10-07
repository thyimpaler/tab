import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bs58 from "bs58";
import { config } from "./config.ts";

// Format: tab_live_<tabId without dashes>_<32 random bytes, base58>.
// The tab id lets us find the row; only the HMAC of the whole credential is stored.
const RE = /^tab_(live|test)_([0-9a-f]{32})_([1-9A-HJ-NP-Za-km-z]{32,64})$/;

export function newCredential(tabId: string): string {
  const prefix = config().network === "mainnet" ? "live" : "test";
  return `tab_${prefix}_${tabId.replace(/-/g, "")}_${bs58.encode(randomBytes(32))}`;
}

export function hashCredential(credential: string): string {
  return createHmac("sha256", config().credentialPepper).update(credential).digest("hex");
}

export function parseCredential(credential: string): { tabId: string } | null {
  const m = RE.exec(credential);
  if (!m) return null;
  const h = m[2];
  return { tabId: `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` };
}

export function credentialMatches(credential: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  const a = Buffer.from(hashCredential(credential), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
