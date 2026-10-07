// Wallet Standard discovery (Phantom, Solflare, Backpack, ...). No window.solana: multi-extension
// setups hijack it. Sign-in is a message signature only; transactions are only the ones the user
// opens or closes a tab with.
import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import bs58 from "bs58";

export type Net = "devnet" | "mainnet";
const CHAIN: Record<Net, `solana:${string}`> = { devnet: "solana:devnet", mainnet: "solana:mainnet" };

export type SolWallet = { wallet: Wallet; name: string; icon: string };

const isSolana = (w: Wallet) =>
  w.chains.some((c) => c.startsWith("solana:")) &&
  "standard:connect" in w.features &&
  ("solana:signAndSendTransaction" in w.features || "solana:signTransaction" in w.features);

export function listWallets(onChange: (ws: SolWallet[]) => void): () => void {
  const { get, on } = getWallets();
  const emit = () => onChange(get().filter(isSolana).map((w) => ({ wallet: w, name: w.name, icon: w.icon })));
  emit();
  const a = on("register", emit);
  const b = on("unregister", emit);
  return () => { a(); b(); };
}

const pickAccount = (accounts: readonly WalletAccount[]) =>
  accounts.find((a) => a.chains.some((c) => c.startsWith("solana:"))) ?? accounts[0];

// The wallet's own namespaced provider, used only as a fallback when Wallet Standard connect fails.
// Never the shared window.solana, which other extensions hijack.
function nativeProvider(name: string): { connect: () => Promise<unknown> } | null {
  const g = window as any;
  const n = name.toLowerCase();
  if (n.includes("phantom")) return g.phantom?.solana ?? null;
  if (n.includes("solflare")) return g.solflare ?? null;
  if (n.includes("backpack")) return g.backpack?.solana ?? g.backpack ?? null;
  return null;
}

/** Reconnects a wallet the user already approved for this site, with no popup. Null if it would need one. */
export async function connectSilently(w: Wallet): Promise<WalletAccount | null> {
  const already = pickAccount(w.accounts);
  if (already) return already;
  const f = w.features["standard:connect"] as any;
  try { const { accounts } = await f.connect({ silent: true }); return pickAccount(accounts) ?? null; }
  catch { return null; }
}

export async function connect(w: Wallet): Promise<WalletAccount> {
  const f = w.features["standard:connect"] as any;
  try {
    const { accounts } = await f.connect();
    const acct = pickAccount(accounts) ?? pickAccount(w.accounts);
    if (acct) return acct;
  } catch (e) {
    console.warn(`[tab] ${w.name} standard:connect failed`, e);
    if (isRejection(e)) throw e;
    // Some wallets connect but still throw ("Unexpected error"); others need their native provider.
    const already = pickAccount(w.accounts);
    if (already) return already;
    const native = nativeProvider(w.name);
    if (!native) throw new Error(`${w.name} couldn't connect. Unlock it, then try again. If you have several wallet extensions, try one of the others.`);
    try {
      await native.connect();
      // Give the Wallet Standard adapter a moment to see the account the native connect just authorised.
      for (let i = 0; i < 10; i++) {
        const acct = pickAccount(w.accounts);
        if (acct) return acct;
        const retry = await f.connect().catch(() => null);
        if (retry?.accounts?.length) return pickAccount(retry.accounts)!;
        await new Promise((r) => setTimeout(r, 200));
      }
    } catch (e2) {
      console.warn(`[tab] ${w.name} native connect failed`, e2);
      if (isRejection(e2)) throw e2;
    }
    throw new Error(`${w.name} couldn't connect. Unlock it, then try again. If you have several wallet extensions, try one of the others.`);
  }
  throw new Error(`${w.name} didn't share an account. Open the wallet, pick an account, then try again.`);
}

function isRejection(e: unknown) {
  const err = e as any;
  return err?.code === 4001 || /reject|denied|cancel/i.test(String(err?.message ?? ""));
}

export async function disconnect(w: Wallet) {
  const f = w.features["standard:disconnect"] as any;
  await f?.disconnect?.().catch(() => {});
}

/** Signs the SIWS message. Prefers solana:signIn, falls back to signMessage with the same text. */
export async function signIn(w: Wallet, account: WalletAccount, input: any, messageText: string) {
  if ("solana:signMessage" in w.features) {
    const f = w.features["solana:signMessage"] as any;
    const [out] = await f.signMessage({ account, message: new TextEncoder().encode(messageText) });
    return { address: account.address, message: messageText, signature: bs58.encode(out.signature) };
  }
  if ("solana:signIn" in w.features) {
    const f = w.features["solana:signIn"] as any;
    const [out] = await f.signIn({ ...input, address: account.address });
    return {
      address: out.account.address,
      message: new TextDecoder().decode(out.signedMessage),
      signature: bs58.encode(out.signature),
    };
  }
  throw new Error("This wallet can't sign messages.");
}

/** Signs and sends a base64 tx built by the API. Returns the signature (base58). */
export async function signAndSend(w: Wallet, account: WalletAccount, txBase64: string, net: Net, rpcUrl: string): Promise<string> {
  const tx = Uint8Array.from(atob(txBase64), (c) => c.charCodeAt(0));
  const chain = CHAIN[net];
  if ("solana:signAndSendTransaction" in w.features) {
    const f = w.features["solana:signAndSendTransaction"] as any;
    const [out] = await f.signAndSendTransaction({ account, transaction: tx, chain, options: { commitment: "confirmed" } });
    return bs58.encode(out.signature);
  }
  const f = w.features["solana:signTransaction"] as any;
  const [out] = await f.signTransaction({ account, transaction: tx, chain });
  const raw = btoa(String.fromCharCode(...out.signedTransaction));
  const res = await fetch(rpcUrl, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sendTransaction", params: [raw, { encoding: "base64", preflightCommitment: "confirmed" }] }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message ?? "The network rejected the transaction.");
  return j.result;
}

/** Polls until the tx is confirmed or ~60s pass. */
export async function waitForConfirmation(rpcUrl: string, signature: string) {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(rpcUrl, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSignatureStatuses", params: [[signature], { searchTransactionHistory: false }] }),
      signal: AbortSignal.timeout(10_000),
    }).then((r) => r.json()).catch(() => null);
    const st = res?.result?.value?.[0];
    if (st?.err) throw new Error("The transaction failed on chain.");
    if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Still waiting for the network. Check your wallet's activity, then refresh.");
}

/** SIWS text, identical to the server's siwsMessage(). */
export function siwsText(address: string, i: any) {
  const f = [`URI: ${i.uri}`, `Version: ${i.version}`, `Chain ID: ${i.chainId}`, `Nonce: ${i.nonce}`, `Issued At: ${i.issuedAt}`, `Expiration Time: ${i.expirationTime}`];
  return `${i.domain} wants you to sign in with your Solana account:\n${address}\n\n${i.statement}\n\n${f.join("\n")}`;
}
