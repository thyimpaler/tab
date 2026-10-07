import { useEffect, useRef, useState, type CSSProperties } from "react";
import { reducedMotion } from "./sim";
import { useInView } from "./scroll";

// The five checks as gates. Pick a payment and it runs through them in TAB's real order; it stops at
// the first one that fails, with the exact error code the agent gets back.

const GATES = [
  { k: "status", h: "The tab is open", p: "Revoked or closed means no. Revoking takes effect on the next request.", code: "TAB_REVOKED" },
  { k: "expires_at", h: "It hasn't expired", p: "Every tab has an end date. Past it, nothing is signed.", code: "TAB_EXPIRED" },
  { k: "per_payment_cap", h: "Under the cap", p: "A runaway loop can't empty the tab in one call.", code: "PAYMENT_EXCEEDS_TAB_LIMIT" },
  { k: "allowlist", h: "The service is allowed", p: "Lock a tab to services you trust, or leave it open.", code: "RECIPIENT_NOT_ALLOWED" },
  { k: "limit", h: "There's room left", p: "Spent plus in-flight never passes the limit, even fifty at once.", code: "INSUFFICIENT_TAB_BALANCE" },
];
const CASES = [
  { id: "ok", label: "llm.gateway/chat", amt: "0.42", fail: -1 },
  { id: "cap", label: "data.vendor/export", amt: "2.40", fail: 2 },
  { id: "allow", label: "unknown.xyz/drain", amt: "0.10", fail: 3 },
  { id: "room", label: "0.50 with 0.30 left", amt: "0.50", fail: 4 },
  { id: "revoked", label: "after you revoke", amt: "0.05", fail: 0 },
  { id: "expired", label: "on day 8 of 7", amt: "0.05", fail: 1 },
];

export function Gates() {
  const box = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState(0);
  const [at, setAt] = useState(-1);        // last gate the payment has reached
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const started = useRef(false);
  const c = CASES[sel];

  function go(i: number) {
    clearTimeout(timer.current);
    setSel(i); setAt(-1); setDone(false);
    const fail = CASES[i].fail;
    const last = fail === -1 ? 4 : fail;
    if (reducedMotion()) { setAt(last); setDone(true); return; }
    let g = -1;
    const tick = () => {
      g++; setAt(g);
      if (g >= last) { timer.current = setTimeout(() => setDone(true), 340); return; }
      timer.current = setTimeout(tick, 380);
    };
    timer.current = setTimeout(tick, 260);
  }
  useInView(box, () => { if (!started.current) { started.current = true; go(1); } }, 0.35);
  useEffect(() => () => clearTimeout(timer.current), []);

  const failed = done && c.fail !== -1;
  const x = done && c.fail === -1 ? 1.08 : at < 0 ? -0.02 : (at + 0.5) / 5;
  const state = (i: number) => (i < at || (i === at && done && !failed) ? "pass" : i === at && failed ? "fail" : i === at ? "on" : "");

  return (
    <div className={`gates${failed ? " failed" : ""}${done && !failed ? " passed" : ""}`} ref={box}>
      <div className="gate-pick" role="radiogroup" aria-label="Pick a payment">
        {CASES.map((k, i) => (
          <button key={k.id} type="button" role="radio" aria-checked={sel === i} className={`gate-case${sel === i ? " on" : ""}`} onClick={() => go(i)}>
            <b>{k.amt}</b><span>{k.label}</span>
          </button>
        ))}
      </div>
      <div className="gate-track" aria-hidden="true">
        <div className="gate-chip" style={{ "--x": x } as CSSProperties}><b>{c.amt}</b> {c.label}</div>
      </div>
      <ol className="gate-cols">
        {GATES.map((g, i) => (
          <li key={g.k} className={state(i)}>
            <span className="n">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="h3">{g.h}</h3>
            <span className="k">{g.k}</span>
            <p>{g.p}</p>
            <span className="code">{failed && i === c.fail ? g.code : ""}</span>
          </li>
        ))}
      </ol>
      <div className="gate-verdict" aria-live="polite">
        {!done ? <span className="dim">checking {c.amt} · {c.label}…</span>
          : failed ? <><b className="no">{GATES[c.fail].code}</b><span>Refused at check {c.fail + 1}. Nothing signed, nothing spent.</span></>
          : <><b>200 · paid</b><span>All five passed. TAB signed {c.amt} USDC and the service answered.</span></>}
      </div>
    </div>
  );
}
