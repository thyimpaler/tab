// Settlement and crash recovery.
// A signed payment can only land on chain until its blockhash expires (last_valid_block_height).
// So a DISPATCHING payment is never released before that height has passed; after it, the chain
// is the source of truth: our delegate signature on a successful tx -> SETTLED, otherwise RELEASED.
import { chain } from "./chain.ts";
import { db, withTx } from "./db.ts";
import { TabError } from "./errors.ts";
import { lockTab } from "./pay.ts";

// Unsigned reservations older than this were orphaned by a crash between reserve and sign.
const UNSIGNED_GRACE_MS = 60_000;
// Extra blocks past expiry before we trust "not found".
const EXPIRY_MARGIN = 30n;

type Outcome = "SETTLED" | "RELEASED" | "AMBIGUOUS";

async function resolve(paymentId: string, outcome: Outcome, opts: { txSignature?: string; error?: string } = {}) {
  return withTx(async (tx) => {
    const p = (await tx.query(`SELECT tab_id FROM payments WHERE id = $1`, [paymentId])).rows[0];
    if (!p) return false;
    const t = await lockTab(tx, p.tab_id);   // tab first, then payment: same lock order as /v1/pay
    const r = await tx.query(
      `SELECT amount, state FROM payments WHERE id = $1 FOR UPDATE`, [paymentId],
    );
    const cur = r.rows[0];
    if (!["RESERVED", "DISPATCHING", "AMBIGUOUS"].includes(cur.state)) return false; // already final
    if (outcome === "AMBIGUOUS") {
      await tx.query(`UPDATE payments SET state = 'AMBIGUOUS', error_code = $2, updated_at = now() WHERE id = $1`, [paymentId, opts.error ?? null]);
      return true;
    }
    const amount: bigint = cur.amount;
    if (outcome === "SETTLED") {
      await tx.query(
        `UPDATE payments SET state = 'SETTLED', tx_signature = COALESCE($2, tx_signature), settled_at = now(), updated_at = now() WHERE id = $1`,
        [paymentId, opts.txSignature ?? null],
      );
      const spent = t.spent_amount + amount;
      await tx.query(
        `UPDATE tabs SET spent_amount = $2, reserved_amount = reserved_amount - $3,
           status = CASE WHEN status = 'active' AND $2 >= limit_amount THEN 'empty'::tab_status ELSE status END
         WHERE id = $1`,
        [t.id, spent.toString(), amount.toString()],
      );
    } else {
      await tx.query(
        `UPDATE payments SET state = 'RELEASED', error_code = COALESCE($2, error_code), updated_at = now() WHERE id = $1`,
        [paymentId, opts.error ?? null],
      );
      await tx.query(`UPDATE tabs SET reserved_amount = reserved_amount - $2 WHERE id = $1`, [t.id, amount.toString()]);
    }
    return true;
  });
}

/** Called by the SDK after the merchant answered. `txSignature` comes from PAYMENT-RESPONSE. */
export async function confirmPayment(tabId: string, paymentId: string, txSignature?: string) {
  const r = await db().query(
    `SELECT id, state, delegate_signature, tx_signature FROM payments WHERE id = $1 AND tab_id = $2`, [paymentId, tabId],
  );
  if (!r.rowCount) throw new TabError("BAD_REQUEST", "unknown payment");
  const p = r.rows[0];
  if (p.state === "SETTLED" || p.state === "RELEASED") return { state: p.state as string };
  if (txSignature && p.delegate_signature) {
    const tx = await chain().getTx(txSignature).catch(() => null);
    // Only trust a tx that actually carries our signature: a client can't settle someone else's tx.
    if (tx?.found && tx.signatures.includes(p.delegate_signature)) {
      await resolve(paymentId, tx.ok ? "SETTLED" : "RELEASED", { txSignature, error: tx.ok ? undefined : "TX_FAILED" });
    } else if (!p.tx_signature) {
      await db().query(`UPDATE payments SET tx_signature = $2, updated_at = now() WHERE id = $1`, [paymentId, txSignature]);
    }
  }
  const after = await db().query(`SELECT state FROM payments WHERE id = $1`, [paymentId]);
  return { state: after.rows[0].state as string };
}

/** Resolves every stuck payment that can be resolved now. Safe to run concurrently and repeatedly. */
export async function reconcile(tabId?: string) {
  const where = tabId ? `AND p.tab_id = $1` : "";
  const rows = (await db().query(
    `SELECT p.id, p.state, p.delegate_signature, p.last_valid_block_height, p.tx_signature, p.updated_at, t.token_account
       FROM payments p JOIN tabs t ON t.id = p.tab_id
      WHERE p.state IN ('RESERVED','DISPATCHING','AMBIGUOUS') ${where}
      ORDER BY p.created_at LIMIT 200`,
    tabId ? [tabId] : [],
  )).rows;
  if (!rows.length) return { checked: 0, settled: 0, released: 0 };

  let height: bigint | null = null;
  let settled = 0, released = 0;
  for (const p of rows) {
    if (!p.delegate_signature) {
      // Never signed: nothing can land. Release once it's clearly orphaned.
      if (Date.now() - new Date(p.updated_at).getTime() > UNSIGNED_GRACE_MS) {
        if (await resolve(p.id, "RELEASED", { error: "ORPHANED_RESERVATION" })) released++;
      }
      continue;
    }
    try {
      height ??= await chain().getBlockHeight();
      // A reported tx id is the cheapest lookup.
      if (p.tx_signature) {
        const tx = await chain().getTx(p.tx_signature);
        if (tx.found && tx.signatures.includes(p.delegate_signature)) {
          if (await resolve(p.id, tx.ok ? "SETTLED" : "RELEASED", { txSignature: p.tx_signature, error: tx.ok ? undefined : "TX_FAILED" })) tx.ok ? settled++ : released++;
          continue;
        }
      }
      if (height <= BigInt(p.last_valid_block_height) + EXPIRY_MARGIN) continue; // could still land
      const found = await chain().findTxBySigner(p.token_account, p.delegate_signature);
      if (found.found) {
        const sig = found.signatures[0];
        if (await resolve(p.id, found.ok ? "SETTLED" : "RELEASED", { txSignature: sig, error: found.ok ? undefined : "TX_FAILED" })) found.ok ? settled++ : released++;
      } else if (await resolve(p.id, "RELEASED", { error: "EXPIRED_UNSUBMITTED" })) {
        released++;
      }
    } catch (e) {
      // RPC trouble: keep funds reserved, try again later. Never guess.
      await resolve(p.id, "AMBIGUOUS", { error: "RPC_ERROR" });
    }
  }
  return { checked: rows.length, settled, released };
}
