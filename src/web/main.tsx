import { StrictMode, useEffect, useState, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { Landing } from "./site/Landing";
import { Grain } from "./components/Chrome";

const Dashboard = lazy(() => import("./app/Dashboard").then((m) => ({ default: m.Dashboard })));
const Docs = lazy(() => import("./site/Docs").then((m) => ({ default: m.Docs })));

export function navigate(to: string) {
  if (to === location.pathname + location.hash) return;
  history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
  if (!to.includes("#")) window.scrollTo(0, 0);
}

function usePath() {
  const [p, setP] = useState(location.pathname);
  useEffect(() => {
    const on = () => setP(location.pathname);
    addEventListener("popstate", on);
    // Internal links: <a data-nav href="/app">
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a[data-nav]") as HTMLAnchorElement | null;
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      navigate(a.getAttribute("href")!);
    };
    document.addEventListener("click", click);
    return () => { removeEventListener("popstate", on); document.removeEventListener("click", click); };
  }, []);
  return p;
}

function App() {
  const path = usePath();
  useEffect(() => {
    document.title = path.startsWith("/app") ? "TAB · Dashboard" : path.startsWith("/docs") ? "TAB · Docs" : "TAB · Spending limits for AI agents";
  }, [path]);
  const page = path.startsWith("/app") ? <Dashboard /> : path.startsWith("/docs") ? <Docs /> : <Landing />;
  return <Suspense fallback={<div className="wrap" style={{ paddingBlock: 120 }}><span className="label">Loading…</span></div>}>{page}</Suspense>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><Grain /><App /></StrictMode>);
