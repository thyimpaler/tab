import { useCallback, useRef, type CSSProperties, type ReactNode } from "react";

// The limit dial: the tab's chrome ring, turned by hand. Value is in whole base units (string, bigint-safe).
// Mapping is logarithmic so small limits get fine control: 1 USDC at the top, `max` after a full turn.

const UNIT = 1_000_000n; // USDC base units

function niceStep(v: number) { return v < 10 ? 0.5 : v < 100 ? 1 : v < 500 ? 5 : 10; }

export function tToUnits(t: number, minUsd: number, maxUsd: number): string {
  const v = minUsd * Math.pow(maxUsd / minUsd, Math.max(0, Math.min(1, t)));
  const step = niceStep(v);
  const rounded = Math.min(maxUsd, Math.max(minUsd, Math.round(v / step) * step));
  return (BigInt(Math.round(rounded * 100)) * (UNIT / 100n)).toString();
}

export function unitsToT(units: string, minUsd: number, maxUsd: number): number {
  const v = Number(BigInt(units || "0")) / 1e6;
  if (!(v > 0)) return 0;
  return Math.max(0, Math.min(1, Math.log(v / minUsd) / Math.log(maxUsd / minUsd)));
}

export function Dial({ units, onChange, minUsd = 1, maxUsd = 1000, disabled, center, label }: {
  units: string; onChange: (u: string) => void; minUsd?: number; maxUsd?: number; disabled?: boolean;
  center: ReactNode; label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const last = useRef(unitsToT(units, minUsd, maxUsd));
  const t = unitsToT(units, minUsd, maxUsd);

  const fromPointer = useCallback((x: number, y: number) => {
    const el = box.current; if (!el) return;
    const r = el.getBoundingClientRect();
    let a = Math.atan2(x - (r.left + r.width / 2), -(y - (r.top + r.height / 2))) / (2 * Math.PI);
    if (a < 0) a += 1;
    // No wrapping across the top: past full it stays full, back past zero it stays at the minimum.
    if (last.current > 0.75 && a < 0.25) a = 1;
    else if (last.current < 0.25 && a > 0.75) a = 0;
    last.current = a;
    onChange(tToUnits(a, minUsd, maxUsd));
  }, [onChange, minUsd, maxUsd]);

  function down(e: React.PointerEvent) {
    if (disabled) return;
    last.current = t;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic or stale pointer */ }
    box.current?.classList.add("dragging");
    fromPointer(e.clientX, e.clientY);
  }
  function move(e: React.PointerEvent) {
    if (disabled || !box.current?.classList.contains("dragging")) return;
    fromPointer(e.clientX, e.clientY);
  }
  function up() { box.current?.classList.remove("dragging"); }
  function key(e: React.KeyboardEvent) {
    if (disabled) return;
    const v = Number(BigInt(units || "0")) / 1e6;
    const step = niceStep(v) * (e.shiftKey ? 10 : 1);
    let next: number | null = null;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") next = v + step;
    if (e.key === "ArrowDown" || e.key === "ArrowLeft") next = v - step;
    if (e.key === "Home") next = minUsd;
    if (e.key === "End") next = maxUsd;
    if (next === null) return;
    e.preventDefault();
    const clamped = Math.min(maxUsd, Math.max(minUsd, next));
    onChange((BigInt(Math.round(clamped * 100)) * (UNIT / 100n)).toString());
  }

  return (
    <div
      ref={box}
      className={`dial${disabled ? " is-disabled" : ""}`}
      style={{ "--t": t } as CSSProperties}
      role="slider" tabIndex={disabled ? -1 : 0} aria-label={label}
      aria-valuemin={minUsd} aria-valuemax={maxUsd} aria-valuenow={Number(BigInt(units || "0")) / 1e6}
      aria-valuetext={`${(Number(BigInt(units || "0")) / 1e6).toFixed(2)} USDC`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}
    >
      <div className="dial-ticks" aria-hidden="true" />
      <div className="ring-box" style={{ "--spent": t } as CSSProperties}>
        <div className="ring" /><div className="groove" /><div className="arc" />
      </div>
      <div className="dial-knob" aria-hidden="true"><i /></div>
      <div className="dial-center">{center}</div>
    </div>
  );
}
