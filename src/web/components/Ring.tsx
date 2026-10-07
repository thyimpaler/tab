import type { CSSProperties, ReactNode } from "react";

/** The tab, drawn as a chrome ring. `spent` and `held` are fractions of the limit (0..1). */
export function Ring({ spent, held = 0, value, sub, void: isVoid, turn = 0, className, label }: {
  spent: number; held?: number; value?: ReactNode; sub?: ReactNode; void?: boolean; turn?: number; className?: string; label?: string;
}) {
  const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
  const style = { "--spent": clamp(spent), "--held": clamp(held), "--turn": `${turn}deg` } as CSSProperties;
  return (
    <div className={`ring-box${isVoid ? " void" : ""}${className ? " " + className : ""}`} style={style} role={label ? "img" : undefined} aria-label={label}>
      <div className="ring" /><div className="groove" /><div className="hold" /><div className="arc" />
      {(value !== undefined || sub !== undefined) && (
        <div className="readout">{value !== undefined && <strong>{value}</strong>}{sub !== undefined && <span>{sub}</span>}</div>
      )}
    </div>
  );
}
