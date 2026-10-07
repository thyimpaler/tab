import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Dial } from "./Dial";
import { Ring } from "./Ring";
import { reducedMotion, usdc } from "./sim";
import { TASKS, type AgentStep } from "./agentTasks";

// Landing "try it": the visitor picks a task, turns the ring to set the limit, picks a cap and the
// allowlist, then a simulated agent works the task against exactly those rules. The middle shows what
// the agent does and finds; the receipt prints every bill, paid or refused.
// Checks run in TAB's real order: cap, allowlist, room left.
const CAPS = [["0.10", 100_000], ["0.50", 500_000], ["1.00", 1_000_000], ["none", 0]] as const;
type Done = { step: AgentStep; why?: "cap" | "allow" | "room" };

export function TryIt() {
  const [task, setTask] = useState(0);
  const [limit, setLimit] = useState("5000000");
  const [cap, setCap] = useState(500_000);
  const [lock, setLock] = useState(true);
  const [spent, setSpent] = useState(0);
  const [phase, setPhase] = useState<"set" | "run" | "done">("set");
  const [steps, setSteps] = useState<Done[]>([]);
  const runId = useRef(0);
  const tape = useRef<HTMLOListElement>(null);
  const log = useRef<HTMLOListElement>(null);
  const lim = Number(limit);
  const t = TASKS[task];
  const refused = steps.filter((s) => s.why).length;
  const ranOut = steps.some((s) => s.why === "room");

  useEffect(() => {
    const how = reducedMotion() ? "auto" : "smooth";
    for (const el of [tape.current, log.current]) el?.scrollTo({ top: el.scrollHeight, behavior: how });
  }, [steps.length, phase]);
  useEffect(() => () => { runId.current++; }, []);

  async function run() {
    const me = ++runId.current;
    setPhase("run"); setSpent(0); setSteps([]);
    let s = 0;
    for (const step of t.steps) {
      await new Promise((r) => setTimeout(r, reducedMotion() ? 0 : 1100));
      if (runId.current !== me) return;
      const why = cap && step.amount > cap ? "cap" as const
        : lock && step.foreign ? "allow" as const
        : step.amount > lim - s ? "room" as const : undefined;
      if (!why) s += step.amount;
      setSpent(s);
      setSteps((l) => [...l, { step, why }]);
      if (why === "room") break; // the tab is out: a real agent gets INSUFFICIENT_TAB_BALANCE and wraps up
    }
    if (runId.current === me) setPhase("done");
  }
  function reset() { runId.current++; setPhase("set"); setSpent(0); setSteps([]); }

  const skipText = (d: Done) => d.why === "room" ? "The tab is out, so I stopped here and handed back what I have."
    : d.why === "allow" ? d.step.skip || "Not a service you allowed, so TAB refused it."
    : d.step.skip || "Over your cap, so TAB refused it. Skipped and kept going.";
  const reason = (d: Done) => d.why === "cap" ? `over your ${usdc(cap, 2)} cap` : d.why === "allow" ? "not a service you allowed" : "not enough left";

  return (
    <div className={`try phase-${phase}`}>
      <div className="try-rules">
        <div className="rule">
          <span className="eyebrow">01 · Task</span>
          <div className="chips" role="radiogroup" aria-label="Task for the agent">
            {TASKS.map((x, i) => (
              <button key={x.id} type="button" role="radio" aria-checked={task === i} disabled={phase === "run"} className={`opt-chip${task === i ? " on" : ""}`} onClick={() => { setTask(i); if (phase === "done") reset(); }}>{x.label}</button>
            ))}
          </div>
          <span className="rule-hint">"{t.ask}"</span>
        </div>
        <div className="rule">
          <span className="eyebrow">02 · Limit</span>
          <div className="rule-val"><strong>{usdc(lim, 2)}</strong><span>USDC</span></div>
          <span className="rule-hint">{phase === "set" ? "Turn the ring to change it." : "Locked while the agent runs."}</span>
        </div>
        <div className="rule">
          <span className="eyebrow">03 · Max per payment</span>
          <div className="chips" role="radiogroup" aria-label="Max per payment">
            {CAPS.map(([l, v]) => (
              <button key={l} type="button" role="radio" aria-checked={cap === v} disabled={phase === "run"} className={`opt-chip${cap === v ? " on" : ""}`} onClick={() => setCap(v)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="rule">
          <span className="eyebrow">04 · Where it can spend</span>
          <label className="switch">
            <input type="checkbox" checked={lock} disabled={phase === "run"} onChange={(e) => setLock(e.target.checked)} />
            <span className="track" aria-hidden="true"><i /></span>
            <span>Only services I allow</span>
          </label>
        </div>
        <div className="try-go">
          {phase === "set" && <button type="button" className="pill" onClick={run}>Run the agent <b aria-hidden="true">›</b></button>}
          {phase === "run" && <button type="button" className="btn" onClick={reset}>Stop</button>}
          {phase === "done" && <><button type="button" className="pill" onClick={run}>Run again <b aria-hidden="true">›</b></button><button type="button" className="btn" onClick={reset}>Change the rules</button></>}
        </div>
      </div>

      <div className="try-dial">
        {phase === "set" ? (
          <Dial units={limit} onChange={setLimit} maxUsd={50} label="Try-it limit in USDC"
            center={<><span className="dial-value as-text" style={{ "--len": usdc(lim, 2).length } as CSSProperties}>{usdc(lim, 2)}</span><span className="dial-note">USDC limit</span><span className="dial-hint">drag the ring</span></>} />
        ) : (
          <div className="agent" aria-label="What the agent is doing">
            <div className="agent-head">
              <div className="agent-ring"><Ring spent={spent / lim} value={usdc(lim - spent, 2)} /></div>
              <div className="agent-task">
                <span className="eyebrow">Agent · simulation</span>
                <b>{t.ask}</b>
                <span className={`agent-state${ranOut ? " out" : ""}`}>
                  {phase === "run" ? `working · step ${steps.length + 1} of ${t.steps.length}` : ranOut ? "stopped · the tab ran out" : "done"}
                </span>
              </div>
            </div>
            <ol className="agent-log" ref={log} aria-live="polite">
              {steps.map((d, i) => (
                <li key={i} className={d.why === "room" ? "stop" : d.why ? "skip" : "ok"}>
                  <p className="say">{d.step.say}</p>
                  <code className="call">{d.step.url} · 402 · {usdc(d.step.amount, 2)} USDC → <span className="r">{d.why ? `refused, ${reason(d)}` : "paid"}</span></code>
                  <p className="got">{d.why ? skipText(d) : d.step.got}</p>
                </li>
              ))}
            </ol>
            {phase === "done" && (
              <div className="agent-answer">
                <span className="eyebrow">{ranOut ? "What it got before the tab ran out" : "Answer"}</span>
                {ranOut
                  ? <ul>{steps.filter((d) => !d.why).slice(-4).map((d, i) => <li key={i}>{d.step.got}</li>)}{!steps.some((d) => !d.why) && <li>Nothing yet. Try a bigger limit.</li>}</ul>
                  : <p>{t.answer}</p>}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="receipt" aria-label="Agent receipt">
        <div className="rc-head">
          <b>tab</b>
          <span>agent run · simulation</span>
          <span className="rc-rules">limit {usdc(lim, 2)} · cap {cap ? usdc(cap, 2) : "none"} · {lock ? "allowed services only" : "any service"}</span>
        </div>
        <ol className="rc-lines" ref={tape}>
          {steps.length === 0 && <li className="rc-empty">{phase === "run" ? "waiting for the first bill…" : "Nothing yet. Pick a task, set the rules, then run the agent."}</li>}
          {steps.map((d, i) => (
            <li key={i} className={d.why ? "no" : ""}>
              <span className="u">{d.step.url}</span>
              <span className="a">{usdc(d.step.amount, 2)}</span>
              {d.why && <em>refused · {reason(d)} · nothing signed</em>}
            </li>
          ))}
        </ol>
        <div className="rc-foot">
          <div><span>Paid</span><b>{steps.length - refused}</b></div>
          <div><span>Refused</span><b>{refused}</b></div>
          <div><span>Spent</span><b>{usdc(spent, 2)}</b></div>
          <div><span>Left</span><b>{usdc(lim - spent, 2)}</b></div>
          {phase === "done" && <div className="stamp" aria-label="Never past your rules">never past<br />your rules</div>}
        </div>
      </div>
    </div>
  );
}
