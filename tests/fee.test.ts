import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { FakeChain, MINT, setTestEnv } from "./helpers.ts";

setTestEnv();
const TREASURY = Keypair.generate().publicKey.toBase58();
process.env.TAB_FEE = "200000";          // 0.2 USDC
process.env.TREASURY_WALLET = TREASURY;

const { db, closeDb } = await import("../src/server/db.ts");
const { migrate } = await import("../src/server/migrate.ts");
const { setChain } = await import("../src/server/chain.ts");
const { createTab } = await import("../src/server/tabs.ts");

const owner = Keypair.generate().publicKey;
const ownerAta = getAssociatedTokenAddressSync(new PublicKey(MINT), owner, false, TOKEN_PROGRAM_ID).toBase58();

class FeeChain extends FakeChain {
  balance = 0n;
  async getTokenAccount(address: string) {
    if (address !== ownerAta) return null;
    return { address, program: TOKEN_PROGRAM_ID.toBase58(), mint: MINT, owner: owner.toBase58(), amount: this.balance, delegate: null, delegatedAmount: 0n, closeAuthority: null, frozen: false };
  }
}
const chain = new FeeChain();
setChain(chain);

beforeAll(async () => { await migrate(db(), () => {}); });
afterAll(async () => { await closeDb(); });

const body = (limit: string) => ({ limit, expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
const codeOf = async (p: Promise<unknown>) => p.then(() => "OK", (e) => e.code ?? String(e));

describe("tab opening fee", () => {
  it("refuses when the wallet covers the limit but not limit + fee", async () => {
    chain.balance = 1_000_000n + 199_999n;
    expect(await codeOf(createTab(owner.toBase58(), body("1000000")))).toBe("BAD_REQUEST");
  });

  it("puts a 0.2 USDC transfer to the treasury ATA in the same transaction, from the owner", async () => {
    chain.balance = 1_200_000n;
    const out = await createTab(owner.toBase58(), body("1000000"));
    expect(out.fee).toBe("200000");
    const tx = VersionedTransaction.deserialize(Buffer.from(out.transaction, "base64"));
    const keys = tx.message.staticAccountKeys.map((k) => k.toBase58());
    const ixs = tx.message.compiledInstructions;
    const treasuryAta = getAssociatedTokenAddressSync(new PublicKey(MINT), new PublicKey(TREASURY), true, TOKEN_PROGRAM_ID).toBase58();
    const feeIx = ixs.find((ix) => keys[ix.programIdIndex] === TOKEN_PROGRAM_ID.toBase58() && ix.data[0] === 12 && keys[ix.accountKeyIndexes[2]] === treasuryAta);
    expect(feeIx).toBeTruthy();
    expect(Buffer.from(feeIx!.data.slice(1, 9)).readBigUInt64LE()).toBe(200_000n);
    expect(keys[feeIx!.accountKeyIndexes[0]]).toBe(ownerAta);      // from the owner's own USDC
    expect(keys[feeIx!.accountKeyIndexes[3]]).toBe(owner.toBase58()); // signed by the owner
    expect(keys[0]).toBe(owner.toBase58());                          // owner pays the network fee
    const row = (await db().query(`SELECT fee_amount, fee_recipient, limit_amount FROM tabs WHERE id = $1`, [out.tabId])).rows[0];
    expect(row.fee_amount).toBe(200_000n);
    expect(row.fee_recipient).toBe(TREASURY);
    expect(row.limit_amount).toBe(1_000_000n);                       // the fee never counts toward the limit
  });
});
