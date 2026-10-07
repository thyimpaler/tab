import { useEffect, useMemo, useState } from "react";
import { api, ApiError, type TabView } from "../lib/api";
import { fromUnits, toUnits, until } from "../lib/format";
import { navigate } from "../main";
import { walletMessage, type Session } from "./session";
import { KeyReveal } from "./KeyReveal";
import { Ring } from "../components/Ring";

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
    </div>
  );
}

export function TabsHome({ s, onKey }: { s: Session; onKey: (id: string, k: string) => void }) {
  const [tabs, setTabs] = useState<TabView[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const load = () => api<{ tabs: TabView[] }>("/v1/tabs").then((r) => { setTabs(r.tabs); if (!r.tabs.length) setShowNew(true); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const live = tabs?.filter((t) => t.status === "active" || t.status === "empty" || t.status === "pending") ?? [];
  const past = tabs?.filter((t) => !live.includes(t)) ?? [];

  return (
    <div className="home">
      <div className="home-head">
        <div>
          <div className="label">Your tabs</div>
          <h1 className="h1" style={{ marginTop: 14 }}>{tabs === null ? "Tabs" : live.length ? `${live.length} open` : "No open tabs"}</h1>
        </div>
        {!showNew && <button type="button" className="btn primary" onClick={() => setShowNew(true)}>Open a tab</button>}
      </div>
      {err && <p className="err-line" role="alert">{err}</p>}

      {showNew && <NewTab s={s} onCancel={tabs?.length ? () => setShowNew(false) : undefined} onCreated={(id, key) => { onKey(id, key); load(); }} />}

      {tabs && tabs.length > 0 && (
        <>
          <TabRows tabs={live} title="Open" />
          {past.length > 0 && <TabRows tabs={past} title="Closed, revoked and expired" />}
        </>
      )}
    </div>
  );
}

function TabRows({ tabs, title }: { tabs: TabView[]; title: string }) {
  if (!tabs.length) return null;
  return (
    <section style={{ marginTop: 40 }}>
      <div className="eyebrow">{title}</div>
      <div className="tabgrid">
        {tabs.map((t) => {
          const lim = BigInt(t.limit), spent = BigInt(t.spent), res = BigInt(t.reserved);
          const frac = (x: bigint) => (lim > 0n ? Number((x * 10000n) / lim) / 10000 : 0);
          const ended = t.status === "revoked" || t.status === "closed";
          return (
            <a key={t.id} className="tabcard" href={`/app/tab/${t.id}`} data-nav>
              <Ring spent={frac(spent)} held={frac(res)} void={ended} />
              <span className="meta">
                <strong>{t.label || "Untitled tab"}</strong>
                <span className="mono num small">{t.status === "closed" ? <>{fromUnits(t.spent, t.decimals)} spent · {fromUnits(t.remaining, t.decimals)} returned</> : <>{fromUnits(t.remaining, t.decimals)} left of {fromUnits(t.limit, t.decimals)}</>}</span>
                <span className="row-wrap" style={{ alignItems: "center", gap: 8 }}>
                  <span className={`chip ${t.status}`}>{t.status === "pending" ? "not funded" : t.status}</span>
                  <span className="mono small muted">{t.status === "active" ? until(t.expiresAt) : new Date(t.closedAt ?? t.revokedAt ?? t.expiresAt).toLocaleDateString()}</span>
                </span>
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

const EXPIRY = [
  { v: "1h", label: "1 hour", ms: 3_600_000 },
  { v: "1d", label: "1 day", ms: 86_400_000 },
  { v: "7d", label: "7 days", ms: 7 * 86_400_000 },
  { v: "30d", label: "30 days", ms: 30 * 86_400_000 },
];

function NewTab({ s, onCancel, onCreated }: { s: Session; onCancel?: () => void; onCreated: (id: string, key: string) => void }) {
  const [label, setLabel] = useState("");
  const [limit, setLimit] = useState("5");
  const [cap, setCap] = useState("0.50");
  const [exp, setExp] = useState("7d");
  const [allow, setAllow] = useState("");
  const [stage, setStage] = useState<null | "build" | "sign" | "confirm" | "activate">(null);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; key: string } | null>(null);
  const dec = 6;
  const fee = BigInt(s.cfg?.tabFee ?? "0");

  const limitU = toUnits(limit, dec);
  const capU = cap.trim() ? toUnits(cap, dec) : null;
  const allowList = useMemo(() => allow.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean), [allow]);
  const badAllow = allowList.find((a) => !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a));
  const problems = [
    !limitU && "Enter a limit above 0 (up to 6 decimals).",
    cap.trim() && !capU && "The per-payment cap must be a positive amount.",
    limitU && capU && BigInt(capU) > BigInt(limitU) && "The per-payment cap can't be above the limit.",
    badAllow && `"${badAllow.slice(0, 12)}…" isn't a Solana address.`,
  ].filter(Boolean) as string[];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (problems.length || !s.account) return;
    setErr(null);
    try {
      setStage("build");
      const ms = EXPIRY.find((x) => x.v === exp)!.ms;
      const r = await api<{ tabId: string; transaction: string }>("/v1/tabs", {
        label: label.trim() || undefined, limit: limitU, perPaymentCap: capU ?? undefined,
        expiresAt: new Date(Date.now() + ms).toISOString(), allowlist: allowList.length ? allowList : undefined,
      });
      setStage("sign");
      const sig = await s.sendTx(r.transaction).catch((e) => { throw new Error(walletMessage(e)); });
      setStage("activate");
      let key: string | null = null;
      for (let i = 0; i < 6 && !key; i++) {
        try { key = (await api<{ credential: string }>(`/v1/tabs/${r.tabId}/activate`, { signature: sig })).credential; }
        catch (e) { if (!(e instanceof ApiError && e.code === "NOT_ACTIVATED") || i === 5) throw e; await new Promise((r) => setTimeout(r, 2500)); }
      }
      setCreated({ id: r.tabId, key: key! });
      onCreated(r.tabId, key!);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setStage(null); }
  }

  if (created) return <KeyReveal credential={created.key} title="Your tab is open" onDone={() => navigate(`/app/tab/${created.id}`)} doneLabel="Go to the tab" />;

  const stageText = { build: "Preparing the transaction…", sign: "Approve it in your wallet…", confirm: "Waiting for Solana…", activate: "Checking it on chain…" } as const;

  return (
    <form className="newtab panel" onSubmit={submit} noValidate>
      <div className="newtab-head">
        <h2 className="h3" style={{ fontSize: "clamp(1.6rem,2.4vw,2.2rem)" }}>Open a tab</h2>
        {onCancel && <button type="button" className="linkish" onClick={onCancel}>Cancel</button>}
      </div>
      <div className="form-grid">
        <div className="field"><label htmlFor="t-label">Name</label><input id="t-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="research-agent" maxLength={60} autoComplete="off" /></div>
        <div className="field"><label htmlFor="t-limit">Limit</label><div className="suffix"><input id="t-limit" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} /><span>USDC</span></div><span className="hint">Moved into the tab account. Unspent USDC comes back when you close it.</span></div>
        <div className="field"><label htmlFor="t-cap">Max per payment</label><div className="suffix"><input id="t-cap" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="no cap" /><span>USDC</span></div><span className="hint">Any single bill above this is refused.</span></div>
        <div className="field"><label htmlFor="t-exp">Expires after</label><select id="t-exp" value={exp} onChange={(e) => setExp(e.target.value)}>{EXPIRY.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}</select></div>
        <div className="field span-2"><label htmlFor="t-allow">Only pay these services (optional)</label><textarea id="t-allow" rows={2} value={allow} onChange={(e) => setAllow(e.target.value)} placeholder="Service payTo addresses, one per line. Leave empty to allow any x402 service." spellCheck={false} /></div>
      </div>
      {problems.length > 0 && <p className="err-line">{problems[0]}</p>}
      {s.cfg?.network === "devnet" && <p className="hint-line">Devnet: you need devnet USDC (free at <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">faucet.circle.com</a>) and a little devnet SOL for the fee (<a href="https://faucet.solana.com" target="_blank" rel="noreferrer">faucet.solana.com</a>).</p>}
      <ConnectInline s={s} why="Connect the wallet that will fund this tab." />
      <div className="newtab-foot">
        <div className="summary mono small">
          {limitU ? <>You sign once: {fromUnits(limitU, dec)} USDC into a tab account you own, TAB may spend up to that{capU ? <>, {fromUnits(capU, dec)} max per payment</> : null}, for {EXPIRY.find((x) => x.v === exp)!.label}.{fee > 0n ? <> Opening fee: {fromUnits(fee, dec)} USDC, in the same signature. Total from your wallet: {fromUnits(BigInt(limitU) + fee, dec)} USDC.</> : null}</> : "Set a limit to continue."}
        </div>
        <button type="submit" className="btn primary" disabled={!!stage || problems.length > 0 || !s.account}>
          {stage ? <><span className="spinner" /> {stageText[stage]}</> : "Open tab"}
        </button>
      </div>
      {err && <p className="err-line" role="alert">{err}</p>}
    </form>
  );
}
