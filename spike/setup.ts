// Spike setup: keypairs, SOL, two mints (Token + Token-2022 no extensions),
// owner ATA + a non-ATA dedicated account per mint, merchant ATA, approve delegate.
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, createMint, createAccount,
  getOrCreateAssociatedTokenAccount, mintTo, approve,
} from "@solana/spl-token";
import { conn, loadOrCreate, saveState, DECIMALS, type State } from "./common.ts";

const owner = loadOrCreate("owner");
const delegate = loadOrCreate("delegate");
const merchant = loadOrCreate("merchant");
console.log("owner   ", owner.publicKey.toBase58());
console.log("delegate", delegate.publicKey.toBase58());
console.log("merchant", merchant.publicKey.toBase58());

const bal = await conn.getBalance(owner.publicKey);
console.log("owner SOL", bal / LAMPORTS_PER_SOL);
if (bal < 0.2 * LAMPORTS_PER_SOL) {
  try {
    const sig = await conn.requestAirdrop(owner.publicKey, 1 * LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, "confirmed");
    console.log("airdropped 1 SOL");
  } catch (e) {
    console.error("AIRDROP_FAILED", (e as Error).message);
    console.error(`Fund ${owner.publicKey.toBase58()} on devnet via https://faucet.solana.com then rerun.`);
    process.exit(2);
  }
}

const TEN = 10n * 10n ** BigInt(DECIMALS);

async function setupMint(program: PublicKey) {
  const mint = await createMint(conn, owner, owner.publicKey, null, DECIMALS, Keypair.generate(), undefined, program);
  const ownerAta = await getOrCreateAssociatedTokenAccount(conn, owner, mint, owner.publicKey, false, "confirmed", undefined, program);
  // Non-ATA token account owned by owner: models a dedicated per-TAB account.
  const dedicated = await createAccount(conn, owner, mint, owner.publicKey, Keypair.generate(), undefined, program);
  const merchantAta = await getOrCreateAssociatedTokenAccount(conn, owner, mint, merchant.publicKey, false, "confirmed", undefined, program);
  await mintTo(conn, owner, mint, ownerAta.address, owner, TEN, [], undefined, program);
  await mintTo(conn, owner, mint, dedicated, owner, TEN, [], undefined, program);
  await approve(conn, owner, ownerAta.address, delegate.publicKey, owner, TEN, [], undefined, program);
  await approve(conn, owner, dedicated, delegate.publicKey, owner, TEN, [], undefined, program);
  return {
    mint: mint.toBase58(), program: program.toBase58(), ownerAta: ownerAta.address.toBase58(),
    dedicated: dedicated.toBase58(), merchantAta: merchantAta.address.toBase58(),
  };
}

const state: State = {
  owner: owner.publicKey.toBase58(), delegate: delegate.publicKey.toBase58(), merchant: merchant.publicKey.toBase58(),
  mints: { token: await setupMint(TOKEN_PROGRAM_ID), token2022: await setupMint(TOKEN_2022_PROGRAM_ID) },
};
saveState(state);
console.log(JSON.stringify(state.mints, null, 2));
console.log("setup done");
