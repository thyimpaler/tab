import { useEffect, useRef, type ReactNode } from "react";

export type LogLine = { kind?: "dim" | "no" | "ok"; text: ReactNode };

/** Carbon console: anything an agent does live. */
export function Console(props: {
  title: ReactNode; status: ReactNode; balance: ReactNode; balanceNote: ReactNode;
  lines: LogLine[]; actions?: ReactNode; height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [props.lines.length]);
  return (
    <div className="console">
      <div className="bar"><span>{props.title}</span><span>{props.status}</span></div>
      <div className="bal"><strong>{props.balance}</strong><span className="dim" style={{ textAlign: "right", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" }}>{props.balanceNote}</span></div>
      <div className="log" ref={ref} style={props.height ? { height: props.height } : undefined} role="log" aria-live="polite">
        {props.lines.map((l, i) => <div key={i} className={l.kind ?? ""}>{l.text}</div>)}
      </div>
      {props.actions && <div className="foot">{props.actions}</div>}
    </div>
  );
}
