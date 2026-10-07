import { useRef, useState } from "react";
import { Dial } from "./Dial";
import { Ring } from "./Ring";
import { Console, type LogLine } from "./Console";
import { fakeSig, reducedMotion, usdc } from "./sim";

// Landing "try it": the visitor sets the limit (dial), cap and lock, then a simulated agent spends
// against exactly those rules. Checks run in TAB's real order: cap, allowlist, room left.
const CALLS: { url: string; amount: number; foreign?: boolean }[] = [
  { url: "api.pricefeed.dev/quote", amount: 10_000 },
  { url: "search.lens.ai/query", amount: 50_000 },
  { url: "scrape.page/run", amount: 250_000 },
  { url: "llm.gateway/chat · 12k tok", amount: 420_000 },
  { url: "data.vendor/bulk-export", amount: 2_400_000 },
  { url: "unknown-host.xyz/drain", amount: 100_000, foreign: true },
  { url: "llm.gateway/chat · 40k tok", amount: 480_000 },
  { url: "render.cloud/job", amount: 1_150_000 },
  { url: "vision.api/describe", amount: 490_000 },
  { url: "llm.gateway/chat · 90k tok", amount: 500_000 },
  { url: "tts.voice/render", amount: 500_000 },
  { url: "llm.gateway/chat · 80k tok", amount: 500_000 },
  { url: "search.lens.ai/query", amount: 50_000 },
  { url: "llm.gateway/chat · 99k tok", amount: 500_000 },
  { url: "scrape.page/run", amount: 300_000 },
];
const CAPS = [["0.10", 100_000], ["0.50", 500_000], ["1.00", 1_000_000], ["no cap", 0]] as const;

export function TryIt() {
  const [limit, setLimit] = useState("5000000");
  const [cap, setCap] = useState(500_000);
  const [lock, setLock] = useState(true);
  const [spent, setSpent] = useState(0);
  const [phase, setPhase] = useState<"set" | "run" | "done">("set");
  const [lines, setLines] = useState<LogLine[]>([{ kind: "dim", text: "$ set a limit, then run the agent" }]);
  const runId = useRef(0);
  const lim = Number(limit);

  async function run() {
    const me = ++runId.current;
    setPhase("run"); setSpent(0);
    setLines([{ kind: "dim", text: `$ tab open --limit ${usdc(lim, 2)} --cap ${cap ? usdc(cap, 2) : "none"}${lock ? " --allow known" : ""}` }]);
    let s = 0;
    for (const c of CALLS) {
      await new Promise((r) => setTimeout(r, reducedMotion() ? 0 : 520));
      if (runId.current !== me) return;
      const refuse = cap && c.amount > cap ? `over your ${usdc(cap, 2)} cap`
        : lock && c.foreign ? "not on the allowlist"
        : c.amount > lim - s ? "not enough left on the tab" : null;
      if (!refuse) s += c.amount;
      setSpent(s);
      const head: LogLine = { kind: "ok", text: <><span className="dim">GET </span>{c.url}<span className="dim"> → 402 </span>{usdc(c.amount)}</> };
      const tail: LogLine = refuse ? { kind: "no", text: `  refused: ${refuse}. nothing signed.` } : { kind: "dim", text: `  ✓ checked · signed · settled ${fakeSig()}…` };
      setLines((l) => [...l, head, tail].slice(-40));
    }
    setLines((l) => [...l, { kind: "dim", text: `$ done. spent ${usdc(s, 2)} of ${usdc(lim, 2)}. it never went past your rules.` }]);
    setPhase("done");
  }
  function reset() { runId.current++; setPhase("set"); setSpent(0); setLines([{ kind: "dim", text: "$ set a limit, then run the agent" }]); }

  return (
    <div className="tryit">
      <div className="tryit-dial">
        {phase === "set" ? (
          <Dial units={limit} onChange={setLimit} maxUsd={50} label="Try-it limit in USDC"
            center={<><span className="dial-value as-text">{usdc(lim, 2)}</span><span className="dial-note">USDC limit</span><span className="dial-hint">drag the ring</span></>} />
        ) : (
          <div className="tryit-ring">
            <Ring spent={spent / lim} value={usdc(lim - spent, 2)} sub={<>USDC left <em>of {usdc(lim, 2)}</em></>} />
          </div>
        )}
      </div>
      <div className="tryit-side">
        <div className="opt">
          <span className="eyebrow">Max per payment</span>
          <div className="chips" role="radiogroup" aria-label="Max per payment">
            {CAPS.map(([l, v]) => (
              <button key={l} type="button" role="radio" aria-checked={cap === v} disabled={phase === "run"} className={`opt-chip${cap === v ? " on" : ""}`} onClick={() => setCap(v)}>{l}</button>
            ))}
          </div>
        </div>
        <label className="switch">
          <input type="checkbox" checked={lock} disabled={phase === "run"} onChange={(e) => setLock(e.target.checked)} />
          <span className="track" aria-hidden="true"><i /></span>
          <span>Only pay known services</span>
        </label>
        <Console
          title="your agent · simulation"
          status={phase === "run" ? "spending" : phase === "done" ? "finished" : "ready"}
          balance={usdc(lim - spent, 2)}
          balanceNote={<>USDC left<br />of {usdc(lim, 2)}</>}
          lines={lines}
          height={210}
          actions={phase === "set"
            ? <button type="button" onClick={run}>Run agent</button>
            : <><button type="button" onClick={reset} disabled={phase === "run" && false}>{phase === "run" ? "Stop" : "Set a new limit"}</button>{phase === "done" && <button type="button" onClick={run}>Run again</button>}</>}
        />
      </div>
    </div>
  );
}
