import type { ReactNode } from "react";

export function TopBar({ current, right, blend }: { current?: "home" | "docs" | "app"; right?: ReactNode; blend?: boolean }) {
  return (
    <header className={`top ${blend ? "blend" : "solid"}`}>
      <a className="mark" href="/" data-nav aria-label="TAB home">tab</a>
      <nav aria-label="Main">
        <a className="hide-sm" href="/#how" data-nav>How it works</a>
        <a href="/docs" data-nav aria-current={current === "docs" ? "page" : undefined}>Docs</a>
        {right ?? <a href="/app" data-nav aria-current={current === "app" ? "page" : undefined}>Dashboard</a>}
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
          <a href="https://x402.org" target="_blank" rel="noreferrer">x402</a>
        </nav>
      </div>
      <div className="wordmark" aria-hidden="true">tab</div>
    </footer>
  );
}
