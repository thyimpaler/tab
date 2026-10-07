import { useEffect, useRef, useState } from "react";
import { TopBar, Footer } from "../components/Chrome";
import { SimReceipt } from "../components/SimReceipt";
import { Console, type LogLine } from "../components/Console";
import { SIM_CALLS, SIM_LIMIT, fakeSig, reducedMotion, usdc } from "../components/sim";

function Words({ text, className }: { text: string; className?: string }) {
  // Each word rises inside its own mask. Resting state is fully visible.
  return (
    <>
      {text.split(" ").map((w, i) => (
        <span key={i}><span className="wm"><span className={className} style={{ animationDelay: `${120 + i * 70}ms` }}>{w}</span></span>{" "}</span>
      ))}
    </>
  );
}

const CHECKS = [
  { k: "status", h: "The tab is open", p: "Revoked, closed or not yet funded means no. Revoking from the dashboard takes effect on the next request." },
  { k: "expires_at", h: "It hasn't expired", p: "Every tab has an end date. Past it, nothing is signed and the tab marks itself expired." },
  { k: "per_payment_cap", h: "This bill is under the cap", p: "A runaway loop can't empty the tab in one call. Anything above the cap is refused before signing." },
  { k: "allowlist", h: "The service is on the list", p: "Lock a tab to the services you trust. Leave it empty and any x402 service can be paid." },
  { k: "limit", h: "There's room left", p: "Spent plus in-flight payments can never pass the limit, even with fifty requests at once. The chain enforces the same ceiling." },
];

function RulesConsole() {
  const [lines, setLines] = useState<LogLine[]>([{ kind: "dim", text: '$ agent run --task "compare SOL fee data, 6 sources"' }]);
  const [left, setLeft] = useState(SIM_LIMIT);
  const [running, setRunning] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const runId = useRef(0);
  const started = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  async function run() {
    if (running) return;
    const me = ++runId.current; setRunning(true);
    let rem = revoked ? SIM_LIMIT : left;
    if (revoked) { setRevoked(false); setLeft(SIM_LIMIT); setLines([{ kind: "dim", text: "$ tab open --limit 5.00 --cap 0.50 --expires 7d" }]); }
    for (const c of SIM_CALLS) {
      await new Promise((r) => setTimeout(r, reducedMotion() ? 0 : 900));
      if (runId.current !== me) return;
      let refuse = c.refuse;
      if (!refuse && c.amount > rem) refuse = "over the limit";
      const head: LogLine = { text: <><span className="dim">GET </span>{c.url}<span className="dim"> → 402 </span>{usdc(c.amount)}</> };
      const tail: LogLine = refuse
        ? { kind: "no", text: `  tab  refused: ${refuse}. nothing signed.` }
        : { kind: "dim", text: `  tab  open ✓ in date ✓ cap ✓ allowlist ✓ room ✓  signed  settled ${fakeSig()}…` };
      if (!refuse) rem -= c.amount;
      setLeft(rem);
      setLines((l) => [...l, head, tail].slice(-40));
    }
    setRunning(false);
  }
  function revoke() {
    runId.current++; setRunning(false); setRevoked(true);
    setLines((l) => [...l, { kind: "no", text: "tab revoked by owner. every request from here is refused." }]);
  }

  // Start when scrolled into view, once.
  useEffect(() => {
    const el = box.current; if (!el) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && !started.current) { started.current = true; run(); } }, { threshold: 0.3 });
    io.observe(el); return () => { io.disconnect(); runId.current++; started.current = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={box}>
      <Console
        title="research-agent · simulation"
        status={revoked ? "revoked" : running ? "agent running" : "tab open · 6d 23h left"}
        balance={usdc(left)}
        balanceNote={<>USDC left<br />of {usdc(SIM_LIMIT)}</>}
        lines={lines}
        actions={<>
          <button type="button" onClick={run} disabled={running}>{revoked ? "Open a new tab" : "Run agent"}</button>
          <button type="button" onClick={revoke} disabled={revoked}>Revoke</button>
        </>}
      />
    </div>
  );
}

export function Landing() {
  return (
    <div className="landing">
      <TopBar current="home" />

      <section className="wrap hero">
        <div className="hero-copy">
          <div className="label">Spending limits for AI agents · USDC on Solana</div>
          <h1 className="d1" style={{ marginTop: 22 }}>
            <Words text="Put your agent on a" /><span className="wm"><span style={{ animationDelay: "480ms" }}><em>tab.</em></span></span>
          </h1>
          <p className="lede" style={{ marginTop: "clamp(28px,4vw,52px)" }}>
            Give an agent a USDC limit, a per-payment cap and an expiry. It pays for APIs on its own over x402.{" "}
            <b>It can't spend past the limit, it stops when the tab expires, and the money sits in an account your wallet owns</b> until it's spent.
          </p>
          <div className="cta-row">
            <a className="btn primary" href="/app" data-nav>Open a tab</a>
            <a className="btn" href="/docs" data-nav>Read the docs</a>
          </div>
        </div>
        <SimReceipt />
      </section>

      <section className="wrap section split-2" id="how">
        <h2 className="d2">Four steps, one signature</h2>
        <ol className="ruled">
          <li><span className="n">01</span><h3 className="d3">Open a tab</h3><p>Pick a limit, a per-payment cap, an expiry and, if you want, the only services it may pay. One wallet signature moves that amount into a token account your wallet owns and lets TAB spend up to the limit.</p></li>
          <li><span className="n">02</span><h3 className="d3">Hand the agent a key, not a wallet</h3><p>The agent gets a <code>tab_live_</code> key. It can ask TAB to pay. It can never move funds itself, and the key is useless for anything else.</p></li>
          <li><span className="n">03</span><h3 className="d3">The agent hits a 402</h3><p>A paid API answers HTTP 402. The SDK asks TAB, TAB checks the rules below and signs only if all pass. The service settles it on Solana in about a second.</p></li>
          <li><span className="n">04</span><h3 className="d3">Close it out</h3><p>Revoke from the dashboard and signing stops at once. Sign one more transaction and whatever's left sweeps back to your wallet, rent included.</p></li>
        </ol>
      </section>

      <section className="wrap section">
        <div className="section-head">
          <h2 className="d2">Five checks.<br />Every payment.</h2>
          <p className="lede muted">In this order, before anything is signed. A failed check returns a typed error to the agent and signs nothing.</p>
        </div>
        <div className="rules-grid">
          <ol className="checks">
            {CHECKS.map((c, i) => (
              <li key={c.k}>
                <span className="label">{String(i + 1).padStart(2, "0")} · {c.k}</span>
                <h3 className="d3">{c.h}</h3>
                <p>{c.p}</p>
              </li>
            ))}
          </ol>
          <RulesConsole />
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head">
          <h2 className="d2">Your money never <em>leaves</em> you</h2>
          <p className="lede muted">TAB is non-custodial. The funds sit in a token account owned by your wallet. TAB holds a capped permission to spend from it, nothing more.</p>
        </div>
        <div className="flow" role="img" aria-label="Your wallet funds a tab account you own. TAB's delegate may spend up to the limit from it, to x402 services.">
          <div className="node"><span className="label">You own</span><strong>Your wallet</strong><span className="muted">USDC</span></div>
          <div className="edge"><span className="label">fund once</span></div>
          <div className="node"><span className="label">You own</span><strong>Tab account</strong><span className="muted">limit 5.00 · owner: you</span></div>
          <div className="edge stamp-edge"><span className="label">allowance ≤ limit</span></div>
          <div className="node"><span className="label">x402 services</span><strong>Paid APIs</strong><span className="muted">per request</span></div>
        </div>
        <div className="cando">
          <div>
            <div className="label">TAB can</div>
            <ul>
              <li>Sign payments from the tab account, up to what's left of the limit</li>
              <li>Refuse any payment that breaks one of the five checks</li>
              <li>Stop signing the moment you revoke</li>
            </ul>
          </div>
          <div>
            <div className="label stamp-text">TAB can't</div>
            <ul>
              <li>Touch anything else in your wallet</li>
              <li>Spend past the limit. The SPL Token program blocks it on chain</li>
              <li>Stop you revoking or closing the account straight from your wallet, even if TAB is down</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="wrap section split-2">
        <div>
          <h2 className="d2">Three lines in your agent</h2>
          <p className="lede muted" style={{ marginTop: 28 }}>Swap <code>fetch</code> for <code>tab.fetch</code>. Free requests pass straight through. Paid ones are handled, inside the rules.</p>
          <div className="cta-row"><a className="btn" href="/docs#sdk" data-nav>SDK reference</a></div>
        </div>
        <pre className="code" aria-label="SDK example"><code>
<span className="c">// npm i @tabpay/sdk</span>{"\n"}
<span className="k">import</span> {"{ Tab }"} <span className="k">from</span> <span className="s">"@tabpay/sdk"</span>;{"\n\n"}
<span className="k">const</span> tab = <span className="k">new</span> Tab({"{"}{"\n"}
{"  "}credential: process.env.TAB_CREDENTIAL,{"\n"}
{"  "}maxPayment: <span className="s">"500000"</span>, <span className="c">// 0.50 USDC, client-side ceiling</span>{"\n"}
{"}"});{"\n\n"}
<span className="k">const</span> res = <span className="k">await</span> tab.fetch(<span className="s">"https://api.example.com/forecast"</span>);{"\n"}
<span className="c">// 402 → checked → signed → paid → 200</span>
        </code></pre>
      </section>

      <section className="wrap section">
        <h2 className="d2" style={{ marginBottom: "clamp(40px,6vw,88px)" }}>Questions</h2>
        <div className="faq">
          {[
            ["What happens if TAB goes down?", "Your agent can't pay until it's back. Your funds don't move: they're in your own token account, and you can revoke TAB's permission or close the account from your wallet without us."],
            ["What does it cost?", "0.20 USDC each time you open a tab, taken in the same signature, so you see it before you sign. Payments carry no TAB fee, and their network fees are paid by the service's x402 facilitator. The tab account also holds about 0.002 SOL of rent, which comes back when you close it."],
            ["Which tokens and wallets?", "USDC on Solana. Any Wallet Standard wallet works, including Phantom, Solflare and Backpack. Signing in is a message signature, never a transaction."],
            ["Can a payment go through twice?", "No. Every request carries an idempotency key. Repeating a key returns the original signed payment, which can only land on chain once."],
            ["How does TAB know a payment really settled?", "It reads the chain. A payment counts as spent only when a transaction with TAB's signature is confirmed. If a signed payment never lands, its hold is released once its blockhash expires."],
            ["Has TAB been audited?", "Not yet by a third party. The limit is enforced twice: by TAB's ledger, tested under fifty concurrent payments, and by the SPL Token program's allowance on chain, which TAB can't override."],
          ].map(([q, a]) => (
            <details key={q}><summary><span>{q}</span><i aria-hidden="true" /></summary><p>{a}</p></details>
          ))}
        </div>
      </section>

      <section className="wrap section closing">
        <h2 className="d1">Open a <em>tab.</em></h2>
        <div className="cta-row"><a className="btn primary" href="/app" data-nav>Connect wallet</a><a className="btn" href="/docs" data-nav>Read the docs</a></div>
      </section>

      <Footer />
    </div>
  );
}
