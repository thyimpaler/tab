import { useEffect } from "react";
import { TopBar, Footer } from "../components/Chrome";
import { HeroOrbit } from "../components/HeroOrbit";
import { TryIt } from "../components/TryIt";
import { reducedMotion } from "../components/sim";

const CHECKS = [
  { k: "status", h: "The tab is open", p: "Revoked, closed or not yet funded means no. Revoking takes effect on the next request." },
  { k: "expires_at", h: "It hasn't expired", p: "Every tab has an end date. Past it, nothing is signed and the tab marks itself expired." },
  { k: "per_payment_cap", h: "The bill is under the cap", p: "A runaway loop can't empty the tab in one call. Anything above the cap is refused before signing." },
  { k: "allowlist", h: "The service is allowed", p: "Lock a tab to the services you trust. Leave it empty and any x402 service can be paid." },
  { k: "limit", h: "There's room left", p: "Spent plus in-flight can never pass the limit, even with fifty requests at once. The chain enforces the same ceiling." },
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

        <section className="panel" id="try">
          <div className="panel-head">
            <div><div className="eyebrow">Try it</div><h2 className="h2">Turn the ring. <span className="mute">Then let it spend.</span></h2></div>
            <p className="lede muted">Set a limit and a cap, then run a pretend agent against them. Watch what gets paid and what gets refused.</p>
          </div>
          <TryIt />
        </section>

        <section className="panel">
          <div className="panel-head">
            <div><div className="eyebrow">Every payment</div><h2 className="h2">Five checks. <span className="mute">In this order.</span></h2></div>
            <p className="lede muted">Before anything is signed. A failed check returns a typed error to the agent and signs nothing.</p>
          </div>
          <ol className="checks wide">
              {CHECKS.map((c, i) => (
                <li key={c.k}><span className="n">{String(i + 1).padStart(2, "0")}</span><h3 className="h3">{c.h}</h3><span className="k">{c.k}</span><p>{c.p}</p></li>
              ))}
          </ol>
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
