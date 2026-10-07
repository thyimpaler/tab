// /v1/pay engine. Reserve under a row lock, sign outside it, record what we signed.
// Invariants (CLAUDE.md): check order, FOR UPDATE, idempotency, bigint only, sign nothing on reject.
import { createHash } from "node:crypto";
import { config, delegateKeypair } from "./config.js";
import { chain } from "./chain.js";
import { credentialMatches, parseCredential } from "./credential.js";
import { db, withTx, type Tx } from "./db.js";
import { TabError } from "./errors.js";
import { buildDelegatePayment, decodePaymentRequired, selectRequirement } from "./x402.js";

export type TabRow = {
  id: string; owner_id: string; label: string | null; mint: string; token_account: string;
  delegate_pubkey: string; limit_amount: bigint; spent_amount: bigint; reserved_amount: bigint;
  per_payment_cap: bigint | null; expires_at: Date; status: string; credential_hash: string | null;
  network: string; token_program: string; decimals: number;
};

export type PayInput = {
  credential: string;
  idempotencyKey: string;
  paymentRequired: unknown;    // decoded object or raw PAYMENT-REQUIRED header
  resource?: string;
};

export type PayOutput = {
  paymentId: string;
  amount: string;
  recipient: string;
  mint: string;
  paymentSignature: string;    // send as the PAYMENT-SIGNATURE header on the retry
  remaining: string;
  replayed: boolean;
};

/** Test hook: lets the crash-injection test kill the flow between reserve and sign. */
export const hooks: {
  afterReserve?: (paymentId: string) => Promise<void>;
  /** Test hook: runs inside the reserve transaction right after the tab row is read. */
  afterLock?: () => Promise<void>;
} = {};

export async function authTab(credential: string): Promise<string> {
  const parsed = typeof credential === "string" ? parseCredential(credential) : null;
  if (!parsed) throw new TabError("INVALID_CREDENTIAL");
  const r = await db().query(`SELECT credential_hash FROM tabs WHERE id = $1`, [parsed.tabId]);
  // Same error for unknown tab and wrong secret: don't leak which tab ids exist.
  if (!r.rowCount || !credentialMatches(credential, r.rows[0].credential_hash)) throw new TabError("INVALID_CREDENTIAL");
  return parsed.tabId;
}

const remainingOf = (t: { limit_amount: bigint; spent_amount: bigint; reserved_amount: bigint }) =>
  t.limit_amount - t.spent_amount - t.reserved_amount;

/** Invariant 4, in order. Throws the first failing check. Signs nothing. */
export function checkPayment(t: TabRow, amount: bigint, recipient: string, allowlist: string[], now = new Date()) {
  if (t.status === "revoked") throw new TabError("TAB_REVOKED");
  if (t.status === "closed") throw new TabError("TAB_CLOSED");
  if (t.status === "expired") throw new TabError("TAB_EXPIRED");
  if (t.status === "pending") throw new TabError("TAB_NOT_FOUND", "tab is not activated yet");
  if (t.status !== "active" && t.status !== "empty") throw new TabError("TAB_NOT_FOUND");
  if (!(now < t.expires_at)) throw new TabError("TAB_EXPIRED");
  if (t.per_payment_cap !== null && amount > t.per_payment_cap) throw new TabError("PAYMENT_EXCEEDS_TAB_LIMIT");
  if (allowlist.length > 0 && !allowlist.includes(recipient)) throw new TabError("RECIPIENT_NOT_ALLOWED");
  if (amount > remainingOf(t)) throw new TabError("INSUFFICIENT_TAB_BALANCE");
}

function requestHash(input: { payTo: string; amount: string; asset: string; network: string; resource?: string }) {
  return createHash("sha256").update(JSON.stringify([input.network, input.asset, input.payTo, input.amount, input.resource ?? ""])).digest("hex");
}

export async function pay(input: PayInput): Promise<PayOutput> {
  if (typeof input.idempotencyKey !== "string" || input.idempotencyKey.length < 8 || input.idempotencyKey.length > 128) {
    throw new TabError("BAD_REQUEST", "idempotencyKey must be 8-128 chars");
  }
  const tabId = await authTab(input.credential);
  const cfg = config();
  const pr = decodePaymentRequired(input.paymentRequired);

  // Read the tab's mint first (no lock) only to pick the matching requirement.
  const pre = await db().query(`SELECT mint, network FROM tabs WHERE id = $1`, [tabId]);
  if (!pre.rowCount) throw new TabError("TAB_NOT_FOUND");
  if (!cfg.acceptedMints.includes(pre.rows[0].mint)) throw new TabError("UNSUPPORTED_MINT");
  const req = selectRequirement(pr, cfg.caip2, pre.rows[0].mint);
  const amount = BigInt(req.amount);
  const hash = requestHash({ ...req, resource: input.resource });

  // Blockhash before taking the lock, so the lock is never held across network I/O.
  const bh = await chain().getLatestBlockhash().catch(() => { throw new TabError("CHAIN_UNAVAILABLE"); });

  // ---- reserve (row lock) ----
  const reserved = await withTx(async (tx) => {
    const t = await lockTab(tx, tabId);
    await hooks.afterLock?.();
    const prior = await tx.query(
      `SELECT id, request_hash, amount, recipient, payment_header, state FROM payments WHERE tab_id = $1 AND idempotency_key = $2`,
      [tabId, input.idempotencyKey],
    );
    if (prior.rowCount) {
      const p = prior.rows[0];
      if (p.request_hash !== hash) throw new TabError("DUPLICATE_REQUEST", "idempotency key reused with a different request");
      return { replay: p, tab: t };
    }
    const allow = (await tx.query(`SELECT recipient FROM allowed_recipients WHERE tab_id = $1`, [tabId])).rows.map((r) => r.recipient);
    checkPayment(t, amount, req.payTo, allow);
    const ins = await tx.query(
      `INSERT INTO payments (tab_id, idempotency_key, amount, recipient, resource, request_hash, network, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'RESERVED') RETURNING id`,
      [tabId, input.idempotencyKey, amount.toString(), req.payTo, input.resource ?? null, hash, cfg.network],
    );
    await tx.query(`UPDATE tabs SET reserved_amount = reserved_amount + $2 WHERE id = $1`, [tabId, amount.toString()]);
    return { paymentId: ins.rows[0].id as string, tab: { ...t, reserved_amount: t.reserved_amount + amount } };
  }).catch(async (e) => {
    // An expired tab gets marked even though the payment is rejected.
    if (e instanceof TabError && e.code === "TAB_EXPIRED") {
      await db().query(`UPDATE tabs SET status = 'expired' WHERE id = $1 AND status = 'active'`, [tabId]);
    }
    throw e;
  });

  if ("replay" in reserved && reserved.replay) {
    const p = reserved.replay;
    if (!p.payment_header) throw new TabError("DUPLICATE_REQUEST", "original request is still in flight");
    return {
      paymentId: p.id, amount: p.amount.toString(), recipient: p.recipient, mint: reserved.tab.mint,
      paymentSignature: p.payment_header, remaining: remainingOf(reserved.tab).toString(), replayed: true,
    };
  }
  const { paymentId, tab } = reserved as { paymentId: string; tab: TabRow };

  await hooks.afterReserve?.(paymentId);

  // ---- sign (no lock held; the reservation already holds the funds) ----
  const signed = buildDelegatePayment({
    pr, req, source: tab.token_account, tokenProgram: tab.token_program, decimals: tab.decimals,
    delegate: delegateKeypair(), blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight,
  });
  const upd = await db().query(
    `UPDATE payments SET state = 'DISPATCHING', delegate_signature = $2, last_valid_block_height = $3,
       payment_header = $4, updated_at = now() WHERE id = $1 AND state = 'RESERVED'`,
    [paymentId, signed.delegateSignature, signed.lastValidBlockHeight.toString(), signed.header],
  );
  // Reconcile released a stale reservation while we were signing: the signed tx must never leave.
  if (upd.rowCount !== 1) throw new TabError("CHAIN_UNAVAILABLE", "reservation expired before signing, retry with a new key");

  return {
    paymentId, amount: amount.toString(), recipient: req.payTo, mint: tab.mint,
    paymentSignature: signed.header, remaining: remainingOf(tab).toString(), replayed: false,
  };
}

export async function lockTab(tx: Tx, tabId: string): Promise<TabRow> {
  const r = await tx.query(`SELECT * FROM tabs WHERE id = $1 FOR UPDATE`, [tabId]);
  if (!r.rowCount) throw new TabError("TAB_NOT_FOUND");
  return r.rows[0] as TabRow;
}
