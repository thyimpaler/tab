import { useMemo, useState } from "react";
import { api, ApiError } from "../lib/api";
import { fromUnits, toUnits } from "../lib/format";
import { navigate } from "../main";
import { walletMessage, type Session } from "./session";
import { KeyReveal } from "./KeyReveal";
import { ConnectInline } from "./ConnectInline";
import { Dial } from "../components/Dial";

const EXPIRY = [
  { v: "1h", label: "1 hour", ms: 3_600_000 },
  { v: "1d", label: "1 day", ms: 86_400_000 },
  { v: "7d", label: "7 days", ms: 7 * 86_400_000 },
  { v: "30d", label: "30 days", ms: 30 * 86_400_000 },
];
const CAPS = ["0.05", "0.10", "0.50", "1", "5", "25"];
const DEC = 6;

type Stage = null | "build" | "sign" | "activate";
const STAGE_TEXT: Record<Exclude<Stage, null>, string> = { build: "Preparing…", sign: "Approve in your wallet", activate: "Checking on chain…" };

export function Composer({ s, onCreated, maxUsd }: { s: Session; onCreated: (id: string, key: string) => void; maxUsd: number }) {
  const [label, setLabel] = useState("");
  const [limit, setLimit] = useState("5000000");
  const [typed, setTyped] = useState<string | null>(null);
  const [cap, setCap] = useState<string>("0.50");
  const [exp, setExp] = useState("7d");
  const [lock, setLock] = useState(false);
  const [allow, setAllow] = useState("");
  const [stage, setStage] = useState<Stage>(null);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; key: string } | null>(null);
  const fee = BigInt(s.cfg?.tabFee ?? "0");

  const capU = cap === "none" ? null : toUnits(cap, DEC);
  const allowList = useMemo(() => allow.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean), [allow]);
  const badAllow = lock ? allowList.find((a) => !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) : undefined;
  const capTooBig = capU !== null && BigInt(capU) > BigInt(limit);
  const problem = capTooBig ? "The max per payment can't be above the limit." : badAllow ? `"${badAllow.slice(0, 12)}…" isn't a Solana address.` : lock && !allowList.length ? "Add at least one service address, or turn the lock off." : null;
  const total = BigInt(limit) + fee;

  function commitTyped() {
    if (typed === null) return;
    const u = toUnits(typed, DEC);
    if (u) {
      const max = BigInt(Math.round(maxUsd * 1e6));
      setLimit((BigInt(u) > max ? max : BigInt(u) < 1_000_000n ? 1_000_000n : BigInt(u)).toString());
    }
    setTyped(null);
  }

  async function submit() {
    if (problem || !s.account || stage) return;
    setErr(null);
    try {
      setStage("build");
      const ms = EXPIRY.find((x) => x.v === exp)!.ms;
      const r = await api<{ tabId: string; transaction: string }>("/v1/tabs", {
        label: label.trim() || undefined, limit, perPaymentCap: capU ?? undefined,
        expiresAt: new Date(Date.now() + ms).toISOString(), allowlist: lock && allowList.length ? allowList : undefined,
      });
      setStage("sign");
      const sig = await s.sendTx(r.transaction).catch((e) => { throw new Error(walletMessage(e)); });
      setStage("activate");
      let key: string | null = null;
      for (let i = 0; i < 6 && !key; i++) {
        try { key = (await api<{ credential: string }>(`/v1/tabs/${r.tabId}/activate`, { signature: sig })).credential; }
        catch (e) { if (!(e instanceof ApiError && e.code === "NOT_ACTIVATED") || i === 5) throw e; await new Promise((res) => setTimeout(res, 2500)); }
      }
      setCreated({ id: r.tabId, key: key! });
      onCreated(r.tabId, key!);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setStage(null); }
  }

  if (created) return <KeyReveal credential={created.key} title="Your tab is open." onDone={() => navigate(`/app/tab/${created.id}`)} doneLabel="Go to the tab" />;

  const busy = !!stage;
  return (
    <section className="composer">
      <div className="composer-dial">
        <Dial
          units={limit} onChange={(u) => { setLimit(u); setTyped(null); }} maxUsd={maxUsd} disabled={busy}
          label="Tab limit in USDC"
          center={stage ? (
            <><span className="spinner big" /><span className="dial-note">{STAGE_TEXT[stage]}</span></>
          ) : (
            <>
              <input
                className="dial-value" aria-label="Limit in USDC" inputMode="decimal"
                value={typed ?? fromUnits(limit, DEC)}
                onChange={(e) => setTyped(e.target.value)} onBlur={commitTyped}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <span className="dial-note">USDC limit</span>
              <span className="dial-hint">drag the ring</span>
            </>
          )}
        />
      </div>

      <div className="composer-side">
        <div className="eyebrow">New tab</div>
        <input className="title-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name this tab" maxLength={60} aria-label="Tab name" />

        <div className="opt">
          <div className="opt-head"><span className="eyebrow">Max per payment</span><span className="mono small muted">any single bill above is refused</span></div>
          <div className="chips" role="radiogroup" aria-label="Max per payment">
            {CAPS.filter((c) => Number(c) * 1e6 <= Number(limit)).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={cap === c} className={`opt-chip${cap === c ? " on" : ""}`} onClick={() => setCap(c)}>{c}</button>
            ))}
            <button type="button" role="radio" aria-checked={cap === "none"} className={`opt-chip${cap === "none" ? " on" : ""}`} onClick={() => setCap("none")}>no cap</button>
          </div>
        </div>

        <div className="opt">
          <div className="opt-head"><span className="eyebrow">Expires after</span><span className="mono small muted">then nothing more is signed</span></div>
          <div className="chips" role="radiogroup" aria-label="Expires after">
            {EXPIRY.map((x) => (
              <button key={x.v} type="button" role="radio" aria-checked={exp === x.v} className={`opt-chip${exp === x.v ? " on" : ""}`} onClick={() => setExp(x.v)}>{x.label}</button>
            ))}
          </div>
        </div>

        <div className="opt">
          <label className="switch">
            <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />
            <span className="track" aria-hidden="true"><i /></span>
            <span>Only pay specific services</span>
          </label>
          {lock && (
            <textarea className="allow" rows={3} value={allow} onChange={(e) => setAllow(e.target.value)} spellCheck={false}
              placeholder="Service payTo addresses, one per line" aria-label="Allowed service addresses" />
          )}
        </div>

        <div className="receipt-line" aria-live="polite">
          <div><span className="eyebrow">Into your tab</span><b>{fromUnits(limit, DEC)}</b></div>
          {fee > 0n && <div><span className="eyebrow">Opening fee</span><b>{fromUnits(fee, DEC)}</b></div>}
          <div><span className="eyebrow">You sign once</span><b className="total">{fromUnits(total, DEC)} <small>USDC</small></b></div>
        </div>

        {problem && <p className="err-line">{problem}</p>}
        {s.cfg?.network === "devnet" && <p className="hint-line">Devnet: get USDC at <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">faucet.circle.com</a> and SOL at <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">faucet.solana.com</a>.</p>}
        <ConnectInline s={s} why="Connect the wallet that will fund this tab." />
        <button type="button" className="pill big" onClick={submit} disabled={busy || !!problem || !s.account}>
          {busy ? <>{STAGE_TEXT[stage!]} <span className="spinner" /></> : <>Open tab · {fromUnits(total, DEC)} USDC <b aria-hidden="true">›</b></>}
        </button>
        {err && <p className="err-line" role="alert">{err}</p>}
        <p className="fine">The USDC sits in a token account your wallet owns. TAB can spend up to the limit and nothing else. Unspent funds come back when you close the tab.</p>
      </div>
    </section>
  );
}
