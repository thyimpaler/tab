import { useEffect, useRef, useState } from "react";
import { SIM_CALLS, SIM_CAP, SIM_LIMIT, reducedMotion, usdc } from "./sim";

type Line = { host: string; url: string; amount: number; refused?: string };

/** The hero receipt: an agent's tab printing as it spends. Simulation. */
export function SimReceipt() {
  const [lines, setLines] = useState<Line[]>([]);
  const [spent, setSpent] = useState(0);
  const [closed, setClosed] = useState(false);
  const [running, setRunning] = useState(false);
  const runId = useRef(0);

  async function run() {
    if (running) return;
    setClosed(false); setLines([]); setSpent(0);
    const me = ++runId.current;
    setRunning(true);
    let s = 0;
    for (const c of SIM_CALLS) {
      await new Promise((r) => setTimeout(r, reducedMotion() ? 0 : 700));
      if (runId.current !== me) return;
      let refused = c.refuse;
      if (!refused && s + c.amount > SIM_LIMIT) refused = "over the limit";
      if (!refused) s += c.amount;
      setSpent(s);
      setLines((l) => [...l, { host: c.url.split("/")[0], url: c.url, amount: c.amount, refused }].slice(-8));
    }
    setRunning(false);
  }

  function close() { runId.current++; setClosed(true); setRunning(false); }

  useEffect(() => { run(); return () => { runId.current++; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="receipt hero-receipt" aria-live="polite" aria-label="Example tab receipt (simulation)">
      {closed && <div className="stamp">Closed</div>}
      <div className="r-head"><strong>TAB</strong><span className="muted">research-agent · #7F21</span></div>
      <div className="row muted"><span>opened</span><span>OCT 08 09:14</span></div>
      <div className="row muted"><span>expires</span><span>OCT 15 09:14</span></div>
      <div className="row muted"><span>max per payment</span><span>{usdc(SIM_CAP, 2)}</span></div>
      <div className="sep" />
      <div className="sim-lines">
        {lines.map((l, i) => (
          <div key={i + l.url} className={"row line" + (l.refused ? " rej" : "")} title={l.refused ? `${l.url}: refused, ${l.refused}` : l.url}>
            <span>{l.host}</span><span>{l.refused ? "REFUSED" : usdc(l.amount)}</span>
          </div>
        ))}
      </div>
      <div className="sep" />
      <div className="row total"><span>SPENT</span><span>{usdc(spent)}</span></div>
      <div className="row total limit"><span>LIMIT</span><span>{usdc(SIM_LIMIT)} USDC</span></div>
      <div className="meter" style={{ margin: "12px 0 4px" }}><i style={{ width: `${(spent / SIM_LIMIT) * 100}%` }} /></div>
      <div className="row muted"><span>left</span><span>{usdc(SIM_LIMIT - spent)}</span></div>
      <div className="row" style={{ marginTop: 14, gap: 8 }}>
        <button type="button" className="btn small" onClick={run} disabled={running}>{running ? "Agent running…" : closed ? "Open a new tab" : "Run it again"}</button>
        <button type="button" className="btn small danger" onClick={close} disabled={closed}>Close tab</button>
      </div>
      <div className="label" style={{ marginTop: 14, textAlign: "center" }}>simulation</div>
    </div>
  );
}
