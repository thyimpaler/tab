import { useRef, useState } from "react";

/** Shows an agent key once, as a ticket stub. Copy falls back to selecting the text (clipboard can fail after wallet popups). */
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
      <div className="reveal-copy">
        <div className="eyebrow">Agent key · shown once</div>
        <h2 className="h2" id="reveal-h">{title}</h2>
        <p className="lede muted">Give this key to your agent as <code>TAB_CREDENTIAL</code>. TAB only keeps a hash, so it can't show it again. Lose it and you can make a new one from the tab.</p>
        <label className="switch">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          <span className="track" aria-hidden="true"><i /></span>
          <span>I've saved the key somewhere safe</span>
        </label>
        <div><button type="button" className="pill" onClick={onDone} disabled={!saved}>{doneLabel} <b aria-hidden="true">›</b></button></div>
      </div>
      <div className="ticket">
        <div className="ticket-top">
          <b>tab</b>
          <span>admit one agent</span>
        </div>
        <span className="ticket-label">TAB_CREDENTIAL</span>
        <code ref={ref as any}>{credential}</code>
        <div className="ticket-stub">
          <span>Shown once. Stored only as a hash.</span>
          <button type="button" className="pill dark" onClick={copy}>{copied === "yes" ? "Copied" : copied === "manual" ? "Press Ctrl+C" : "Copy key"} <b aria-hidden="true">{copied === "yes" ? "✓" : "›"}</b></button>
        </div>
      </div>
    </section>
  );
}
