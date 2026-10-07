import { useRef, useState, type CSSProperties } from "react";
import { Ring } from "./Ring";
import { clamp01, useScrollFrame } from "./scroll";

// "How it works" as a pinned scroll story: one ring, four states. Scrolling picks the step (and rewinds
// on the way back up); everything else is CSS transitions keyed off the step, so scroll frames do no
// style writes at all. React renders only when the step changes.

const STEPS = [
  { k: "limit · cap · expiry", h: "Open a tab", p: "Set a limit, a max per payment and an end date. One wallet signature funds a token account you own, with the 0.20 USDC fee in the same signature." },
  { k: "tab_live_…", h: "Give the agent a key", p: "The key lets it ask TAB to pay, nothing more. It never holds a wallet key and can't move funds on its own." },
  { k: "HTTP 402 → paid", h: "It pays as it goes", p: "Every x402 bill is checked against your rules, then signed. Anything over the line is refused and nothing is signed." },
  { k: "revoke · reclaim", h: "Close it out", p: "Revoke in one click. Whatever's left goes back to your wallet, rent included." },
];
const RING = [
  { spent: 0, value: "5.00", sub: <>USDC limit</> },
  { spent: 0, value: "5.00", sub: <>USDC limit</> },
  { spent: 0.38, value: "3.10", sub: <>USDC left <em>of 5.00</em></> },
  { spent: 0, value: "3.10", sub: <>back in your wallet</> },
];

export function Story() {
  const sec = useRef<HTMLElement>(null);
  const [step, setStep] = useState(0);
  const cur = useRef(0);

  useScrollFrame(sec, (r, vh) => {
    const p = clamp01(-r.top / Math.max(1, r.height - vh));
    const s = Math.min(3, Math.floor(p * 4.0001));
    if (s !== cur.current) { cur.current = s; setStep(s); }
  });

  const ring = RING[step];
  return (
    <section className="story" id="how" ref={sec} aria-label="How it works">
      <div className="story-pin">
        <div className="story-copy">
          <div className="eyebrow">How it works</div>
          <h2 className="h2">Four steps. <span className="mute">One signature.</span></h2>
          <ol className="story-steps">
            {STEPS.map((s, i) => (
              <li key={s.h} className={i === step ? "on" : i < step ? "done" : ""} style={{ "--n": i } as CSSProperties}>
                <span className="n">{String(i + 1).padStart(2, "0")}</span>
                <div><h3 className="h3">{s.h}</h3><span className="k">{s.k}</span><p>{s.p}</p></div>
                <i aria-hidden="true" />
              </li>
            ))}
          </ol>
        </div>
        <div className="story-stage" data-step={step} style={{ "--step": step } as CSSProperties} aria-hidden="true">
          <div className="story-ring">
            <Ring spent={ring.spent} value={ring.value} sub={ring.sub} void={step === 3} />
          </div>
          <div className="sat s0 a">cap 0.50</div>
          <div className="sat s0 b">ends in 7 days</div>
          <div className="sat s0 c">fee 0.20</div>
          <div className="sat s1 key"><span>agent key · shown once</span><code>tab_live_8fQ2…x9Lm</code></div>
          <div className="sat s2 a">paid 0.42 · llm.gateway</div>
          <div className="sat s2 b">paid 0.25 · scrape.page</div>
          <div className="sat s2 c no">refused 2.40 · over cap</div>
          <div className="sat s3 a">revoked</div>
          <div className="sat s3 back">3.10 USDC → your wallet</div>
        </div>
      </div>
    </section>
  );
}
