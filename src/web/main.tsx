import { StrictMode, useEffect, useState, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { Landing } from "./site/Landing";
import { TopBar } from "./components/Chrome";
import { Loader } from "./components/Loader";

// Code-split pages. If a chunk can't load (usually a tab left open across a deploy, so the old file is
// gone), reload once to pick up the new build instead of hanging on the loader.
function page<T>(load: () => Promise<T>) {
  return () => load().catch((e) => {
    let tried = false;
    try { tried = sessionStorage.getItem("tab.reloaded") === "1"; sessionStorage.setItem("tab.reloaded", "1"); } catch {}
    if (!tried) location.reload();
    throw e;
  });
}
const loadDashboard = page(() => import("./app/Dashboard"));
const loadDocs = page(() => import("./site/Docs"));
const Dashboard = lazy(() => loadDashboard().then((m) => ({ default: m.Dashboard })));
const Docs = lazy(() => loadDocs().then((m) => ({ default: m.Docs })));
// Fetch the other pages quietly once the first one is up, so clicking through is instant.
const idle = (fn: () => void) => ("requestIdleCallback" in window ? (window as any).requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 1500));
idle(() => { loadDashboard().catch(() => {}); loadDocs().catch(() => {}); });
try { sessionStorage.removeItem("tab.reloaded"); } catch {}

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
    document.documentElement.classList.toggle("home", path === "/");
  }, [path]);
  const view = path.startsWith("/app") ? <Dashboard /> : path.startsWith("/docs") ? <Docs /> : <Landing />;
  return <Suspense fallback={<><TopBar current={path.startsWith("/app") ? "app" : path.startsWith("/docs") ? "docs" : undefined} /><Loader label="Loading" /></>}>{view}</Suspense>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
