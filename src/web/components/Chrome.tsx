import type { ReactNode } from "react";

export function TopBar({ current, right }: { current?: "home" | "docs" | "app"; right?: ReactNode }) {
  return (
    <header className="top wrap">
      <a className="mark" href="/" data-nav aria-label="TAB home"><b>TAB</b></a>
      <nav aria-label="Main">
        <a className="hide-sm" href="/#how" data-nav>How it works</a>
        <a href="/docs" data-nav aria-current={current === "docs" ? "page" : undefined}>Docs</a>
        {right ?? <a className="btn small primary" href="/app" data-nav>Open a tab</a>}
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site wrap">
      <div>
        <a className="mark" href="/" data-nav><b>TAB</b></a>
        <p className="muted" style={{ margin: "14px 0 0", maxWidth: "38ch", fontSize: 14 }}>
          Spending limits for AI agents. USDC on Solana, paid over x402. Your funds stay in an account your wallet owns.
        </p>
      </div>
      <nav aria-label="Footer">
        <a href="/docs" data-nav>Docs</a>
        <a href="/docs#sdk" data-nav>SDK</a>
        <a href="/docs#errors" data-nav>Error codes</a>
        <a href="/app" data-nav>Dashboard</a>
        <a href="https://x402.org" target="_blank" rel="noreferrer">x402</a>
      </nav>
    </footer>
  );
}
