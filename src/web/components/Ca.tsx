import { useRef, useState } from "react";
import { CA, X_URL } from "../lib/links";
import { XButton } from "./Chrome";

/** The token contract address, with copy. Shows a pending state until CA is set in lib/links.ts. */
export function CaSection() {
  const [copied, setCopied] = useState<"yes" | "manual" | null>(null);
  const ref = useRef<HTMLElement>(null);

  async function copy() {
    try { await navigator.clipboard.writeText(CA); setCopied("yes"); }
    catch {
      const r = document.createRange(); if (ref.current) { r.selectNodeContents(ref.current); const sel = getSelection(); sel?.removeAllRanges(); sel?.addRange(r); }
      setCopied("manual");
    }
    setTimeout(() => setCopied(null), 2400);
  }

  return (
    <section className="sec ca-sec" id="ca" aria-labelledby="ca-h">
      <div className="ca-copy">
        <span className="eyebrow">CA</span>
        <h2 className="h2" id="ca-h">One address. <span className="mute">This one.</span></h2>
        <p className="lede muted">
          {CA
            ? "TAB's contract address on Solana. Check any address against this page and our X. Anything else isn't us."
            : "The contract address goes up here and on our X at launch. Until then, any address claiming to be TAB isn't us."}
        </p>
      </div>
      <div className="ca-card">
        <div className="ca-top"><span>Contract address</span><span>Solana</span></div>
        <code ref={ref} className={CA ? undefined : "pending"}>{CA || "Not live yet"}</code>
        <div className="ca-actions">
          {CA ? (
            <>
              <button type="button" className="pill" onClick={copy} aria-live="polite">
                {copied === "yes" ? "Copied" : copied === "manual" ? "Press Ctrl+C" : "Copy CA"} <b aria-hidden="true">{copied === "yes" ? "✓" : "›"}</b>
              </button>
              <a className="btn" href={`https://solscan.io/token/${CA}`} target="_blank" rel="noreferrer">Solscan</a>
            </>
          ) : (
            <a className="pill" href={X_URL} target="_blank" rel="noreferrer">Follow on X <b aria-hidden="true">›</b></a>
          )}
          <XButton />
        </div>
      </div>
    </section>
  );
}
