import { useRef } from "react";
import { useInView } from "./scroll";

// What tab.fetch does on the wire, step by step. Replays each time it scrolls into view.
const WIRE = [
  { who: "agent → service", req: "GET /forecast", res: "402 Payment Required", d: "PAYMENT-REQUIRED · 0.05 USDC to the service" },
  { who: "agent → tab", req: "POST /v1/pay", res: "5 of 5 checks", d: "the delegate signs · the agent never sees a key" },
  { who: "agent → service", req: "GET /forecast", res: "200 OK", d: "PAYMENT-SIGNATURE in · PAYMENT-RESPONSE out" },
  { who: "tab ← chain", req: "confirm", res: "settled", d: "counted as spent only once it lands" },
];

export function Wire() {
  const box = useRef<HTMLOListElement>(null);
  useInView(box, undefined, 0.4);
  return (
    <ol className="wire" ref={box} aria-label="What happens on the wire">
      {WIRE.map((w, i) => (
        <li key={i} style={{ transitionDelay: `${0.15 + i * 0.35}s` }}>
          <span className="n">{String(i + 1).padStart(2, "0")}</span>
          <span className="who">{w.who}</span>
          <span className="req">{w.req}</span>
          <span className={`res${i === 0 ? " hot" : ""}`}>{w.res}</span>
          <span className="d">{w.d}</span>
        </li>
      ))}
    </ol>
  );
}
