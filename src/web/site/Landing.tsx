import { useEffect, useRef, type CSSProperties } from "react";
import { TopBar, Footer } from "../components/Chrome";
import { HeroOrbit } from "../components/HeroOrbit";
import { Story } from "../components/Story";
import { TryIt } from "../components/TryIt";
import { Gates } from "../components/Gates";
import { Custody } from "../components/Custody";
import { Wire } from "../components/Wire";
import { CaSection } from "../components/Ca";
import { reducedMotion } from "../components/sim";
import { clamp01, useScrollFrame } from "../components/scroll";

// The statement after the hero. Words light up as you read down (and dim again going back up).
// Scroll only flips a class on the words whose state changed; the fade itself is a CSS transition.
const MANIFESTO: [string, boolean?][] = [
  ["Your agent needs to pay for things."], ["APIs, models, data, one request at a time."],
  ["Hand it your wallet and it can spend all of it."], ["Hand it a tab and it spends what you said,"], ["then stops.", true],
];

function Manifesto() {
  const ref = useRef<HTMLElement>(null);
  // 0 when the paragraph's top reaches 85% of the viewport, 1 when its bottom reaches 45%.
  const lit = useRef(-1);
  useScrollFrame(ref, (_r, vh, el) => {
    const para = el.querySelector("p"); if (!para) return;
    const t = para.getBoundingClientRect();
    const spans = para.children;
    const n = Math.round(clamp01((vh * 0.85 - t.top) / (vh * 0.4 + t.height)) * spans.length);
    if (n === lit.current) return;
    const [from, to] = n > lit.current ? [Math.max(0, lit.current), n] : [n, lit.current];
    for (let i = from; i < to && i < spans.length; i++) spans[i].classList.toggle("lit", i < n);
    lit.current = n;
  });
  const words = MANIFESTO.flatMap(([s, hot]) => s.split(" ").map((w) => ({ w, hot })));
  return (
    <section className="manifesto" ref={ref} aria-label="Why TAB">
      <span className="eyebrow">Why a tab</span>
      <p>
        {words.map((x, i) => (
          <span key={i} className={x.hot ? "hot" : undefined}>{x.w} </span>
        ))}
      </p>
    </section>
  );
}

function Closing() {
  const ref = useRef<HTMLElement>(null);
  useScrollFrame(ref, (r, vh, el) => {
    el.style.setProperty("--p", clamp01((vh - r.top) / (vh + r.height * 0.5)).toFixed(3));
  });
  return (
    <section className="end" ref={ref}>
      <div className="end-copy">
        <h2 className="end-title">Put your agent <span>on a tab.</span></h2>
        <div className="row-wrap">
          <a className="pill" href="/app" data-nav>Open a tab <b aria-hidden="true">›</b></a>
          <a className="btn" href="/docs" data-nav>Read the docs</a>
        </div>
      </div>
      <div className="end-horizon" aria-hidden="true">
        <div className="end-ring">
          <div className="ring-box" style={{ "--spent": 0.18 } as CSSProperties}><div className="ring" /><div className="groove" /><div className="arc" /></div>
        </div>
      </div>
    </section>
  );
}

const FAQ = [
  ["What happens if TAB goes down?", "Your agent can't pay until it's back. Your funds don't move: they're in your own token account, and you can revoke TAB's permission or close the account from your wallet without us."],
  ["What does it cost?", "0.20 USDC each time you open a tab, taken in the same signature, so you see it before you sign. Payments carry no TAB fee, and their network fees are paid by the service's x402 facilitator. The tab account also holds about 0.002 SOL of rent, which comes back when you close it."],
  ["Which tokens and wallets?", "USDC on Solana. Any Wallet Standard wallet works, including Phantom, Solflare and Backpack. Signing in is a message signature, never a transaction."],
  ["Can a payment go through twice?", "No. Every request carries an idempotency key. Repeating a key returns the original signed payment, which can only land on chain once."],
  ["How does TAB know a payment really settled?", "It reads the chain. A payment counts as spent only when a transaction with TAB's signature is confirmed. If a signed payment never lands, its hold is released once its blockhash expires."],
  ["Has TAB been audited?", "Not yet by a third party. The limit is enforced twice: by TAB's ledger, tested under fifty concurrent payments, and by the SPL Token program's allowance on chain, which TAB can't override."],
];

export function Landing() {
  // Entrance: wait for the display face (no headline jump), at most ~0.9s, then reveal once.
  useEffect(() => {
    const root = document.querySelector(".landing");
    let done = false;
    const reveal = () => { if (!done) { done = true; root?.classList.add("ready"); } };
    if (reducedMotion()) return reveal();
    Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 900))])
      .then(() => requestAnimationFrame(() => requestAnimationFrame(reveal)));
  }, []);
  // Arriving at /#how from another page: the section only exists after render, so jump to it then.
  useEffect(() => {
    const id = location.hash.slice(1);
    if (!/^[a-z-]+$/.test(id)) return;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
  }, []);
  return (
    <div className="landing">
      <TopBar current="home" blend />
      <HeroOrbit />
      <main>
        <Manifesto />
        <Story />

        <section className="sec try-sec" id="try">
          <header className="sec-head split">
            <div><span className="eyebrow">Try it</span><h2 className="h2">Run an agent <span className="mute">on a tab.</span></h2></div>
            <p className="lede muted">Give a pretend agent a real task, set its limit and rules, then watch it work: what it pays for, what it finds, and what TAB refuses.</p>
          </header>
          <TryIt />
        </section>

        <section className="sec checks-sec" id="checks">
          <header className="sec-head split">
            <div><span className="eyebrow">Every payment</span><h2 className="h2">Five checks. <span className="mute">In this order.</span></h2></div>
            <p className="lede muted">Pick a payment and watch where it stops. A failed check returns a typed error to the agent and signs nothing.</p>
          </header>
          <Gates />
        </section>

        <section className="sec custody-sec" id="custody">
          <header className="sec-head split">
            <div><span className="eyebrow">Non-custodial</span><h2 className="h2">Your money never leaves you.</h2></div>
            <p className="lede">The funds sit in a token account your wallet owns. <span className="mute">TAB holds a capped permission to spend from it, nothing more.</span></p>
          </header>
          <Custody />
          <div className="cando">
            <div><h3 className="h3">TAB can</h3><ul>
              <li>Sign payments from the tab, up to what's left of the limit</li>
              <li>Refuse any payment that fails one of the five checks</li>
              <li>Stop signing the moment you revoke</li>
            </ul></div>
            <div><h3 className="h3 accent-text">TAB can't</h3><ul>
              <li>Touch anything else in your wallet</li>
              <li>Spend past the limit. The SPL Token program blocks it on chain</li>
              <li>Stop you revoking or closing from your wallet, even if TAB is down</li>
            </ul></div>
          </div>
        </section>

        <section className="price" aria-label="Pricing">
          <div className="price-big">
            <span className="eyebrow">Pricing</span>
            <strong>0.20</strong>
            <span className="price-unit">USDC per tab you open. <span className="mute">That's the whole price.</span></span>
          </div>
          <ul className="price-rows">
            <li><span>TAB fee per payment</span><b>0</b></li>
            <li><span>Network fee per payment</span><b>paid by the service</b></li>
            <li><span>Account rent</span><b>≈0.002 SOL, back on close</b></li>
            <li><span>Largest tab in beta</span><b>1,000 USDC</b></li>
          </ul>
        </section>

        <section className="sec sdk-sec" id="sdk">
          <div className="sdk-copy">
            <span className="eyebrow">For builders</span>
            <h2 className="h2">Three lines <span className="mute">in your agent.</span></h2>
            <p className="lede muted">Swap <code>fetch</code> for <code>tab.fetch</code>. Free requests pass straight through. Paid ones are handled, inside the rules.</p>
            <a className="pill" href="/docs#sdk" data-nav>SDK reference <b aria-hidden="true">›</b></a>
          </div>
          <div className="sdk-side">
            <pre className="code" aria-label="SDK example"><code>
<span className="c">// npm i @tabpay/sdk</span>{"\n"}
<span className="k">import</span> {"{ Tab }"} <span className="k">from</span> <span className="s">"@tabpay/sdk"</span>;{"\n\n"}
<span className="k">const</span> tab = <span className="k">new</span> Tab({"{"}{"\n"}
{"  "}credential: process.env.TAB_CREDENTIAL,{"\n"}
{"  "}maxPayment: <span className="s">"500000"</span>, <span className="c">// 0.50 USDC</span>{"\n"}
{"}"});{"\n\n"}
<span className="k">const</span> res = <span className="k">await</span> tab.fetch(<span className="s">"https://api.example.com/forecast"</span>);
            </code></pre>
            <Wire />
          </div>
        </section>

        <CaSection />

        <section className="faq-sec" aria-labelledby="faq-h">
          <div className="faq-side">
            <span className="eyebrow">Questions</span>
            <h2 className="h2" id="faq-h">Before you open one.</h2>
            <a className="linkish" href="/docs" data-nav>Everything else is in the docs</a>
          </div>
          <div className="faq">
            {FAQ.map(([q, a], i) => (
              <details key={q}><summary><span className="qn">{String(i + 1).padStart(2, "0")}</span><span className="qt">{q}</span><i aria-hidden="true" /></summary><p>{a}</p></details>
            ))}
          </div>
        </section>

        <Closing />
      </main>
      <Footer />
    </div>
  );
}
