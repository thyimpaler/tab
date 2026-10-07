import { useRef, useState } from "react";
import { useInView } from "./scroll";

// Non-custodial, shown rather than told: pull TAB's plug and see what still works.
export function Custody() {
  const box = useRef<HTMLDivElement>(null);
  const [off, setOff] = useState(false);
  useInView(box, undefined, 0.2);
  return (
    <div className={`plug${off ? " off" : ""}`} ref={box}>
      <div className="plug-map" role="img" aria-label={off
        ? "TAB is offline: the agent can't pay, and your wallet can still revoke or close the tab."
        : "Your wallet funds a tab account you own; TAB may sign payments from it up to the limit to x402 services."}>
        <div className="pn you">
          <span className="tag">You own</span>
          <strong>Your wallet</strong>
          <span className="small">signs once to fund</span>
        </div>
        <div className="pl l1"><span>funds once</span><i /></div>
        <div className="pn tab">
          <span className="tag">You own</span>
          <strong>The tab</strong>
          <span className="small">3.10 USDC · owner: you</span>
          <span className="signer">{off ? "TAB offline · can't sign" : "TAB may sign ≤ limit"}</span>
        </div>
        <div className="pl l2"><span>{off ? "no payments" : "pays per request"}</span><i /></div>
        <div className="pn svc">
          <span className="tag">Paid per request</span>
          <strong>x402 services</strong>
          <span className="small">APIs, models, data</span>
        </div>
        <div className="plug-back"><span>revoke · close · withdraw, straight from your wallet</span></div>
      </div>
      <div className="plug-ctl">
        <label className="switch">
          <input type="checkbox" checked={off} onChange={(e) => setOff(e.target.checked)} />
          <span className="track" aria-hidden="true"><i /></span>
          <span>Pull TAB's plug</span>
        </label>
        <p aria-live="polite">{off
          ? "Your agent can't pay until TAB is back. The 3.10 is still in your account, and your wallet can revoke or close it without us."
          : "Flip it to see what happens if TAB disappears tomorrow."}</p>
      </div>
    </div>
  );
}
