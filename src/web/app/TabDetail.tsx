import { useCallback, useEffect, useRef, useState } from "react";
import { api, type PaymentView, type TabView } from "../lib/api";
import { explorerAddr, explorerTx, fromUnits, short, until } from "../lib/format";
import { walletMessage, type Session } from "./session";
import { ConnectInline } from "./ConnectInline";
import { KeyReveal } from "./KeyReveal";
import { Console, type LogLine } from "../components/Console";
import { Ring } from "../components/Ring";
import { Tab, TabError } from "../../../packages/sdk/src/index";

type Detail = { tab: TabView; payments: PaymentView[]; allowlist: string[] };

const STATE_LABEL: Record<PaymentView["state"], string> = {
  SETTLED: "paid", DISPATCHING: "in flight", RESERVED: "held", AMBIGUOUS: "checking", RELEASED: "not paid",
};

export function TabDetail({ s, tabId, credential, rememberKey, onChange }: { s: Session; tabId: string; credential?: string; rememberKey: (k: string) => void; onChange: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const load = useCallback(() => api<Detail>(`/v1/tabs/${tabId}`).then(setD).catch((e) => setErr(e.message)), [tabId]);
  useEffect(() => { setD(null); setErr(null); setConfirmRevoke(false); load(); const t = setInterval(load, 15_000); return () => clearInterval(t); }, [load]);

  if (err && !d) return <div className="stage-pad"><p className="err-line">{err}</p><a className="btn" href="/app" data-nav>Back</a></div>;
  if (!d) return <div className="stage-pad"><span className="spinner" /></div>;
  const t = d.tab;
  const dec = t.decimals;
  const net = t.network;
  const open = t.status === "active" || t.status === "empty";

  if (newKey) return <KeyReveal credential={newKey} title="New agent key." doneLabel="Back to the tab" onDone={() => setNewKey(null)} />;

  const refresh = async () => { await load(); onChange(); };
  async function activate() {
    setBusy("activate"); setErr(null);
    try { const r = await api<{ credential: string }>(`/v1/tabs/${tabId}/activate`, {}); rememberKey(r.credential); setNewKey(r.credential); refresh(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  async function rotate() {
    setBusy("rotate"); setErr(null);
    try { const r = await api<{ credential: string }>(`/v1/tabs/${tabId}/rotate`, {}); rememberKey(r.credential); setNewKey(r.credential); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  async function revokeAndReclaim() {
    setBusy("revoke"); setErr(null); setConfirmRevoke(false);
    try {
      const r = await api<{ reclaimTransaction: string | null }>(`/v1/tabs/${tabId}/revoke`, {});
      await refresh();
      if (r.reclaimTransaction && s.account) await reclaimWith(r.reclaimTransaction);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  async function reclaim() {
    setBusy("reclaim"); setErr(null);
    try {
      const r = await api<{ status: string; reclaimTransaction: string | null }>(`/v1/tabs/${tabId}/close`, {});
      if (r.reclaimTransaction) await reclaimWith(r.reclaimTransaction);
      else await refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  async function reclaimWith(tx: string) {
    await s.sendTx(tx).catch((e) => { throw new Error(walletMessage(e)); });
    await api(`/v1/tabs/${tabId}/close`, {});
    await refresh();
  }

  const lim = BigInt(t.limit), spent = BigInt(t.spent), res = BigInt(t.reserved);
  const frac = (x: bigint) => (lim > 0n ? Number((x * 10000n) / lim) / 10000 : 0);
  const chainOk = t.chain ? BigInt(t.chain.delegatedAmount) >= BigInt(t.remaining) && t.chain.delegate === t.delegate : null;
  const ended = t.status === "revoked" || t.status === "closed";
  const leftWord = t.status === "closed" ? "returned" : t.status === "revoked" || t.status === "expired" ? "unspent" : "left";
  const pct = Math.round(frac(spent) * 100);

  return (
    <div className="tabstage">
      <header className="tab-head">
        <div>
          <div className="row-wrap" style={{ alignItems: "center" }}>
            <span className={`chip ${t.status}`}>{t.status === "pending" ? "not funded" : t.status}</span>
            <span className="mono small muted">#{t.id.slice(0, 4).toUpperCase()} · opened {new Date(t.createdAt).toLocaleDateString()}{t.status === "active" ? ` · ${until(t.expiresAt)}` : ""}</span>
          </div>
          <h1 className="h1 tab-title">{t.label || "Untitled tab"}</h1>
        </div>
        {open && (
          <div className="actions">
            <button type="button" className="btn" onClick={rotate} disabled={!!busy}>{busy === "rotate" ? <span className="spinner" /> : null} New agent key</button>
            <button type="button" className="btn danger" onClick={() => setConfirmRevoke((v) => !v)} disabled={!!busy}>Revoke tab</button>
          </div>
        )}
      </header>

      {confirmRevoke && open && (
        <div className="confirm">
          <p>Revoking stops all signing immediately. {s.account ? `Your wallet then asks you to sign once to take back ${fromUnits(t.chain?.amount ?? t.remaining, dec)} USDC and the account rent.` : "Connect your wallet afterwards to take back the funds."}</p>
          <div className="row-wrap">
            <button type="button" className="btn danger" onClick={revokeAndReclaim} disabled={!!busy}>{busy === "revoke" ? <><span className="spinner" /> Revoking…</> : "Revoke now"}</button>
            <button type="button" className="btn" onClick={() => setConfirmRevoke(false)}>Keep it open</button>
          </div>
        </div>
      )}

      {t.status === "pending" && (
        <div className="notice">
          <strong>This tab isn't funded yet.</strong>
          <p style={{ margin: "8px 0 14px" }}>If you approved the transaction, check again. If you didn't, open a new tab instead. Nothing was moved.</p>
          <button type="button" className="btn small" onClick={activate} disabled={!!busy}>{busy === "activate" ? <span className="spinner" /> : null} Check again</button>
        </div>
      )}

      {(t.status === "revoked" || t.status === "expired") && t.chain !== null && (
        <div className="notice">
          <strong>{t.chain ? `${fromUnits(t.chain.amount, dec)} USDC is still in the tab account.` : "Funds may still be in the tab account."}</strong>
          <p style={{ margin: "8px 0 14px" }}>It's yours. Sign once to move it back to your wallet and close the account (the rent comes back too).</p>
          <ConnectInline s={s} why="Connect the wallet that owns this tab." />
          {s.account && <button type="button" className="pill" onClick={reclaim} disabled={!!busy}>{busy === "reclaim" ? <>Check your wallet <span className="spinner" /></> : <>Take funds back <b aria-hidden="true">›</b></>}</button>}
        </div>
      )}
      {err && <p className="err-line" role="alert">{err}</p>}

      <div className="tab-main">
        <div className="tab-ring">
          <Ring spent={frac(spent)} held={frac(res)} void={ended} label={`${fromUnits(t.remaining, dec)} USDC ${leftWord} of ${fromUnits(t.limit, dec)}`}
            value={fromUnits(t.remaining, dec)} sub={<>USDC {leftWord} <em>of {fromUnits(t.limit, dec)}</em></>} />
        </div>
        <dl className="stats">
          <div className="stat big"><dt>Spent</dt><dd>{fromUnits(t.spent, dec, 3)}<small>{pct}%</small></dd></div>
          <div className="stat"><dt>In flight</dt><dd>{fromUnits(t.reserved, dec, 3)}</dd></div>
          <div className="stat"><dt>Max per payment</dt><dd>{t.perPaymentCap ? fromUnits(t.perPaymentCap, dec) : "none"}</dd></div>
          <div className="stat"><dt>Services</dt><dd>{d.allowlist.length ? `${d.allowlist.length} allowed` : "any"}</dd></div>
          <div className="stat"><dt>On chain</dt><dd>{t.chain === null ? "closed" : !t.chain ? "…" : <>{fromUnits(t.chain.delegatedAmount, dec, 3)} {chainOk ? <span className="ok-text">✓</span> : <span className="accent-text">!</span>}</>}</dd></div>
          <div className="stat"><dt>Tab account</dt><dd><a href={explorerAddr(t.tokenAccount, net)} target="_blank" rel="noreferrer">{short(t.tokenAccount, 5)}</a></dd></div>
        </dl>
      </div>

      <div className="tab-lower">
        <section className="ledger" aria-label="Payments">
          <div className="row-between"><span className="eyebrow">Payments</span><span className="mono small muted">{d.payments.length}</span></div>
          {d.payments.length === 0 ? <p className="muted" style={{ margin: "14px 0 0" }}>No payments yet. They stream in here as the agent pays.</p> : (
            <ul>
              {d.payments.map((p) => (
                <li key={p.id} className={p.state === "RELEASED" ? "rel" : p.state === "SETTLED" ? "ok" : ""}>
                  <span className="what" title={p.resource ?? p.recipient}>{p.resource ? hostOf(p.resource) : short(p.recipient)}</span>
                  <span className="amt">{p.tx_signature && p.state === "SETTLED" ? <a href={explorerTx(p.tx_signature, net)} target="_blank" rel="noreferrer">{fromUnits(p.amount, dec, 3)}</a> : fromUnits(p.amount, dec, 3)}</span>
                  <span className="state">{STATE_LABEL[p.state]}</span>
                  <span className="state" style={{ textAlign: "right" }}>{new Date(p.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        {open && s.cfg?.demo
          ? <TestAgent tabId={tabId} credential={credential} onKey={rememberKey} onPaid={refresh} decimals={dec} net={net} />
          : open && <div className="ledger"><span className="eyebrow">Connect your agent</span><p className="muted" style={{ margin: "12px 0 0" }}>Give the agent its key and point the SDK at <code>{location.origin}/api</code>. Payments stream in on the left as they settle.</p></div>}
      </div>
    </div>
  );
}

function hostOf(u: string) { try { return new URL(u).host + new URL(u).pathname; } catch { return u; } }

const DEMO = [
  { path: "quote", label: "Buy a quote", price: "0.01" },
  { path: "search", label: "Run a search", price: "0.05" },
  { path: "summary", label: "Summarise a page", price: "0.25" },
];

/** A real agent, in this browser: pays TAB's devnet demo API through the SDK. */
function TestAgent({ tabId, credential, onKey, onPaid, decimals, net }: { tabId: string; credential?: string; onKey: (k: string) => void; onPaid: () => void; decimals: number; net: string }) {
  const real = net === "mainnet";
  const [lines, setLines] = useState<LogLine[]>([{ kind: "dim", text: real ? "$ test agent ready. It pays TAB's demo API in real USDC from this tab." : "$ test agent ready. It pays TAB's demo API on devnet with this tab." }]);
  const [left, setLeft] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [paste, setPaste] = useState("");
  const [client, setClient] = useState<Tab | null>(null);
  const tab = useRef<Tab | null>(null);
  const key = credential ?? null;

  useEffect(() => {
    const c = key && key.includes(tabId.replace(/-/g, "")) ? new Tab({ credential: key, maxPayment: 1_000_000, apiUrl: `${location.origin}/api` }) : null;
    tab.current = c; setClient(c);
    c?.balance().then((b) => setLeft(b.remaining)).catch(() => {});
  }, [key, tabId]);

  const add = (l: LogLine) => setLines((x) => [...x, l].slice(-60));

  async function call(path: string) {
    if (!tab.current) return;
    const url = `${location.origin}/api/demo/${path}`;
    add({ text: <><span className="dim">GET </span>/api/demo/{path}</> });
    try {
      const res = await tab.current.fetch(url);
      const body = await res.text();
      const b = await tab.current.balance();
      setLeft(b.remaining);
      if (res.ok) add({ kind: "dim", text: `  ${res.status} paid · ${fromUnits(b.remaining, decimals, 3)} left · ${body.slice(0, 70)}` });
      else add({ kind: "no", text: `  service answered ${res.status}. If TAB signed, the payment still settles from the chain.` });
    } catch (e) {
      add({ kind: "no", text: `  refused · ${e instanceof TabError ? `${e.code}: ${e.message}` : (e as Error).message} Nothing was signed.` });
    }
    onPaid();
  }

  async function loop() {
    setRunning(true);
    for (const p of ["quote", "search", "quote", "summary", "quote"]) await call(p);
    setRunning(false);
  }

  if (!client) {
    return (
      <div className="testagent">
        <div className="label">Test agent · {net}</div>
        <p className="muted" style={{ margin: "10px 0 14px" }}>Paste this tab's key to run a real agent from this browser. The key stays in this page and is never stored.</p>
        <form className="copybox" onSubmit={(e) => { e.preventDefault(); if (paste.trim()) onKey(paste.trim()); }}>
          <input aria-label="Agent key" className="keyinput" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="tab_test_…" spellCheck={false} autoComplete="off" />
          <button type="submit" className="btn primary">Use key</button>
        </form>
        {paste && !paste.includes(tabId.replace(/-/g, "")) && <p className="err-line">That key belongs to a different tab.</p>}
      </div>
    );
  }

  return (
    <Console
      title={`test agent · ${net}`}
      status={running ? "running" : "idle"}
      balance={left !== null ? fromUnits(left, decimals, 3) : "…"}
      balanceNote={<>USDC left<br />{real ? "real USDC payments" : "devnet payments"}</>}
      lines={lines}
      actions={<>
        {DEMO.map((x) => <button key={x.path} type="button" disabled={running} onClick={async () => { setRunning(true); await call(x.path); setRunning(false); }}>{x.label} · {x.price}</button>)}
        <button type="button" disabled={running} onClick={loop}>Run a 5-call task</button>
      </>}
    />
  );
}
