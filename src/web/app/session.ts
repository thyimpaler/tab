import { useCallback, useEffect, useRef, useState } from "react";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { api, type PublicConfig } from "../lib/api";
import { connect, connectSilently, listWallets, signAndSend, signIn, siwsText, waitForConfirmation, type SolWallet } from "../lib/wallet";

export type Session = ReturnType<typeof useSession>;

export function useSession() {
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [wallets, setWallets] = useState<SolWallet[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [me, setMe] = useState<string | null | undefined>(undefined); // undefined = loading
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => listWallets(setWallets), []);
  useEffect(() => {
    api<PublicConfig>("/v1/config").then(setCfg).catch((e) => setError(e.message));
    api<{ wallet: string }>("/v1/me").then((r) => setMe(r.wallet)).catch(() => setMe(null));
  }, []);

  // Signed in already? Quietly reattach the wallet used last time (no popup), so the user isn't asked
  // to connect again just to sign. Only if it is the same address the session belongs to.
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current || !me || account || !wallets.length) return;
    let name: string | null = null;
    try { name = localStorage.getItem("tab.wallet"); } catch {}
    const w = wallets.find((x) => x.name === name) ?? null;
    if (!w) return;
    tried.current = true;
    connectSilently(w.wallet).then((acct) => { if (acct && acct.address === me) { setWallet(w.wallet); setAccount(acct); } });
  }, [me, account, wallets]);

  const connectWallet = useCallback(async (w: Wallet) => {
    setError(null); setBusy("connect");
    try {
      const acct = await connect(w);
      setWallet(w); setAccount(acct);
      try { localStorage.setItem("tab.wallet", w.name); } catch {}
      return acct;
    } catch (e) {
      setError(walletMessage(e));
      return null;
    } finally { setBusy(null); }
  }, []);

  const doSignIn = useCallback(async () => {
    if (!wallet || !account) return;
    setError(null); setBusy("signin");
    try {
      const { input } = await api<{ input: any }>("/v1/auth/nonce", {});
      const signed = await signIn(wallet, account, input, siwsText(account.address, input));
      const r = await api<{ wallet: string }>("/v1/auth/verify", signed);
      setMe(r.wallet);
    } catch (e) { setError(walletMessage(e)); } finally { setBusy(null); }
  }, [wallet, account]);

  const signOut = useCallback(async () => {
    await api("/v1/auth/logout", {}).catch(() => {});
    setMe(null);
  }, []);

  /** Signs + sends a tx built by the API with the connected wallet, then waits for confirmation. */
  const sendTx = useCallback(async (b64: string) => {
    if (!wallet || !account || !cfg) throw new Error("Connect your wallet first.");
    if (me && account.address !== me) throw new Error("The connected wallet isn't the one you signed in with. Switch accounts in your wallet.");
    const sig = await signAndSend(wallet, account, b64, cfg.network, cfg.rpcUrl);
    await waitForConfirmation(cfg.rpcUrl, sig);
    return sig;
  }, [wallet, account, cfg, me]);

  return { cfg, wallets, wallet, account, me, busy, error, setError, setBusy, connectWallet, doSignIn, signOut, sendTx };
}

export function walletMessage(e: unknown): string {
  const err = e as any;
  const msg = String(err?.message ?? err ?? "");
  if (err?.code === 4001 || /reject|denied|cancel/i.test(msg)) return "You cancelled in your wallet. Nothing was signed.";
  if (/-32002|already pending/i.test(msg)) return "Your wallet already has a request open. Check the wallet popup (it may be behind this window).";
  if (/insufficient|0x1\b/i.test(msg)) return "Your wallet doesn't have enough SOL for the network fee, or not enough USDC.";
  return msg && msg.length < 200 ? msg : "The wallet returned an error. Try again.";
}
