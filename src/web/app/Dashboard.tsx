import { useCallback, useEffect, useState } from "react";
import { TopBar } from "../components/Chrome";
import { Ring } from "../components/Ring";
import { api, type TabView } from "../lib/api";
import { fromUnits, short, until } from "../lib/format";
import { useSession, type Session } from "./session";
import { Composer } from "./Composer";
import { TabDetail } from "./TabDetail";

function useRoute() {
  const [p, setP] = useState(location.pathname);
  useEffect(() => { const on = () => setP(location.pathname); addEventListener("popstate", on); return () => removeEventListener("popstate", on); }, []);
  const m = /^\/app\/tab\/([0-9a-f-]{36})/.exec(p);
  return m ? m[1] : null;
}

const frac = (t: TabView, x: string) => { const lim = BigInt(t.limit); return lim > 0n ? Number((BigInt(x) * 10000n) / lim) / 10000 : 0; };

export function Dashboard() {
  const s = useSession();
  const tabId = useRoute();
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [tabs, setTabs] = useState<TabView[] | null>(null);

  const load = useCallback(() => { if (s.me) api<{ tabs: TabView[] }>("/v1/tabs").then((r) => setTabs(r.tabs)).catch(() => setTabs([])); }, [s.me]);
  useEffect(() => { load(); }, [load, tabId]);

  const right = s.me
    ? <span className="who"><span className="mark-net">{s.cfg?.network ?? ""}</span><span className="mono small">{short(s.me)}</span><button type="button" className="linkish" onClick={s.signOut}>Sign out</button></span>
    : <span className="mark-net">{s.cfg?.network ?? ""}</span>;
  const maxUsd = s.cfg?.maxTabLimit ? Number(BigInt(s.cfg.maxTabLimit)) / 1e6 : 1000;

  return (
    <div className="dash">
      <TopBar current="app" right={right} />
      {s.me === undefined ? <p className="label wrap" style={{ paddingBlock: 80 }}>Loading…</p>
        : !s.me ? <main className="wrap"><Gate s={s} /></main>
        : (
          <div className="app">
            <Rail tabs={tabs} current={tabId} />
            <main className="stagearea">
              {tabId
                ? <TabDetail s={s} tabId={tabId} credential={keys[tabId]} rememberKey={(k) => setKeys((o) => ({ ...o, [tabId]: k }))} onChange={load} />
                : <Composer s={s} maxUsd={maxUsd} onCreated={(id, k) => { setKeys((o) => ({ ...o, [id]: k })); load(); }} />}
            </main>
          </div>
        )}
    </div>
  );
}

function Rail({ tabs, current }: { tabs: TabView[] | null; current: string | null }) {
  const open = tabs?.filter((t) => t.status === "active" || t.status === "empty" || t.status === "pending") ?? [];
  const past = tabs?.filter((t) => !open.includes(t)) ?? [];
  const item = (t: TabView) => {
    const ended = t.status === "revoked" || t.status === "closed";
    return (
      <a key={t.id} href={`/app/tab/${t.id}`} data-nav className={`rail-item${current === t.id ? " on" : ""}`}>
        <span className="rail-ring"><Ring spent={frac(t, t.spent)} held={frac(t, t.reserved)} void={ended} /></span>
        <span className="rail-meta">
          <b>{t.label || "Untitled tab"}</b>
          <span className="mono small muted">
            {t.status === "closed" ? `${fromUnits(t.remaining, t.decimals)} returned` : `${fromUnits(t.remaining, t.decimals)} / ${fromUnits(t.limit, t.decimals)}`}
          </span>
        </span>
        <span className={`dot ${t.status}`} title={t.status === "active" ? until(t.expiresAt) : t.status} />
      </a>
    );
  };
  return (
    <aside className="rail" aria-label="Your tabs">
      <a href="/app" data-nav className={`rail-new${current ? "" : " on"}`}><span className="plus" aria-hidden="true" />New tab</a>
      {tabs === null ? <p className="mono small muted rail-empty">Loading tabs…</p> : (
        <>
          {open.length > 0 && <><div className="eyebrow rail-h">Open · {open.length}</div>{open.map(item)}</>}
          {past.length > 0 && <><div className="eyebrow rail-h">Closed</div>{past.map(item)}</>}
          {!tabs.length && <p className="mono small muted rail-empty">No tabs yet. Your first one is on the right.</p>}
        </>
      )}
    </aside>
  );
}

function Gate({ s }: { s: Session }) {
  const connected = !!s.account;
  return (
    <section className="gate">
      <div className="gate-copy">
        <div className="eyebrow">Dashboard</div>
        <h1 className="h1">{connected ? <>Sign in. <span className="mute">No transaction.</span></> : <>Open your <span className="mute">first tab.</span></>}</h1>
        <p className="lede muted">{connected
          ? "Sign a message to prove the wallet is yours. It costs nothing and moves nothing."
          : "Connect the wallet that will fund it. TAB only ever asks for a capped permission to spend."}</p>
        <div className="gate-box">
          {!connected ? (
            s.wallets.length ? (
              <ul className="wallets">
                {s.wallets.map((w) => (
                  <li key={w.name}>
                    <button type="button" onClick={() => s.connectWallet(w.wallet)} disabled={!!s.busy}>
                      <img src={w.icon} alt="" width={32} height={32} />
                      <span>{w.name}</span>
                      <span className="go" aria-hidden="true">›</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="notice"><strong>No Solana wallet found in this browser.</strong>
                <p style={{ margin: "8px 0 0" }}>Install <a href="https://phantom.com" target="_blank" rel="noreferrer">Phantom</a>, <a href="https://solflare.com" target="_blank" rel="noreferrer">Solflare</a> or <a href="https://backpack.app" target="_blank" rel="noreferrer">Backpack</a>, then reload.</p></div>
            )
          ) : (
            <div className="grid-gap">
              <div className="row-between"><span className="eyebrow">Connected</span><span className="mono">{short(s.account!.address, 6)}</span></div>
              <button type="button" className="pill big" onClick={s.doSignIn} disabled={!!s.busy}>
                {s.busy === "signin" ? <>Check your wallet <span className="spinner" /></> : <>Sign message <b aria-hidden="true">›</b></>}
              </button>
            </div>
          )}
          {s.error && <p className="err-line" role="alert">{s.error}</p>}
        </div>
      </div>
      <div className="gate-ring" aria-hidden="true">
        <Ring spent={connected ? 0.62 : 0.18} value={connected ? "3.10" : "5.00"} sub={<>USDC left <em>of 5.00</em></>} />
      </div>
    </section>
  );
}
