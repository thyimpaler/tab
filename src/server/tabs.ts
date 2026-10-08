// TAB lifecycle. Non-custodial: the user's wallet owns the dedicated token account at all times.
//   create   -> we build one tx the user signs: new token account (owner = user), fund it with
//               `limit` from their ATA, approve our delegate for exactly `limit`.
//   activate -> we read the account on chain and only then issue the credential (shown once).
//   revoke   -> we stop signing immediately; we return a tx the user can sign to revoke the
//               allowance on chain, sweep the funds back and close the account (rent back too).
import {
  Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction,
} from "@solana/web3.js";
import {
  ACCOUNT_SIZE, createApproveCheckedInstruction, createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction, createInitializeAccount3Instruction,
  createRevokeInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { z } from "zod";
import { config, delegatePubkey } from "./config.js";
import { BANNED_EXTENSIONS, chain, isBase58Pubkey } from "./chain.js";
import { hashCredential, newCredential } from "./credential.js";
import { db, withTx } from "./db.js";
import { TabError } from "./errors.js";
import { lockTab } from "./pay.js";
import { reconcile } from "./settle.js";
import { RpcChain } from "./chain.js";

const MAX_DAYS = 90;

export const CreateTabBody = z.object({
  label: z.string().trim().max(60).optional(),
  limit: z.string().regex(/^[1-9][0-9]{0,18}$/, "base units, positive integer"),
  perPaymentCap: z.string().regex(/^[1-9][0-9]{0,18}$/).optional(),
  expiresAt: z.string().datetime(),
  allowlist: z.array(z.string()).max(50).optional(),
  mint: z.string().optional(),
});

export async function upsertUser(wallet: string): Promise<string> {
  const r = await db().query(
    `INSERT INTO users (wallet_address) VALUES ($1)
     ON CONFLICT (wallet_address) DO UPDATE SET wallet_address = EXCLUDED.wallet_address RETURNING id`,
    [wallet],
  );
  return r.rows[0].id;
}

export async function assertMintAllowed(mint: string) {
  if (!config().acceptedMints.includes(mint)) throw new TabError("UNSUPPORTED_MINT");
  const m = await chain().getMint(mint).catch(() => { throw new TabError("CHAIN_UNAVAILABLE"); });
  if (!m) throw new TabError("UNSUPPORTED_MINT", "mint not found");
  const bad = m.extensions.filter((e) => BANNED_EXTENSIONS.has(e));
  if (bad.length) throw new TabError("UNSUPPORTED_MINT", `mint uses ${bad.join(", ")}`);
  return m;
}

export async function createTab(wallet: string, body: z.infer<typeof CreateTabBody>) {
  const cfg = config();
  const mint = body.mint ?? cfg.acceptedMints[0];
  const limit = BigInt(body.limit);
  const cap = body.perPaymentCap ? BigInt(body.perPaymentCap) : null;
  if (cap !== null && cap > limit) throw new TabError("BAD_REQUEST", "per-payment cap is above the limit");
  // Beta safety rail: a ceiling per tab while TAB is new. MAX_TAB_LIMIT is in base units.
  const maxLimit = process.env.MAX_TAB_LIMIT ? BigInt(process.env.MAX_TAB_LIMIT) : null;
  if (maxLimit !== null && limit > maxLimit) throw new TabError("BAD_REQUEST", `during the beta a tab can hold at most ${maxLimit / 1_000_000n} USDC`);
  const expiresAt = new Date(body.expiresAt);
  const ms = expiresAt.getTime() - Date.now();
  if (ms < 5 * 60_000 || ms > MAX_DAYS * 86_400_000) throw new TabError("BAD_REQUEST", `expiry must be 5 minutes to ${MAX_DAYS} days out`);
  const allow = [...new Set(body.allowlist ?? [])];
  if (!allow.every(isBase58Pubkey)) throw new TabError("BAD_REQUEST", "allowlist entries must be Solana addresses");

  const m = await assertMintAllowed(mint);
  const owner = new PublicKey(wallet);
  const program = new PublicKey(m.program);
  const mintPk = new PublicKey(mint);
  const userAta = getAssociatedTokenAddressSync(mintPk, owner, false, program);
  const ata = await chain().getTokenAccount(userAta.toBase58()).catch(() => null);
  const fee = cfg.tabFee;
  if (!ata || ata.amount < limit + fee) {
    throw new TabError("BAD_REQUEST", fee > 0n
      ? `wallet doesn't hold enough of this token for the limit plus the ${Number(fee) / 10 ** m.decimals} opening fee`
      : "wallet doesn't hold enough of this token to fund the tab");
  }
  // Opening fee goes in the SAME transaction: the tab account can only be created by this exact
  // message (its keypair signs only here and is then discarded), so an active tab means the fee was paid.
  const feeIxs = [];
  if (fee > 0n && cfg.treasury) {
    const treasury = new PublicKey(cfg.treasury);
    const treasuryAta = getAssociatedTokenAddressSync(mintPk, treasury, true, program);
    feeIxs.push(
      createAssociatedTokenAccountIdempotentInstruction(owner, treasuryAta, treasury, mintPk, program),
      createTransferCheckedInstruction(userAta, mintPk, treasuryAta, owner, fee, m.decimals, [], program),
    );
  }

  const account = Keypair.generate(); // used once to create the account, then discarded
  const rpc = chain() instanceof RpcChain ? (chain() as RpcChain).conn : null;
  const rent = rpc ? await rpc.getMinimumBalanceForRentExemption(ACCOUNT_SIZE) : 2_039_280;
  const delegate = delegatePubkey();
  const { blockhash } = await chain().getLatestBlockhash();

  const msg = new TransactionMessage({
    payerKey: owner,
    recentBlockhash: blockhash,
    instructions: [
      SystemProgram.createAccount({ fromPubkey: owner, newAccountPubkey: account.publicKey, lamports: rent, space: ACCOUNT_SIZE, programId: program }),
      createInitializeAccount3Instruction(account.publicKey, mintPk, owner, program),
      createTransferCheckedInstruction(userAta, mintPk, account.publicKey, owner, limit, m.decimals, [], program),
      createApproveCheckedInstruction(account.publicKey, mintPk, delegate, owner, limit, m.decimals, [], program),
      ...feeIxs,
    ],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([account]);

  const tabId = await withTx(async (q) => {
    const userId = await upsertUser(wallet);
    const r = await q.query(
      `INSERT INTO tabs (owner_id, label, mint, token_account, delegate_pubkey, limit_amount, per_payment_cap,
                         expires_at, status, network, token_program, decimals, fee_amount, fee_recipient)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10,$11,$12,$13) RETURNING id`,
      [userId, body.label ?? null, mint, account.publicKey.toBase58(), delegate.toBase58(), limit.toString(),
        cap?.toString() ?? null, expiresAt, cfg.network, m.program, m.decimals, fee.toString(), feeIxs.length ? cfg.treasury : null],
    );
    for (const a of allow) await q.query(`INSERT INTO allowed_recipients (tab_id, recipient) VALUES ($1,$2)`, [r.rows[0].id, a]);
    return r.rows[0].id as string;
  });

  return { tabId, tokenAccount: account.publicKey.toBase58(), fee: fee.toString(), transaction: Buffer.from(tx.serialize()).toString("base64") };
}

async function ownedTab(wallet: string, tabId: string) {
  const r = await db().query(
    `SELECT t.* FROM tabs t JOIN users u ON u.id = t.owner_id WHERE t.id = $1 AND u.wallet_address = $2 AND t.network = $3`,
    [tabId, wallet, config().network],
  );
  if (!r.rowCount) throw new TabError("TAB_NOT_FOUND");
  return r.rows[0];
}

/** Verifies the dedicated account on chain, then issues the credential. Returned exactly once. */
export async function activateTab(wallet: string, tabId: string, signature?: string) {
  const t = await ownedTab(wallet, tabId);
  if (t.status !== "pending") throw new TabError("BAD_REQUEST", "tab is already activated");
  const acct = await chain().getTokenAccount(t.token_account).catch((e) => {
    console.error("activate: chain read failed", tabId, e instanceof Error ? e.message : e);
    throw new TabError("CHAIN_UNAVAILABLE");
  });
  if (!acct) throw new TabError("NOT_ACTIVATED", "token account not found yet, wait for confirmation");
  const problems: string[] = [];
  if (acct.owner !== wallet) problems.push("owner");
  if (acct.mint !== t.mint) problems.push("mint");
  if (acct.delegate !== t.delegate_pubkey) problems.push("delegate");
  if (acct.delegatedAmount !== t.limit_amount) problems.push("allowance");
  if (acct.amount < t.limit_amount) problems.push("balance");
  if (acct.closeAuthority) problems.push("close authority");
  if (acct.frozen) problems.push("frozen");
  if (problems.length) console.error("activate: on-chain mismatch", tabId, problems.join(","));
  if (problems.length) throw new TabError("CHAIN_STATE_MISMATCH", `on-chain account mismatch: ${problems.join(", ")}`);

  const credential = newCredential(tabId);
  const r = await db().query(
    `UPDATE tabs SET status = 'active', credential_hash = $2, create_signature = $3, activated_at = now()
      WHERE id = $1 AND status = 'pending'`,
    [tabId, hashCredential(credential), signature ?? null],
  );
  if (r.rowCount !== 1) throw new TabError("BAD_REQUEST", "tab is already activated");
  return { credential };
}

/** Rotates the credential. Old one stops working immediately. */
export async function rotateCredential(wallet: string, tabId: string) {
  const t = await ownedTab(wallet, tabId);
  if (t.status !== "active" && t.status !== "empty") throw new TabError("BAD_REQUEST", "only an active tab can rotate its key");
  const credential = newCredential(tabId);
  await db().query(`UPDATE tabs SET credential_hash = $2 WHERE id = $1`, [tabId, hashCredential(credential)]);
  return { credential };
}

/** chainState: undefined = not read (or RPC failed), null = account no longer exists. */
export function publicTab(t: any, chainState?: { amount: string; delegatedAmount: string; delegate: string | null } | null) {
  const remaining = t.limit_amount - t.spent_amount - t.reserved_amount;
  return {
    id: t.id, label: t.label, status: t.status, network: t.network, mint: t.mint, decimals: t.decimals,
    tokenAccount: t.token_account, delegate: t.delegate_pubkey,
    limit: t.limit_amount.toString(), spent: t.spent_amount.toString(), reserved: t.reserved_amount.toString(),
    remaining: (remaining < 0n ? 0n : remaining).toString(),
    perPaymentCap: t.per_payment_cap?.toString() ?? null,
    expiresAt: t.expires_at, createdAt: t.created_at, revokedAt: t.revoked_at, closedAt: t.closed_at,
    chain: chainState,
  };
}

export async function listTabs(wallet: string) {
  const r = await db().query(
    `SELECT t.* FROM tabs t JOIN users u ON u.id = t.owner_id WHERE u.wallet_address = $1 AND t.network = $2 ORDER BY t.created_at DESC LIMIT 100`,
    [wallet, config().network],
  );
  // Lazily expire.
  const now = Date.now();
  for (const t of r.rows) {
    if (t.status === "active" && new Date(t.expires_at).getTime() <= now) {
      await db().query(`UPDATE tabs SET status = 'expired' WHERE id = $1 AND status = 'active'`, [t.id]);
      t.status = "expired";
    }
  }
  return r.rows.map((t) => publicTab(t));
}

export async function getTab(wallet: string, tabId: string, withChain = true) {
  await reconcile(tabId).catch(() => {});
  const t = await ownedTab(wallet, tabId);
  let chainState: Parameters<typeof publicTab>[1] = undefined;
  if (withChain) {
    const a = await chain().getTokenAccount(t.token_account).catch(() => undefined);
    chainState = a === undefined ? undefined : a === null ? null : { amount: a.amount.toString(), delegatedAmount: a.delegatedAmount.toString(), delegate: a.delegate };
  }
  const payments = (await db().query(
    `SELECT id, amount, recipient, resource, state, tx_signature, error_code, created_at, settled_at
       FROM payments WHERE tab_id = $1 ORDER BY created_at DESC LIMIT 100`, [tabId],
  )).rows.map((p) => ({ ...p, amount: p.amount.toString() }));
  const allowlist = (await db().query(`SELECT recipient FROM allowed_recipients WHERE tab_id = $1`, [tabId])).rows.map((r) => r.recipient);
  return { tab: publicTab(t, chainState), payments, allowlist };
}

/** Builds the tx that takes everything back: revoke allowance, sweep funds to the user's ATA, close. */
async function reclaimTx(t: any, wallet: string) {
  const owner = new PublicKey(wallet);
  const program = new PublicKey(t.token_program);
  const mint = new PublicKey(t.mint);
  const account = new PublicKey(t.token_account);
  const acct = await chain().getTokenAccount(t.token_account).catch(() => null);
  if (!acct) return null; // already closed
  const userAta = getAssociatedTokenAddressSync(mint, owner, false, program);
  const { blockhash } = await chain().getLatestBlockhash();
  const ixs = [createRevokeInstruction(account, owner, [], program)];
  if (acct.amount > 0n) ixs.push(createTransferCheckedInstruction(account, mint, userAta, owner, acct.amount, t.decimals, [], program));
  ixs.push(createCloseAccountInstruction(account, owner, owner, [], program));
  const msg = new TransactionMessage({ payerKey: owner, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message();
  return Buffer.from(new VersionedTransaction(msg).serialize()).toString("base64");
}

export async function revokeTab(wallet: string, tabId: string) {
  const t0 = await ownedTab(wallet, tabId);
  await withTx(async (tx) => {
    const t = await lockTab(tx, tabId);
    if (t.status === "closed") return;
    await tx.query(`UPDATE tabs SET status = 'revoked', revoked_at = COALESCE(revoked_at, now()) WHERE id = $1`, [tabId]);
  });
  return { status: "revoked", reclaimTransaction: await reclaimTx(t0, wallet).catch(() => null) };
}

/** Marks a tab closed once its token account is gone on chain (after the reclaim tx). */
export async function closeTab(wallet: string, tabId: string) {
  const t = await ownedTab(wallet, tabId);
  const acct = await chain().getTokenAccount(t.token_account).catch((e) => {
    console.error("activate: chain read failed", tabId, e instanceof Error ? e.message : e);
    throw new TabError("CHAIN_UNAVAILABLE");
  });
  if (acct) {
    // Still open: revoke first (if needed) and hand back the reclaim tx.
    if (t.status !== "revoked") await revokeTab(wallet, tabId);
    return { status: "revoked", reclaimTransaction: await reclaimTx(t, wallet) };
  }
  await reconcile(tabId).catch(() => {});
  await db().query(`UPDATE tabs SET status = 'closed', closed_at = COALESCE(closed_at, now()) WHERE id = $1`, [tabId]);
  return { status: "closed", reclaimTransaction: null };
}
