import { useEffect, useState } from "react";

/** Full-area loading state: the ring with its arc turning. Says so when the server is slow to wake. */
export function Loader({ label = "Checking your session", full = true }: { label?: string; full?: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 4000); return () => clearTimeout(t); }, []);
  return (
    <div className={`boot${full ? " full" : ""}`} role="status" aria-live="polite">
      <div className="boot-ring" aria-hidden="true">
        <div className="ring-box"><div className="ring" /><div className="groove" /><div className="arc" /></div>
      </div>
      <span>{slow ? "Waking the server, one moment" : label}</span>
    </div>
  );
}
