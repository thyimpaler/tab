import { useEffect, useState } from "react";
import { TopBar } from "../components/Chrome";
import { short } from "../lib/format";
import { useSession, type Session } from "./session";
import { TabsHome } from "./TabsHome";
import { TabDetail } from "./TabDetail";

function useRoute() {
  const [p, setP] = useState(location.pathname);
  useEffect(() => { const on = () => setP(location.pathname); addEventListener("popstate", on); return () => removeEventListener("popstate", on); }, []);
  const m = /^\/app\/tab\/([0-9a-f-]{36})/.exec(p);
  return m ? { tabId: m[1] } : { tabId: null };
}

export function Dashboard() {
  const s = useSession();
  const { tabId } = useRoute();
  // Credentials live in memory only, for the test agent right after creation.
  const [keys, setKeys] = useState<Record<string, string>>({});

  const right = s.me
    ? <span className="who"><span className="label">{s.cfg?.network ?? ""}</span><span className="mono" style={{ fontSize: 12 }}>{short(s.me)}</span><button type="button" className="linkish" onClick={s.signOut}>Sign out</button></span>
    : <span className="label">{s.cfg?.network ?? ""}</span>;

  return (
    <div className="dash">
      <TopBar current="app" right={right} />
      <main className="wrap" style={{ paddingBottom: 120 }}>
        {s.me === undefined ? <p className="label" style={{ paddingBlock: 80 }}>Loading…</p>
          : !s.me ? <Gate s={s} />
          : tabId ? <TabDetail s={s} tabId={tabId} credential={keys[tabId]} rememberKey={(k) => setKeys((o) => ({ ...o, [tabId]: k }))} />
          : <TabsHome s={s} onKey={(id, k) => setKeys((o) => ({ ...o, [id]: k }))} />}
      </main>
    </div>
  );
}

function Gate({ s }: { s: Session }) {
  const connected = !!s.account;
  return (
    <section className="gate">
      <div>
        <div className="label">Dashboard</div>
        <h1 className="d2" style={{ marginTop: 18 }}>{connected ? "Sign in" : "Connect a wallet"}</h1>
        <p className="lede muted" style={{ marginTop: 24 }}>
          {connected
            ? "Sign a message to prove the wallet is yours. It's not a transaction and costs nothing."
            : "Your wallet funds and owns every tab you open. TAB only ever asks for a capped permission to spend."}
        </p>
      </div>
      <div className="gate-box">
        {!connected ? (
          s.wallets.length ? (
            <ul className="wallets">
              {s.wallets.map((w) => (
                <li key={w.name}>
                  <button type="button" onClick={() => s.connectWallet(w.wallet)} disabled={!!s.busy}>
                    <img src={w.icon} alt="" width={28} height={28} />
                    <span>{w.name}</span>
                    <span className="label">{s.busy === "connect" ? "check your wallet" : "connect"}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="notice">
              <strong>No Solana wallet found in this browser.</strong>
              <p style={{ margin: "8px 0 0" }}>Install <a href="https://phantom.com" target="_blank" rel="noreferrer">Phantom</a>, <a href="https://solflare.com" target="_blank" rel="noreferrer">Solflare</a> or <a href="https://backpack.app" target="_blank" rel="noreferrer">Backpack</a>, then reload this page.</p>
            </div>
          )
        ) : (
          <div className="grid-gap">
            <div className="row-between"><span className="label">Connected</span><span className="mono">{short(s.account!.address, 6)}</span></div>
            <button type="button" className="btn primary" onClick={s.doSignIn} disabled={!!s.busy}>
              {s.busy === "signin" ? <><span className="spinner" /> Check your wallet</> : "Sign message to sign in"}
            </button>
          </div>
        )}
        {s.error && <p className="err-line" role="alert">{s.error}</p>}
      </div>
    </section>
  );
}
