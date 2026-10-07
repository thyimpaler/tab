import { useEffect, useRef, useState } from "react";
import { TopBar, Footer } from "../components/Chrome";
import { Ring } from "../components/Ring";
import { Console, type LogLine } from "../components/Console";
import { SIM_CALLS, SIM_LIMIT, fakeSig, reducedMotion, usdc } from "../components/sim";

// Hero timeline: a scripted agent session that scrolling plays forward and backward.
// Integers in micro-USDC; refused calls never move the ring.
const HERO_CALLS: [string, number, string?][] = [
  ["api.pricefeed.dev/quote", 10_000], ["search.lens.ai/query", 50_000], ["scrape.page/run", 250_000],
  ["llm.gateway/chat · 12k tok", 420_000], ["data.vendor/bulk-export", 2_400_000, "over the 0.50 cap"],
  ["llm.gateway/chat · 40k tok", 480_000], ["unknown-host.xyz/drain", 100_000, "not on allowlist"],
  ["render.cloud/job", 1_150_000, "over the 0.50 cap"], ["llm.gateway/chat · 90k tok", 500_000],
  ["vision.api/describe", 490_000], ["search.lens.ai/query", 50_000], ["llm.gateway/chat · 80k tok", 500_000],
  ["tts.voice/render", 500_000], ["llm.gateway/chat · 60k tok", 500_000], ["scrape.page/run", 300_000],
  ["llm.gateway/chat · 99k tok", 500_000],
];
const TIMELINE = (() => {
  let s = 0;
  return HERO_CALLS.map(([u, a, why]) => {
    let r = why;
    if (!r && s + a > SIM_LIMIT) r = "over the limit";
    if (!r) s += a;
    return { u, a, r, spent: s };
  });
})();

function Hero() {
  const stage = useRef<HTMLElement>(null);
  const [idx, setIdx] = useState(-1);
  const [p, setP] = useState(0);

  useEffect(() => {
    const root = document.querySelector(".landing") as HTMLElement | null;
    let raf = 0;
    const frame = () => {
      raf = 0;
      const el = stage.current; if (!el || !root) return;
      const r = el.getBoundingClientRect();
      const prog = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)));
      // Background crosses mid-grey fast so text never sits on it for long.
      const t = Math.min(1, Math.max(0, (prog - 0.3) / 0.25)), bg = t * t * (3 - 2 * t);
      root.style.setProperty("--p", prog.toFixed(4));
      root.style.setProperty("--bg", bg.toFixed(4));
      // Once the stage starts scrolling away, fade its bottom-edge text so it never slides under the nav.
      const exit = Math.min(1, Math.max(0, (innerHeight - r.bottom) / (innerHeight * 0.3)));
      root.style.setProperty("--exit", exit.toFixed(4));
      root.classList.toggle("dark", bg > 0.5);
      setP(prog);
      setIdx(Math.min(TIMELINE.length - 1, Math.floor(prog * 1.12 * TIMELINE.length) - 1));
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(frame); };
    frame();
    addEventListener("scroll", on, { passive: true });
    addEventListener("resize", on);
    return () => { removeEventListener("scroll", on); removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, []);

  const spent = idx < 0 ? 0 : TIMELINE[idx].spent;
  const recent = TIMELINE.slice(Math.max(0, idx - 4), idx + 1);

  return (
    <section className="stage" ref={stage} aria-label="TAB: give your agent a capped USDC allowance">
      <div className="sticky">
        <div className="hero-copy">
          <div>
            <h1 className="h1">Give your agent<br />a tab. <span className="mute">Not<br />your wallet.</span></h1>
            <div className="cta">
              <a className="pill dark" href="/app" data-nav>Open a tab <b aria-hidden="true">›</b></a>
            </div>
          </div>
          <p className="lede">TAB lets an AI agent pay for APIs in USDC on Solana, up to a limit you set. <span className="mute">It stops at the cap, it expires on its own, and the money stays in an account your wallet owns.</span></p>
        </div>
        <div className="hero-ring" aria-hidden="true">
          <Ring spent={spent / SIM_LIMIT} turn={p * 140} value={usdc(SIM_LIMIT - spent, 2)} sub={<>USDC left <em>of {usdc(SIM_LIMIT, 2)}</em></>} />
        </div>
        <div className="feed" aria-hidden="true">
          {recent.map((t, i) => (
            <div key={`${idx}-${i}`} className={t.r ? "no" : ""}>{t.r ? "refused" : "paid   "}  {usdc(t.a)}  {t.u}{t.r ? `  · ${t.r}` : ""}</div>
          ))}
        </div>
        <div className="lock" aria-hidden="true"><i />limit reached · nothing more signed</div>
      </div>
    </section>
  );
}

const CHECKS = [
  { k: "status", h: "The tab is open", p: "Revoked, closed or not yet funded means no. Revoking takes effect on the next request." },
  { k: "expires_at", h: "It hasn't expired", p: "Every tab has an end date. Past it, nothing is signed and the tab marks itself expired." },
  { k: "per_payment_cap", h: "The bill is under the cap", p: "A runaway loop can't empty the tab in one call. Anything above the cap is refused before signing." },
  { k: "allowlist", h: "The service is allowed", p: "Lock a tab to the services you trust. Leave it empty and any x402 service can be paid." },
  { k: "limit", h: "There's room left", p: "Spent plus in-flight can never pass the limit, even with fifty requests at once. The chain enforces the same ceiling." },
];

function ChecksConsole() {
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
      const head: LogLine = { kind: "ok", text: <><span className="dim">GET </span>{c.url}<span className="dim"> → 402 </span>{usdc(c.amount)}</> };
      const tail: LogLine = refuse
        ? { kind: "no", text: `  refused: ${refuse}. nothing signed.` }
        : { kind: "dim", text: `  open ✓ in date ✓ cap ✓ allowed ✓ room ✓  signed · settled ${fakeSig()}…` };
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
  useEffect(() => {
    const el = box.current; if (!el) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && !started.current) { started.current = true; run(); } }, { threshold: 0.3 });
    io.observe(el);
    return () => { io.disconnect(); runId.current++; started.current = false; };
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
  // Arriving at /#how from another page: the section only exists after render, so jump to it then.
  useEffect(() => {
    const id = location.hash.slice(1);
    if (!/^[a-z-]+$/.test(id)) return;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
  }, []);
  return (
    <div className="landing">
      <TopBar current="home" blend />
      <Hero />
      <main>
        <section className="panel" id="how">
          <div className="panel-head">
            <div><div className="eyebrow">How it works</div><h2 className="h2">Four steps. <span className="mute">One signature.</span></h2></div>
            <p className="lede muted">Open it once, hand the agent a key, and let it pay as it goes. Close it whenever you like.</p>
          </div>
          <div className="steps">
            <div className="step"><span className="n">01</span><span className="k">limit · cap · expiry</span><h3 className="h3">Open a tab</h3><p>Set a limit, a max per payment and an end date. One wallet signature funds an account you own.</p></div>
            <div className="step"><span className="n">02</span><span className="k">tab_live_…</span><h3 className="h3">Give the agent a key</h3><p>It can ask TAB to pay. It never holds a wallet key and can't move funds itself.</p></div>
            <div className="step"><span className="n">03</span><span className="k">HTTP 402 → paid</span><h3 className="h3">It pays as it goes</h3><p>Every x402 bill is checked against your rules, then signed. Anything over the line is refused.</p></div>
            <div className="step"><span className="n">04</span><span className="k">revoke · reclaim</span><h3 className="h3">Close it out</h3><p>Revoke in one click. Whatever's left goes back to your wallet, rent included.</p></div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div><div className="eyebrow">Every payment</div><h2 className="h2">Five checks. <span className="mute">In this order.</span></h2></div>
            <p className="lede muted">Before anything is signed. A failed check returns a typed error to the agent and signs nothing.</p>
          </div>
          <div className="checks-grid">
            <ol className="checks">
              {CHECKS.map((c, i) => (
                <li key={c.k}><span className="n">{String(i + 1).padStart(2, "0")}</span><h3 className="h3">{c.h}</h3><span className="k">{c.k}</span><p>{c.p}</p></li>
              ))}
            </ol>
            <ChecksConsole />
          </div>
        </section>

        <section className="panel light">
          <div className="panel-head">
            <div><div className="eyebrow">Non-custodial</div><h2 className="h2">Your money never leaves you.</h2></div>
            <p className="lede">The funds sit in a token account your wallet owns. <span className="mute">TAB holds a capped permission to spend from it, nothing more.</span></p>
          </div>
          <div className="custody" role="img" aria-label="Your wallet funds a tab account you own; TAB may spend up to the limit from it to x402 services.">
            <div className="node"><span className="tag">You own</span><strong>Your wallet</strong><span className="small">USDC</span><span className="edge">→ funds the tab once</span></div>
            <div className="node mid"><span className="tag">You own</span><strong>The tab</strong><span className="small">limit 5.00 · owner: you</span><span className="edge">→ TAB may spend ≤ limit</span></div>
            <div className="node"><span className="tag">Paid per request</span><strong>x402 services</strong><span className="small">APIs, models, data</span></div>
          </div>
          <div className="cando">
            <div><div className="eyebrow">TAB can</div><ul>
              <li>Sign payments from the tab, up to what's left of the limit</li>
              <li>Refuse any payment that breaks one of the five checks</li>
              <li>Stop signing the moment you revoke</li>
            </ul></div>
            <div><div className="eyebrow accent-text">TAB can't</div><ul>
              <li>Touch anything else in your wallet</li>
              <li>Spend past the limit. The SPL Token program blocks it on chain</li>
              <li>Stop you revoking or closing straight from your wallet, even if TAB is down</li>
            </ul></div>
          </div>
        </section>

        <section className="panel sdk">
          <div>
            <div className="eyebrow">For builders</div>
            <h2 className="h2" style={{ marginTop: 16 }}>Three lines <span className="mute">in your agent.</span></h2>
            <p className="lede muted" style={{ marginTop: 24 }}>Swap <code>fetch</code> for <code>tab.fetch</code>. Free requests pass straight through. Paid ones are handled, inside the rules.</p>
            <div style={{ marginTop: 28 }}><a className="pill" href="/docs#sdk" data-nav>SDK reference <b aria-hidden="true">›</b></a></div>
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

        <section className="panel">
          <div className="panel-head"><div><div className="eyebrow">Questions</div><h2 className="h2">Before you open one.</h2></div></div>
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

        <section className="panel closing">
          <h2 className="h2">Put your agent <span className="mute">on a tab.</span></h2>
          <div className="row-wrap"><a className="pill" href="/app" data-nav>Open a tab <b aria-hidden="true">›</b></a><a className="btn" href="/docs" data-nav>Read the docs</a></div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
