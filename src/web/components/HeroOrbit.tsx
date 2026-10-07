import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { reducedMotion, usdc } from "./sim";

// The hero: a giant chrome ring (the tab) with the headline inside it. Payments orbit the top arc:
// paid chips sink into the ring and grow the coral arc; refused chips are thrown off in coral.
// All motion is transform/opacity via the Web Animations API; the arc repaints only when a payment lands.
// Pauses offscreen and in background tabs; reduced motion shows a still frame.

const LIMIT = 5_000_000;
const FLOW: { h: string; a: number; r?: string }[] = [
  { h: "pricefeed.dev/quote", a: 10_000 },
  { h: "lens.ai/search", a: 50_000 },
  { h: "scrape.page/run", a: 250_000 },
  { h: "data.vendor/export", a: 2_400_000, r: "over the 0.50 cap" },
  { h: "llm.gateway/chat", a: 420_000 },
  { h: "unknown.xyz/drain", a: 100_000, r: "not on the allowlist" },
  { h: "vision.api/describe", a: 490_000 },
  { h: "llm.gateway/chat", a: 480_000 },
  { h: "tts.voice/render", a: 500_000 },
  { h: "render.cloud/job", a: 1_150_000, r: "over the 0.50 cap" },
  { h: "llm.gateway/chat", a: 500_000 },
  { h: "scrape.page/run", a: 300_000 },
  { h: "llm.gateway/chat", a: 500_000 },
  { h: "lens.ai/search", a: 50_000 },
  { h: "llm.gateway/chat", a: 500_000 },
  { h: "vision.api/describe", a: 490_000 },
];

type Chip = { id: number; h: string; a: number; r?: string };

function OrbitChip({ chip, span, onDone }: { chip: Chip; span: number; onDone: (c: Chip) => void }) {
  const arm = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const a = arm.current, p = pill.current;
    if (!a || !p) return;
    let cancelled = false;
    const travel = a.animate(
      [{ transform: `rotate(${-span}deg)` }, { transform: `rotate(${span * 0.62}deg)` }],
      { duration: 2600, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" },
    );
    p.animate([{ opacity: 0, transform: "translate(-50%,-50%) scale(.6)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)" }], { duration: 500, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" });
    travel.finished.then(() => {
      if (cancelled) return;
      onDone(chip); // settle the money at the moment of landing
      const out = chip.r
        ? p.animate([{ transform: "translate(-50%,-50%)", opacity: 1 }, { transform: "translate(-30%,-320%) rotate(-14deg)", opacity: 0 }], { duration: 650, easing: "cubic-bezier(.2,.75,.25,1)", fill: "forwards" })
        : p.animate([{ transform: "translate(-50%,-50%) scale(1)", opacity: 1 }, { transform: "translate(-50%,10%) scale(.15)", opacity: 0 }], { duration: 380, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" });
      return out.finished;
    }).catch(() => {});
    return () => { cancelled = true; travel.cancel(); };
  }, [chip, span, onDone]);
  return (
    <div className="orbit-arm" ref={arm}>
      <div className={`orbit-chip${chip.r ? " refused" : ""}`} ref={pill}>
        <span>{chip.h}</span><b>{usdc(chip.a, 2)}</b>
      </div>
    </div>
  );
}

export function HeroOrbit() {
  const hero = useRef<HTMLElement>(null);
  const ringBox = useRef<HTMLDivElement>(null);
  const [spent, setSpent] = useState(0);
  const [chips, setChips] = useState<Chip[]>([]);
  const [status, setStatus] = useState<{ text: string; bad?: boolean }>({ text: "agent idle" });
  const [locked, setLocked] = useState(false);
  const [span, setSpan] = useState(48);
  const state = useRef({ i: 0, spent: 0, id: 0, running: false, timer: 0 as unknown as ReturnType<typeof setTimeout> });

  // How far along the top arc chips can travel and stay on screen.
  useEffect(() => {
    const fit = () => {
      const r = (ringBox.current?.offsetWidth ?? 800) / 2 * 0.89;
      const half = Math.max(80, innerWidth / 2 - 90);
      setSpan(Math.min(52, Math.asin(Math.min(1, half / r)) * 180 / Math.PI));
    };
    fit(); addEventListener("resize", fit); return () => removeEventListener("resize", fit);
  }, []);

  const land = useCallback((c: Chip) => {
    setChips((cs) => cs.filter((x) => x.id !== c.id));
    if (c.r) { setStatus({ text: `refused · ${c.h} · ${c.r}`, bad: true }); return; }
    state.current.spent += c.a;
    setSpent(state.current.spent);
    setStatus({ text: `paid ${usdc(c.a, 2)} · ${c.h}` });
  }, []);

  useEffect(() => {
    const st = state.current;
    const tick = () => {
      if (!st.running) return;
      const next = FLOW[st.i % FLOW.length];
      const wouldOverflow = !next.r && st.spent + next.a > LIMIT;
      if (wouldOverflow || st.i >= FLOW.length) {
        // Limit reached: hold, then empty the tab and go again.
        setLocked(true); setStatus({ text: "limit reached · nothing more signed", bad: true });
        st.timer = setTimeout(() => {
          st.i = 0; st.spent = 0; setSpent(0); setLocked(false); setStatus({ text: "new tab · 5.00 USDC" });
          st.timer = setTimeout(tick, 900);
        }, 3200);
        return;
      }
      st.i++;
      setChips((cs) => [...cs, { id: ++st.id, ...next }]);
      st.timer = setTimeout(tick, innerWidth < 700 ? 1700 : 1250);
    };
    const start = () => { if (!st.running && !reducedMotion()) { st.running = true; st.timer = setTimeout(tick, 1400); } };
    const stop = () => { st.running = false; clearTimeout(st.timer); };
    // Only run while visible: offscreen or background tab means fully parked.
    const io = new IntersectionObserver(([e]) => (e.isIntersecting && !document.hidden ? start() : stop()), { threshold: 0.15 });
    if (hero.current) io.observe(hero.current);
    const vis = () => (document.hidden ? stop() : hero.current && hero.current.getBoundingClientRect().bottom > 0 && start());
    document.addEventListener("visibilitychange", vis);
    if (reducedMotion()) { st.spent = 2_150_000; setSpent(st.spent); setStatus({ text: "paid 0.42 · llm.gateway/chat" }); }
    return () => { stop(); io.disconnect(); document.removeEventListener("visibilitychange", vis); };
  }, []);

  // Scroll out: the ring sinks back as the panels arrive (one CSS variable, transform/opacity only).
  useEffect(() => {
    const el = hero.current; if (!el) return;
    const nav = document.querySelector(".landing .top") as HTMLElement | null;
    let raf = 0, past = false;
    const frame = () => {
      raf = 0;
      const h = el.offsetHeight || innerHeight;
      const p = Math.min(1, Math.max(0, scrollY / h));
      el.style.setProperty("--hp", p.toFixed(3));
      if (p > 0.85 !== past) { past = p > 0.85; nav?.classList.toggle("past", past); }
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(frame); };
    frame(); addEventListener("scroll", on, { passive: true });
    return () => { removeEventListener("scroll", on); cancelAnimationFrame(raf); };
  }, []);

  return (
    <section className="hero" ref={hero} aria-label="TAB: give your agent a capped USDC allowance">
      <div className="hero-ringwrap" ref={ringBox}>
        <div className={`ring-box hero-big${locked ? " locked" : ""}`} style={{ "--spent": spent / LIMIT } as CSSProperties}>
          <div className="ring" /><div className="groove" /><div className="arc" />
        </div>
        <div className="orbit" aria-hidden="true">
          {chips.map((c) => <OrbitChip key={c.id} chip={c} span={span} onDone={land} />)}
        </div>
        <div className="hero-center">
          <div className="eyebrow">Spending limits for AI agents · USDC on Solana</div>
          <h1 className="hero-title">Give your agent a tab. <span>Not your wallet.</span></h1>
          <div className="hero-read" aria-live="off">
            <strong>{usdc(LIMIT - spent, 2)}</strong><span>USDC left of 5.00</span>
          </div>
          <div className={`hero-status${status.bad ? " bad" : ""}`} aria-hidden="true"><i />{status.text}</div>
          <div className="hero-cta">
            <a className="pill dark" href="/app" data-nav>Open a tab <b aria-hidden="true">›</b></a>
            <a className="btn ink" href="/#try" data-nav>Try it</a>
          </div>
        </div>
      </div>
    </section>
  );
}
