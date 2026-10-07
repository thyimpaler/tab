import { useRef, useState } from "react";

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
      <div className="label">Agent key · shown once</div>
      <h2 className="d2" id="reveal-h" style={{ marginTop: 14 }}>{title}</h2>
      <p className="lede muted" style={{ marginTop: 18 }}>Give this key to your agent as <code>TAB_CREDENTIAL</code>. TAB only stores a hash of it, so it can't be shown again. If you lose it, rotate it from the tab page.</p>
      <div className="copybox" style={{ marginTop: 28 }}>
        <code ref={ref as any}>{credential}</code>
        <button type="button" className="btn primary" onClick={copy}>{copied === "yes" ? "Copied" : copied === "manual" ? "Press Ctrl+C" : "Copy key"}</button>
      </div>
      <label className="check" style={{ marginTop: 20 }}>
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        <span>I've saved the key somewhere safe</span>
      </label>
      <div className="cta-row"><button type="button" className="btn" onClick={onDone} disabled={!saved}>{doneLabel}</button></div>
    </section>
  );
}
