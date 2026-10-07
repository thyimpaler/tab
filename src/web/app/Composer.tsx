import { useMemo, useState, type CSSProperties } from "react";
import { api, ApiError } from "../lib/api";
import { fromUnits, toUnits } from "../lib/format";
import { navigate } from "../main";
import { walletMessage, type Session } from "./session";
import { KeyReveal } from "./KeyReveal";
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
  const problem = capTooBig ? "The max per payment can't be above the limit." : badAllow ? `"${badAllow.slice(0, 12)}…" isn't a Solana address.` : lock && !allowList.length ? "Add the payment address of at least one service, or turn the restriction off." : null;
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
  const ms = EXPIRY.find((x) => x.v === exp)!.ms;
  const ends = new Date(Date.now() + ms).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <section className="composer">
      <div className="composer-rules">
        <div className="rule">
          <span className="eyebrow">01 · Name</span>
          <input className="title-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Untitled tab" maxLength={60} aria-label="Tab name" />
        </div>
        <div className="rule">
          <span className="eyebrow">02 · Max per payment</span>
          <div className="chips" role="radiogroup" aria-label="Max per payment">
            {CAPS.filter((c) => Number(c) * 1e6 <= Number(limit)).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={cap === c} className={`opt-chip${cap === c ? " on" : ""}`} onClick={() => setCap(c)}>{c}</button>
            ))}
            <button type="button" role="radio" aria-checked={cap === "none"} className={`opt-chip${cap === "none" ? " on" : ""}`} onClick={() => setCap("none")}>none</button>
          </div>
        </div>
        <div className="rule">
          <span className="eyebrow">03 · Ends after</span>
          <div className="chips" role="radiogroup" aria-label="Ends after">
            {EXPIRY.map((x) => (
              <button key={x.v} type="button" role="radio" aria-checked={exp === x.v} className={`opt-chip${exp === x.v ? " on" : ""}`} onClick={() => setExp(x.v)}>{x.label}</button>
            ))}
          </div>
        </div>
        <div className="rule">
          <span className="eyebrow">04 · Where it can spend</span>
          <label className="switch">
            <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />
            <span className="track" aria-hidden="true"><i /></span>
            <span>Restrict where this agent can spend <span className="muted">(optional)</span></span>
          </label>
          {!lock ? (
            <span className="rule-hint">Off: it can pay any x402 service, still inside your limit and max per payment.</span>
          ) : (
            <>
              <textarea className="allow" rows={3} value={allow} onChange={(e) => setAllow(e.target.value)} spellCheck={false}
                placeholder="Paste each service's payment address, one per line" aria-label="Payment addresses of the services this agent may pay" />
              <span className="rule-hint">Every x402 service gets paid at a Solana address. You'll find it in the service's docs, or in the 402 reply your agent receives (the "payTo" field). Payments to any other address are refused.</span>
            </>
          )}
        </div>
      </div>

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
                style={{ "--len": Math.max(4, (typed ?? fromUnits(limit, DEC)).length) } as CSSProperties}
                onChange={(e) => setTyped(e.target.value)} onBlur={commitTyped}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <span className="dial-note">USDC limit</span>
              <span className="dial-hint">drag the ring or type</span>
            </>
          )}
        />
      </div>

      <div className="terms" aria-label="What you're signing">
        <div className="rc-head"><b>tab</b><span>terms · {s.cfg?.network ?? ""}</span></div>
        <dl className="terms-lines" aria-live="polite">
          <div><dt>Name</dt><dd>{label.trim() || "Untitled tab"}</dd></div>
          <div><dt>Limit</dt><dd>{fromUnits(limit, DEC)}</dd></div>
          <div><dt>Max per payment</dt><dd>{cap === "none" ? "none" : cap}</dd></div>
          <div><dt>Ends</dt><dd>{ends}</dd></div>
          <div><dt>Can spend at</dt><dd>{!lock ? "any x402 service" : allowList.length ? `${allowList.length} service${allowList.length === 1 ? "" : "s"} only` : "none added yet"}</dd></div>
          {fee > 0n && <div className="fee"><dt>Opening fee</dt><dd>{fromUnits(fee, DEC)}</dd></div>}
        </dl>
        <div className="terms-total"><span>You sign once</span><b>{fromUnits(total, DEC)}</b><span>USDC</span></div>
        {problem && <p className="terms-err">{problem}</p>}
        {!s.account ? (
          <div className="terms-connect">
            <span>Connect the wallet that will fund this tab.</span>
            <div className="row-wrap">
              {s.wallets.length ? s.wallets.map((w) => (
                <button key={w.name} type="button" className="wallet-chip" onClick={() => s.connectWallet(w.wallet)} disabled={!!s.busy}>
                  <img src={w.icon} alt="" width={18} height={18} /> {w.name}
                </button>
              )) : <span>No Solana wallet found in this browser.</span>}
            </div>
            {s.error && <p className="terms-err" role="alert">{s.error}</p>}
          </div>
        ) : (
          <button type="button" className="pill dark big terms-sign" onClick={submit} disabled={busy || !!problem}>
            {busy ? <>{STAGE_TEXT[stage!]} <span className="spinner" /></> : <>Sign &amp; open · {fromUnits(total, DEC)} <b aria-hidden="true">›</b></>}
          </button>
        )}
        {err && <p className="terms-err" role="alert">{err}</p>}
        <p className="terms-fine">Funds stay in a token account you own. What's left comes back when you close the tab.</p>
        {s.cfg?.network === "devnet" && <p className="terms-fine">Devnet: USDC at <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">faucet.circle.com</a>, SOL at <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">faucet.solana.com</a>.</p>}
      </div>
    </section>
  );
}
