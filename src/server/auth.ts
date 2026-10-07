// Sign-In With Solana (message signature only, no transaction, no fee) + HMAC session cookie.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { config } from "./config.ts";
import { db } from "./db.ts";
import { TabError } from "./errors.ts";
import { isBase58Pubkey } from "./chain.ts";

const NONCE_TTL_MS = 10 * 60_000;
export const SESSION_TTL_S = 7 * 86_400;
export const SESSION_COOKIE = "tab_session";

export async function issueNonce() {
  const nonce = bs58.encode(randomBytes(16));
  await db().query(`INSERT INTO auth_nonces (nonce, expires_at) VALUES ($1, $2)`, [nonce, new Date(Date.now() + NONCE_TTL_MS)]);
  await db().query(`DELETE FROM auth_nonces WHERE expires_at < now() - interval '1 day'`).catch(() => {});
  return nonce;
}

/** SIWS input that wallets with `solana:signIn` take directly, and the same text for signMessage fallback. */
export function signInInput(host: string, origin: string, nonce: string) {
  const issuedAt = new Date().toISOString();
  return {
    domain: host,
    uri: origin,
    version: "1",
    chainId: config().network === "mainnet" ? "mainnet" : "devnet",
    nonce,
    issuedAt,
    expirationTime: new Date(Date.now() + NONCE_TTL_MS).toISOString(),
    statement: "Sign in to TAB. This only signs a message. No transaction, no fee.",
  };
}

/** Exact SIWS message format (matches @solana/wallet-standard-util createSignInMessageText). */
export function siwsMessage(address: string, i: ReturnType<typeof signInInput>) {
  let m = `${i.domain} wants you to sign in with your Solana account:\n${address}`;
  m += `\n\n${i.statement}`;
  const f = [`URI: ${i.uri}`, `Version: ${i.version}`, `Chain ID: ${i.chainId}`, `Nonce: ${i.nonce}`, `Issued At: ${i.issuedAt}`, `Expiration Time: ${i.expirationTime}`];
  return `${m}\n\n${f.join("\n")}`;
}

function field(message: string, name: string) {
  return new RegExp(`^${name}: (.+)$`, "m").exec(message)?.[1];
}

export async function verifySignIn(args: { address: string; message: string; signature: string }, expectedHost: string) {
  const { address, message, signature } = args;
  if (!isBase58Pubkey(address) || typeof message !== "string" || typeof signature !== "string" || message.length > 2000) {
    throw new TabError("UNAUTHORIZED", "bad sign-in payload");
  }
  const firstLine = message.split("\n")[0];
  if (firstLine !== `${expectedHost} wants you to sign in with your Solana account:`) throw new TabError("UNAUTHORIZED", "wrong domain");
  if (message.split("\n")[1] !== address) throw new TabError("UNAUTHORIZED", "address mismatch");
  const exp = field(message, "Expiration Time");
  if (!exp || new Date(exp).getTime() < Date.now()) throw new TabError("UNAUTHORIZED", "sign-in expired");
  const nonce = field(message, "Nonce");
  if (!nonce) throw new TabError("UNAUTHORIZED", "missing nonce");

  // Client sends base58; accept base64 too.
  let sig: Uint8Array = new Uint8Array();
  try { sig = bs58.decode(signature); } catch {}
  if (sig.length !== 64) sig = Uint8Array.from(Buffer.from(signature, "base64"));
  const ok = sig.length === 64 && nacl.sign.detached.verify(new TextEncoder().encode(message), sig, bs58.decode(address));
  if (!ok) throw new TabError("UNAUTHORIZED", "signature does not verify");

  // Single use.
  const used = await db().query(
    `UPDATE auth_nonces SET used_at = now() WHERE nonce = $1 AND used_at IS NULL AND expires_at > now()`, [nonce],
  );
  if (used.rowCount !== 1) throw new TabError("UNAUTHORIZED", "nonce already used or unknown");
  return address;
}

const b64u = (b: Buffer) => b.toString("base64url");

export function makeSession(wallet: string) {
  const body = b64u(Buffer.from(JSON.stringify({ w: wallet, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_S })));
  const mac = b64u(createHmac("sha256", config().sessionSecret).update(body).digest());
  return `${body}.${mac}`;
}

export function readSession(token: string | undefined): string | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expect = createHmac("sha256", config().sessionSecret).update(body).digest();
  const got = Buffer.from(mac, "base64url");
  if (got.length !== expect.length || !timingSafeEqual(got, expect)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof p.w !== "string" || typeof p.exp !== "number" || p.exp < Date.now() / 1000) return null;
    return p.w;
  } catch { return null; }
}
