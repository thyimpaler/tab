import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PublicKey, VersionedTransaction, ComputeBudgetProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { DELEGATE, FACILITATOR, FakeChain, MERCHANT, MINT, OTHER_MINT, paymentRequired, setTestEnv } from "./helpers.ts";

setTestEnv();
const { db, closeDb } = await import("../src/server/db.ts");
const { migrate } = await import("../src/server/migrate.ts");
const { setChain } = await import("../src/server/chain.ts");
const { hashCredential, newCredential } = await import("../src/server/credential.ts");
const { pay, hooks } = await import("../src/server/pay.ts");
const { reconcile, confirmPayment } = await import("../src/server/settle.ts");
const { MEMO_PROGRAM } = await import("../src/server/x402.ts");

const chain = new FakeChain();
setChain(chain);
const TOKEN_ACCOUNT = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

beforeAll(async () => { await migrate(db(), () => {}); });
afterAll(async () => { await closeDb(); });
beforeEach(() => {
  chain.height = 100n; chain.lastValid = 250n; chain.landed.clear(); chain.rpcDown = false;
  hooks.afterReserve = undefined;
  hooks.afterLock = undefined;
});

let n = 0;
async function makeTab(o: Partial<{ limit: bigint; cap: bigint | null; status: string; expiresAt: Date; allow: string[]; mint: string }> = {}) {
  const u = await db().query(`INSERT INTO users (wallet_address) VALUES ($1) RETURNING id`, [`wallet-${Date.now()}-${n++}`]);
  const t = await db().query(
    `INSERT INTO tabs (owner_id, mint, token_account, delegate_pubkey, limit_amount, per_payment_cap, expires_at, status,
                       credential_hash, network, token_program, decimals)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'placeholder-'||gen_random_uuid(),'devnet',$9,6) RETURNING id`,
    [u.rows[0].id, o.mint ?? MINT, TOKEN_ACCOUNT, DELEGATE.publicKey.toBase58(), (o.limit ?? 50_000n).toString(),
      o.cap === undefined ? null : o.cap?.toString() ?? null, o.expiresAt ?? new Date(Date.now() + 3_600_000),
      o.status ?? "active", TOKEN_PROGRAM_ID.toBase58()],
  );
  const id = t.rows[0].id as string;
  const credential = newCredential(id);
  await db().query(`UPDATE tabs SET credential_hash = $2 WHERE id = $1`, [id, hashCredential(credential)]);
  for (const a of o.allow ?? []) await db().query(`INSERT INTO allowed_recipients VALUES ($1,$2)`, [id, a]);
  return { id, credential };
}

const tabRow = async (id: string) => (await db().query(`SELECT * FROM tabs WHERE id = $1`, [id])).rows[0];
const signedCount = async (id: string) =>
  Number((await db().query(`SELECT count(*) FROM payments WHERE tab_id = $1 AND delegate_signature IS NOT NULL`, [id])).rows[0].count);
const key = () => `idem-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const codeOf = async (p: Promise<unknown>) => p.then(() => "OK", (e) => e.code ?? String(e));

describe("concurrent admission", () => {
  it("50 parallel payments against room for 5: exactly 5 succeed", async () => {
    const { id, credential } = await makeTab({ limit: 50_000n }); // 5 x 10_000
    // Hold each reserve tx open after its read so the requests truly overlap.
    hooks.afterLock = () => new Promise((r) => setTimeout(r, 30));
    const results = await Promise.all(
      Array.from({ length: 50 }, () => codeOf(pay({ credential, idempotencyKey: key(), paymentRequired: paymentRequired() }))),
    );
    expect(results.filter((r) => r === "OK")).toHaveLength(5);
    expect(results.filter((r) => r === "INSUFFICIENT_TAB_BALANCE")).toHaveLength(45);
    const t = await tabRow(id);
    expect(t.reserved_amount).toBe(50_000n);
    expect(t.spent_amount + t.reserved_amount <= t.limit_amount).toBe(true);
    expect(await signedCount(id)).toBe(5);
  });
});

describe("idempotency / replay", () => {
  it("same key twice pays once and returns the same signed payment", async () => {
    const { id, credential } = await makeTab();
    const k = key();
    const a = await pay({ credential, idempotencyKey: k, paymentRequired: paymentRequired() });
    const b = await pay({ credential, idempotencyKey: k, paymentRequired: paymentRequired() });
    expect(b.replayed).toBe(true);
    expect(b.paymentId).toBe(a.paymentId);
    expect(b.paymentSignature).toBe(a.paymentSignature);
    expect((await tabRow(id)).reserved_amount).toBe(10_000n);
    expect(await signedCount(id)).toBe(1);
  });

  it("same key, concurrent: still one payment", async () => {
    const { id, credential } = await makeTab();
    const k = key();
    const rs = await Promise.allSettled(Array.from({ length: 10 }, () => pay({ credential, idempotencyKey: k, paymentRequired: paymentRequired() })));
    const ok = rs.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<any>).value);
    expect(new Set(ok.map((o) => o.paymentId)).size).toBe(1);
    expect((await tabRow(id)).reserved_amount).toBe(10_000n);
    expect(await signedCount(id)).toBe(1);
  });

  it("same key with a different request is DUPLICATE_REQUEST", async () => {
    const { credential } = await makeTab();
    const k = key();
    await pay({ credential, idempotencyKey: k, paymentRequired: paymentRequired() });
    expect(await codeOf(pay({ credential, idempotencyKey: k, paymentRequired: paymentRequired({ amount: "20000" }) }))).toBe("DUPLICATE_REQUEST");
  });
});

describe("rejections sign nothing", () => {
  const cases: [string, Parameters<typeof makeTab>[0], ReturnType<typeof paymentRequired>, string][] = [
    ["expired", { expiresAt: new Date(Date.now() - 1000) }, paymentRequired(), "TAB_EXPIRED"],
    ["revoked", { status: "revoked" }, paymentRequired(), "TAB_REVOKED"],
    ["closed", { status: "closed" }, paymentRequired(), "TAB_CLOSED"],
    ["over per-payment cap", { cap: 5_000n }, paymentRequired(), "PAYMENT_EXCEEDS_TAB_LIMIT"],
    ["recipient not on allowlist", { allow: [FACILITATOR] }, paymentRequired(), "RECIPIENT_NOT_ALLOWED"],
    ["bad mint in requirement", {}, paymentRequired({ asset: OTHER_MINT }), "UNSUPPORTED_MINT"],
    ["tab mint not accepted", { mint: OTHER_MINT }, paymentRequired({ asset: OTHER_MINT }), "UNSUPPORTED_MINT"],
    ["wrong network", {}, paymentRequired({ network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" }), "UNSUPPORTED_PAYMENT_REQUIREMENT"],
    ["wrong scheme", {}, paymentRequired({ scheme: "upto" }), "UNSUPPORTED_PAYMENT_REQUIREMENT"],
    ["over balance", { limit: 5_000n }, paymentRequired(), "INSUFFICIENT_TAB_BALANCE"],
  ];
  for (const [name, tabOpts, pr, code] of cases) {
    it(`${name} -> ${code}`, async () => {
      const { id, credential } = await makeTab(tabOpts);
      expect(await codeOf(pay({ credential, idempotencyKey: key(), paymentRequired: pr }))).toBe(code);
      expect(await signedCount(id)).toBe(0);
      expect((await tabRow(id)).reserved_amount).toBe(0n);
    });
  }

  it("expired tab is marked expired", async () => {
    const { id, credential } = await makeTab({ expiresAt: new Date(Date.now() - 1000) });
    await codeOf(pay({ credential, idempotencyKey: key(), paymentRequired: paymentRequired() }));
    expect((await tabRow(id)).status).toBe("expired");
  });

  it("allowlisted recipient passes", async () => {
    const { credential } = await makeTab({ allow: [MERCHANT] });
    expect(await codeOf(pay({ credential, idempotencyKey: key(), paymentRequired: paymentRequired() }))).toBe("OK");
  });

  it("bad / wrong credentials -> INVALID_CREDENTIAL", async () => {
    const { id } = await makeTab();
    expect(await codeOf(pay({ credential: "nope", idempotencyKey: key(), paymentRequired: paymentRequired() }))).toBe("INVALID_CREDENTIAL");
    const forged = newCredential(id); // right tab id, wrong secret
    expect(await codeOf(pay({ credential: forged, idempotencyKey: key(), paymentRequired: paymentRequired() }))).toBe("INVALID_CREDENTIAL");
  });

  it("check order: revoked beats over-cap and bad recipient", async () => {
    const { credential } = await makeTab({ status: "revoked", cap: 1n, allow: [FACILITATOR] });
    expect(await codeOf(pay({ credential, idempotencyKey: key(), paymentRequired: paymentRequired() }))).toBe("TAB_REVOKED");
  });

  it("check order: cap beats allowlist beats balance", async () => {
    const a = await makeTab({ cap: 1n, allow: [FACILITATOR], limit: 1n });
    expect(await codeOf(pay({ credential: a.credential, idempotencyKey: key(), paymentRequired: paymentRequired() }))).toBe("PAYMENT_EXCEEDS_TAB_LIMIT");
    const b = await makeTab({ allow: [FACILITATOR], limit: 1n });
    expect(await codeOf(pay({ credential: b.credential, idempotencyKey: key(), paymentRequired: paymentRequired() }))).toBe("RECIPIENT_NOT_ALLOWED");
  });
});

describe("x402 payload", () => {
  it("builds the exact SVM tx: delegate is authority, facilitator pays fees, owner account is source", async () => {
    const { credential } = await makeTab();
    const out = await pay({ credential, idempotencyKey: key(), paymentRequired: paymentRequired() });
    const payload = JSON.parse(Buffer.from(out.paymentSignature, "base64").toString());
    expect(payload.x402Version).toBe(2);
    expect(payload.accepted.payTo).toBe(MERCHANT);
    const tx = VersionedTransaction.deserialize(Buffer.from(payload.payload.transaction, "base64"));
    const keys = tx.message.staticAccountKeys;
    expect(keys[0].toBase58()).toBe(FACILITATOR);                        // fee payer
    const ixs = tx.message.compiledInstructions;
    const prog = (i: number) => keys[ixs[i].programIdIndex];
    expect(ixs).toHaveLength(4);
    expect(prog(0).equals(ComputeBudgetProgram.programId)).toBe(true);
    expect(prog(1).equals(ComputeBudgetProgram.programId)).toBe(true);
    expect(prog(2).equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(prog(3).equals(MEMO_PROGRAM)).toBe(true);
    const acc = ixs[2].accountKeyIndexes.map((i) => keys[i].toBase58());
    const dest = getAssociatedTokenAddressSync(new PublicKey(MINT), new PublicKey(MERCHANT), true, TOKEN_PROGRAM_ID).toBase58();
    expect(acc).toEqual([TOKEN_ACCOUNT, MINT, dest, DELEGATE.publicKey.toBase58()]);
    expect(ixs[2].data[0]).toBe(12);                                      // TransferChecked
    expect(Buffer.from(ixs[2].data.slice(1, 9)).readBigUInt64LE()).toBe(10_000n);
    // Fee payer slot empty, delegate signature valid.
    expect(tx.signatures[0].every((b) => b === 0)).toBe(true);
    const di = keys.findIndex((k) => k.equals(DELEGATE.publicKey));
    expect(nacl.sign.detached.verify(tx.message.serialize(), tx.signatures[di], DELEGATE.publicKey.toBytes())).toBe(true);
  });
});

describe("crash injection between reserve and settle", () => {
  it("crash after reserve, before sign: released after grace, never signed", async () => {
    const { id, credential } = await makeTab();
    hooks.afterReserve = async () => { throw new Error("SIGKILL"); };
    await codeOf(pay({ credential, idempotencyKey: key(), paymentRequired: paymentRequired() }));
    expect((await tabRow(id)).reserved_amount).toBe(10_000n);
    await reconcile(id);
    expect((await tabRow(id)).reserved_amount).toBe(10_000n);         // still inside grace window
    await db().query(`UPDATE payments SET updated_at = now() - interval '5 minutes' WHERE tab_id = $1`, [id]);
    await reconcile(id);
    const t = await tabRow(id);
    expect(t.reserved_amount).toBe(0n);
    expect(t.spent_amount).toBe(0n);
    expect(await signedCount(id)).toBe(0);
  });

  it("crash after sign: stays reserved until blockhash expiry, then settles if it landed", async () => {
    const { id, credential } = await makeTab();
    await pay({ credential, idempotencyKey: key(), paymentRequired: paymentRequired() });
    const p = (await db().query(`SELECT * FROM payments WHERE tab_id = $1`, [id])).rows[0];
    chain.land(p.delegate_signature, true);
    await reconcile(id);                                               // before expiry: untouched
    expect((await db().query(`SELECT state FROM payments WHERE id = $1`, [p.id])).rows[0].state).toBe("DISPATCHING");
    chain.height = 1_000n;
    await reconcile(id);
    const t = await tabRow(id);
    expect(t.spent_amount).toBe(10_000n);
    expect(t.reserved_amount).toBe(0n);
    expect((await db().query(`SELECT state FROM payments WHERE id = $1`, [p.id])).rows[0].state).toBe("SETTLED");
  });

  it("crash after sign: released after expiry if it never landed", async () => {
    const { id, credential } = await makeTab();
    await pay({ credential, idempotencyKey: key(), paymentRequired: paymentRequired() });
    chain.height = 1_000n;
    await reconcile(id);
    const t = await tabRow(id);
    expect(t.spent_amount).toBe(0n);
    expect(t.reserved_amount).toBe(0n);
  });

  it("RPC down: stays reserved (AMBIGUOUS), resolves later, never double counted", async () => {
    const { id, credential } = await makeTab();
    await pay({ credential, idempotencyKey: key(), paymentRequired: paymentRequired() });
    const p = (await db().query(`SELECT * FROM payments WHERE tab_id = $1`, [id])).rows[0];
    chain.rpcDown = true;
    await reconcile(id);
    expect((await db().query(`SELECT state FROM payments WHERE id = $1`, [p.id])).rows[0].state).toBe("AMBIGUOUS");
    expect((await tabRow(id)).reserved_amount).toBe(10_000n);
    chain.rpcDown = false; chain.height = 1_000n; chain.land(p.delegate_signature, true);
    await Promise.all([reconcile(id), reconcile(id), reconcile(id)]);   // concurrent recoveries
    const t = await tabRow(id);
    expect(t.spent_amount).toBe(10_000n);
    expect(t.reserved_amount).toBe(0n);
  });

  it("confirm with the merchant's tx id settles immediately; a foreign tx id does not", async () => {
    const { id, credential } = await makeTab();
    const out = await pay({ credential, idempotencyKey: key(), paymentRequired: paymentRequired() });
    const foreign = chain.land("someone-elses-sig", true);
    expect((await confirmPayment(id, out.paymentId, foreign)).state).toBe("DISPATCHING");
    const p = (await db().query(`SELECT * FROM payments WHERE id = $1`, [out.paymentId])).rows[0];
    const real = chain.land(p.delegate_signature, true);
    expect((await confirmPayment(id, out.paymentId, real)).state).toBe("SETTLED");
    expect((await confirmPayment(id, out.paymentId, real)).state).toBe("SETTLED");  // idempotent
    expect((await tabRow(id)).spent_amount).toBe(10_000n);
  });

  it("fully spent tab becomes empty", async () => {
    const { id, credential } = await makeTab({ limit: 10_000n });
    const out = await pay({ credential, idempotencyKey: key(), paymentRequired: paymentRequired() });
    const p = (await db().query(`SELECT * FROM payments WHERE id = $1`, [out.paymentId])).rows[0];
    await confirmPayment(id, out.paymentId, chain.land(p.delegate_signature, true));
    expect((await tabRow(id)).status).toBe("empty");
    expect(await codeOf(pay({ credential, idempotencyKey: key(), paymentRequired: paymentRequired() }))).toBe("INSUFFICIENT_TAB_BALANCE");
  });
});

void bs58;
