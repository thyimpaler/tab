import { useRef, useState } from "react";
import { Ring } from "../components/Ring";

/** Shows an agent key once. Copy falls back to selecting the text (clipboard can fail after wallet popups). */
export function KeyReveal({ credential, title, onDone, doneLabel }: { credential: string; title: string; onDone: () => void; doneLabel: string }) {
  const [copied, setCopied] = useState<"yes" | "manual" | null>(null);
  const [saved, setSaved] = useState(false);
  const ref = useRef<HTMLElement>(null);

  async function copy() {
    try { await navigator.clipboard.writeText(credential); setCopied("yes"); }
    catch {
      const r = document.createRange(); if (ref.current) { r.selectNodeContents(ref.current); const sel = getSelection(); sel?.removeAllRanges(); sel?.addRange(r); }
      setCopied("manual");
    }
  }

  return (
    <section className="reveal" aria-labelledby="reveal-h">
      <div className="reveal-ring" aria-hidden="true"><Ring spent={1} value="✓" sub="tab open" /></div>
      <div className="reveal-copy">
        <div className="eyebrow">Agent key · shown once</div>
        <h2 className="h2" id="reveal-h">{title}</h2>
        <p className="lede muted">Give this key to your agent as <code>TAB_CREDENTIAL</code>. TAB only keeps a hash, so it can't show it again. Lose it and you can rotate it from the tab.</p>
        <div className="keycard">
          <code ref={ref as any}>{credential}</code>
          <button type="button" className="pill" onClick={copy}>{copied === "yes" ? "Copied" : copied === "manual" ? "Press Ctrl+C" : "Copy key"} <b aria-hidden="true">{copied === "yes" ? "✓" : "›"}</b></button>
        </div>
        <label className="switch" style={{ marginTop: 22 }}>
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          <span className="track" aria-hidden="true"><i /></span>
          <span>I've saved the key somewhere safe</span>
        </label>
        <div style={{ marginTop: 22 }}><button type="button" className="btn" onClick={onDone} disabled={!saved}>{doneLabel}</button></div>
      </div>
    </section>
  );
}
