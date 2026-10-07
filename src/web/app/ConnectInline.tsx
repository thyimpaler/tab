import type { Session } from "./session";

/** Inline wallet picker for when a session exists but no wallet is connected in this page load. */
export function ConnectInline({ s, why }: { s: Session; why: string }) {
  if (s.account) return null;
  return (
    <div className="notice">
      <strong>{why}</strong>
      <div className="row-wrap" style={{ marginTop: 12 }}>
        {s.wallets.length ? s.wallets.map((w) => (
          <button key={w.name} type="button" className="btn small" onClick={() => s.connectWallet(w.wallet)} disabled={!!s.busy}>
            <img src={w.icon} alt="" width={18} height={18} /> {w.name}
          </button>
        )) : <span className="muted">No Solana wallet found in this browser.</span>}
      </div>
      {s.error && <p className="err-line" role="alert">{s.error}</p>}
    </div>
  );
}
