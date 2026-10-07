import { useEffect, useRef, type RefObject } from "react";

/** Runs `fn` once per animation frame while `ref` is scrolling near the viewport, and parks otherwise.
 *  `fn` should only write CSS variables or flip classes (no React renders per frame). */
export function useScrollFrame(ref: RefObject<HTMLElement | null>, fn: (r: DOMRect, vh: number, el: HTMLElement) => void) {
  const cb = useRef(fn);
  cb.current = fn;
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let raf = 0, on = false;
    const frame = () => { raf = 0; cb.current(el.getBoundingClientRect(), innerHeight, el); };
    const req = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting === on) return;
      on = e.isIntersecting;
      if (on) { addEventListener("scroll", req, { passive: true }); addEventListener("resize", req); }
      else { removeEventListener("scroll", req); removeEventListener("resize", req); }
      req(); // one last frame on the way out so fast scrolls still land on the end state
    }, { rootMargin: "25% 0px" });
    io.observe(el);
    req();
    return () => { io.disconnect(); removeEventListener("scroll", req); removeEventListener("resize", req); cancelAnimationFrame(raf); };
  }, [ref]);
}

/** Toggles `.inview` on the element (both ways), so CSS sequences replay on re-entry and loops park offscreen. */
export function useInView(ref: RefObject<HTMLElement | null>, onEnter?: () => void, threshold = 0.3) {
  const cb = useRef(onEnter);
  cb.current = onEnter;
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      el.classList.toggle("inview", e.isIntersecting);
      if (e.isIntersecting) cb.current?.();
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold]);
}

export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
