import type { ReactNode } from "react";
import { X_URL } from "../lib/links";

function XLogo() {
  return <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="currentColor"><path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.32l4.37 5.78L17.75 3Zm-1.08 16.17h1.7L7.4 4.73H5.58l11.09 14.44Z"/></svg>;
}

/** Round icon link to TAB on X. */
export function XButton() {
  return <a className="xbtn" href={X_URL} target="_blank" rel="noreferrer" aria-label="TAB on X"><XLogo /></a>;
}

export function TopBar({ current, right, blend }: { current?: "home" | "docs" | "app"; right?: ReactNode; blend?: boolean }) {
  return (
    <header className={`top ${blend ? "blend" : "solid"}`}>
      <a className="mark" href="/" data-nav aria-label="TAB home"><img src="/logo-mark.png" alt="" width={30} height={30} />tab</a>
      <nav aria-label="Main">
        <a className="hide-sm" href="/#how" data-nav>How it works</a>
        <a className="hide-sm" href="/#ca" data-nav>CA</a>
        <a href="/docs" data-nav aria-current={current === "docs" ? "page" : undefined}>Docs</a>
        {right ?? <a href="/app" data-nav aria-current={current === "app" ? "page" : undefined}>Dashboard</a>}
        <XButton />
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site">
      <div className="row">
        <span>Spending limits for AI agents. USDC on Solana, over x402.</span>
        <nav aria-label="Footer">
          <a href="/docs" data-nav>Docs</a>
          <a href="/docs#sdk" data-nav>SDK</a>
          <a href="/docs#errors" data-nav>Error codes</a>
          <a href="/app" data-nav>Dashboard</a>
          <a href="/#ca" data-nav>CA</a>
          <a href="https://x402.org" target="_blank" rel="noreferrer">x402</a>
          <a href={X_URL} target="_blank" rel="noreferrer">X</a>
        </nav>
      </div>
      <div className="wordmark" aria-hidden="true">tab</div>
    </footer>
  );
}
