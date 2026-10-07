# TAB

Spending limits for AI agents. A tab is a capped, expiring, revocable USDC allowance on Solana that an agent spends over x402 without ever holding a wallet key. The brand is a **bar tab, printed**: you open it with a limit, the agent runs it up line by line, you close it out.

## The idea in one picture

A thermal receipt printing as an agent spends. Everything in the system comes from that object: cool paper, carbon ink, monospaced lines with tabular figures, dashed tear lines, a zig-zag torn edge, and a rubber stamp in red that lands when a tab is closed or a payment is refused.

When something is happening live (an agent running, a payment being checked) the page switches to **carbon**: an inverted panel, like the terminal the agent runs in.

## Voice

- Short, declarative, specific. Say what happens: "Revoke from the dashboard and signing stops at once."
- Use words people recognise: *tab*, *limit*, *key*, *close it out*. Save *delegate*, *allowance* and *token account* for the docs.
- Promise only what the code enforces. "It can't spend past the limit" is true twice over (TAB's ledger and the SPL allowance), so we say it plainly.
- Errors name the cause and the fix: "Not enough left on this tab for this payment." No apologies.
- No em dashes in marketing copy, no buzzwords, no exclamation marks.

From the site:

> Put your agent on a tab.
> Hand the agent a key, not a wallet.
> Five checks. Every payment.
> Your money never leaves you.

## Colour

Near-monochrome on purpose. `paper` and `ink` carry the page; `ink-2` and `rule` give hierarchy.

**`stamp` is the only accent, and it always means something:** a limit, a refusal, VOID or CLOSED, a destructive action. If you're reaching for red to decorate, use weight or size instead. One stamp-red word per headline at most (the hero's "TAB.").

`carbon` panels hold live agent activity and code. On carbon, refusals use `carbon-stamp`; everything else is `carbon-ink` or `carbon-dim`. `ok` is semantic only.

Light only, by design: it's paper.

## Type

- **Display: Anybody**, condensed (width 58 to 64%), weight 800, uppercase, set big and tight (`display-1` up to 184px at line-height 0.86). Word spacing is widened slightly (`.06em`) so condensed caps don't fuse.
- **Body: Schibsted Grotesk**, 400 and 600. Ledes at 20px, 46 characters wide.
- **Mono: Martian Mono** for receipts, consoles, labels and buttons. Always `font-variant-numeric: tabular-nums` where figures line up.

All three come from Google Fonts: `Anybody:wdth,wght@50..150,700..900`, `Martian Mono:wght@400;700`, `Schibsted Grotesk:wght@400;500;600`.

## Layout

- Wide gutters (`space-3` to `space-6`) and very large gaps between sections (112px to `space-8`). Resist closing them.
- **Ruled rows, not cards.** A list is a 1.5px ink top rule, then rows split by 1px `rule` hairlines. The row itself is the hover surface: it slides 12px right.
- Numbering (01, 02…) only where order is real: the four steps, and the five checks, which run in that order.
- Square everything (`radius-none`). No shadows except `shadow-receipt`.

## Motion

One easing for everything, `cubic-bezier(0.22, 1, 0.36, 1)`, with long durations (0.6 to 1s). Headline words rise inside their own masks, receipt lines print left to right, and the stamp drops in with a slight overshoot. Everything rests fully visible and switches off under `prefers-reduced-motion`.

## Iconography

None. TAB uses type, rules and the stamp instead of icons. The only glyphs are ✓ in consoles and → in flows. The favicon is the wordmark box.

## Components

Receipt, Console, Button, Ruled list, Chip and Notice. Each has guidelines and a live preview. The production CSS lives in the TAB repo at `src/web/styles.css`; `components/bundle.css` here is the same rules, trimmed to these components.

## Never

Gradients, glows, orbs, pulsing "live" dots, emoji, rounded cards, uniform card grids, purple, a second accent, cream paper, typing effects.
