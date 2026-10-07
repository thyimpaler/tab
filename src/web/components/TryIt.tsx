import { useEffect, useRef, useState } from "react";
import { Dial } from "./Dial";
import { Ring } from "./Ring";
import { reducedMotion, usdc } from "./sim";

// Landing "try it": the visitor turns the ring to set the limit, picks a cap and the allowlist, then a
// simulated agent spends against exactly those rules. Every call prints on a receipt, paid or refused.
// Checks run in TAB's real order: cap, allowlist, room left.
const CALLS: { url: string; amount: number; foreign?: boolean }[] = [
  { url: "pricefeed.dev/quote", amount: 10_000 },
  { url: "lens.ai/search", amount: 50_000 },
  { url: "scrape.page/run", amount: 250_000 },
  { url: "llm.gateway/chat", amount: 420_000 },
  { url: "data.vendor/export", amount: 2_400_000 },
  { url: "unknown.xyz/drain", amount: 100_000, foreign: true },
  { url: "llm.gateway/chat", amount: 480_000 },
  { url: "render.cloud/job", amount: 1_150_000 },
  { url: "vision.api/describe", amount: 490_000 },
  { url: "llm.gateway/chat", amount: 500_000 },
  { url: "tts.voice/render", amount: 500_000 },
  { url: "llm.gateway/chat", amount: 500_000 },
  { url: "lens.ai/search", amount: 50_000 },
  { url: "llm.gateway/chat", amount: 500_000 },
  { url: "scrape.page/run", amount: 300_000 },
];
const CAPS = [["0.10", 100_000], ["0.50", 500_000], ["1.00", 1_000_000], ["none", 0]] as const;
type Line = { url: string; amount: number; refuse?: string };

export function TryIt() {
  const [limit, setLimit] = useState("5000000");
  const [cap, setCap] = useState(500_000);
  const [lock, setLock] = useState(true);
  const [spent, setSpent] = useState(0);
  const [phase, setPhase] = useState<"set" | "run" | "done">("set");
  const [lines, setLines] = useState<Line[]>([]);
  const runId = useRef(0);
  const tape = useRef<HTMLOListElement>(null);
  const lim = Number(limit);
  const refused = lines.filter((l) => l.refuse).length;

  useEffect(() => { const el = tape.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: reducedMotion() ? "auto" : "smooth" }); }, [lines.length, phase]);
  useEffect(() => () => { runId.current++; }, []);

  async function run() {
    const me = ++runId.current;
    setPhase("run"); setSpent(0); setLines([]);
    let s = 0;
    for (const c of CALLS) {
      await new Promise((r) => setTimeout(r, reducedMotion() ? 0 : 420));
      if (runId.current !== me) return;
      const refuse = cap && c.amount > cap ? "over the cap"
        : lock && c.foreign ? "not allowed"
        : c.amount > lim - s ? "not enough left" : undefined;
      if (!refuse) s += c.amount;
      setSpent(s);
      setLines((l) => [...l, { url: c.url, amount: c.amount, refuse }]);
    }
    setPhase("done");
  }
  function reset() { runId.current++; setPhase("set"); setSpent(0); setLines([]); }

  return (
    <div className={`try phase-${phase}`}>
      <div className="try-rules">
        <div className="rule">
          <span className="eyebrow">01 · Limit</span>
          <div className="rule-val"><strong>{usdc(lim, 2)}</strong><span>USDC</span></div>
          <span className="rule-hint">{phase === "set" ? "Turn the ring to change it." : "Locked while the agent runs."}</span>
        </div>
        <div className="rule">
          <span className="eyebrow">02 · Max per payment</span>
          <div className="chips" role="radiogroup" aria-label="Max per payment">
            {CAPS.map(([l, v]) => (
              <button key={l} type="button" role="radio" aria-checked={cap === v} disabled={phase === "run"} className={`opt-chip${cap === v ? " on" : ""}`} onClick={() => setCap(v)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="rule">
          <span className="eyebrow">03 · Who it can pay</span>
          <label className="switch">
            <input type="checkbox" checked={lock} disabled={phase === "run"} onChange={(e) => setLock(e.target.checked)} />
            <span className="track" aria-hidden="true"><i /></span>
            <span>Only known services</span>
          </label>
        </div>
        <div className="try-go">
          {phase === "set" && <button type="button" className="pill" onClick={run}>Run the agent <b aria-hidden="true">›</b></button>}
          {phase === "run" && <button type="button" className="btn" onClick={reset}>Stop</button>}
          {phase === "done" && <><button type="button" className="pill" onClick={run}>Run again <b aria-hidden="true">›</b></button><button type="button" className="btn" onClick={reset}>New limit</button></>}
        </div>
      </div>

      <div className="try-dial">
        {phase === "set" ? (
          <Dial units={limit} onChange={setLimit} maxUsd={50} label="Try-it limit in USDC"
            center={<><span className="dial-value as-text">{usdc(lim, 2)}</span><span className="dial-note">USDC limit</span><span className="dial-hint">drag the ring</span></>} />
        ) : (
          <div className="tryit-ring">
            <Ring spent={spent / lim} value={usdc(lim - spent, 2)} sub={<>USDC left <em>of {usdc(lim, 2)}</em></>} />
          </div>
        )}
      </div>

      <div className="receipt" aria-label="Agent receipt">
        <div className="rc-head">
          <b>tab</b>
          <span>agent run · simulation</span>
          <span className="rc-rules">limit {usdc(lim, 2)} · cap {cap ? usdc(cap, 2) : "none"} · {lock ? "known only" : "any service"}</span>
        </div>
        <ol className="rc-lines" ref={tape} aria-live="polite">
          {lines.length === 0 && <li className="rc-empty">{phase === "run" ? "waiting for the first bill…" : "Nothing yet. Set the rules, then run the agent."}</li>}
          {lines.map((l, i) => (
            <li key={i} className={l.refuse ? "no" : ""}>
              <span className="u">{l.url}</span>
              <span className="a">{usdc(l.amount, 2)}</span>
              {l.refuse && <em>refused · {l.refuse} · nothing signed</em>}
            </li>
          ))}
        </ol>
        <div className="rc-foot">
          <div><span>Paid</span><b>{lines.length - refused}</b></div>
          <div><span>Refused</span><b>{refused}</b></div>
          <div><span>Spent</span><b>{usdc(spent, 2)}</b></div>
          <div><span>Left</span><b>{usdc(lim - spent, 2)}</b></div>
          {phase === "done" && <div className="stamp" aria-label="Never past your rules">never past<br />your rules</div>}
        </div>
      </div>
    </div>
  );
}
