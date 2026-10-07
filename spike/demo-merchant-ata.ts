// Creates the demo merchant's devnet USDC ATA (x402 requires the destination ATA to exist). Owner pays rent.
import { PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { conn, loadOrCreate, loadState } from "./common.ts";
const USDC_DEVNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const s = loadState();
const ata = await getOrCreateAssociatedTokenAccount(conn, loadOrCreate("owner"), USDC_DEVNET, new PublicKey(s.merchant));
console.log("demo merchant USDC ATA", ata.address.toBase58());
