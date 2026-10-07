# TAB

Spending limits for AI agents. A tab is a capped, expiring, revocable USDC allowance on Solana that an agent spends over x402 without ever holding a wallet key.

## The idea in one object

**A chrome ring is the tab.** The ring is the limit; the coral arc is what's been spent; the number in the middle is what's left. On the landing page, scrolling *is* an agent spending: the arc sweeps round, refused payments flash in the feed, and at the end the ring locks at "limit reached". Scroll back and it rewinds. The same ring shows every real tab in the dashboard, small on the list, large on the tab page.

Around it: a grainy stone surface that darkens to graphite as you scroll, then graphite with soft rounded panels. Quiet type, one accent, no decoration.

## Voice

- Short, declarative, specific. Say what happens: "Revoke in one click. Whatever's left goes back to your wallet."
- Use words people recognise: *tab*, *limit*, *key*, *close it out*. Save *delegate*, *allowance* and *token account* for the docs.
- A headline is a plain statement followed by a muted second beat: "Four steps. *One signature.*"
- Promise only what the code enforces. "It can't spend past the limit" is true twice over (TAB's ledger and the SPL allowance).
- Errors name the cause and the fix: "Not enough left on this tab for this payment." No apologies, no em dashes, no exclamation marks.

From the site:

> Give your agent a tab. Not your wallet.
> Five checks. In this order.
> Your money never leaves you.

## Colour

Near-monochrome. `stone` and `graphite` are the two grounds; `paper` and `paper-2` carry text on graphite, `ink` and `ink-2` on stone.

**`accent` (coral) is the only colour, and it always means a limit, a refusal or a destructive action:** the spent arc, "refused" lines, "Revoke tab", the `TAB can't` label. On light stone panels use `accent-deep`, because plain coral is too faint for small text there. `ok` (soft green) appears only on settled payment states.

The site is one committed look (dark UI after a light hero), not a light/dark theme pair.

## Type

- **Display: Funnel Display**, 400, set tight (`-0.035em`, line-height 0.92–0.95). Headlines top out around 6.6rem; the size comes from the page, not from shouting.
- **Body: Funnel Sans**, 400/500. Ledes at about 1.2rem, 34 characters wide, second sentence muted.
- **Mono: Geist Mono** for balances, labels, eyebrows and code. Always tabular figures.

All from Google Fonts: `Funnel Display:wght@300..800`, `Funnel Sans:wght@300..800`, `Geist Mono:wght@400;500`.

## Layout

- Panels, not cards in a grid: one rounded panel (`radius-panel`) per idea, stacked with small gaps, each with an eyebrow, a headline and a muted lede on the right.
- Inside panels, lists are ruled (hairline `line`), numbered only when order is real (the four steps, the five checks).
- Buttons are pills. The primary pill carries a chevron disc that nudges right on hover.
- The footer ends in a huge `tab` wordmark bleeding off the bottom.
- Film grain at 6% over everything.

## Motion

Two easings: `cubic-bezier(.22,1,.36,1)` for everything, and the spring `cubic-bezier(.2,1.35,.4,1)` for pills, cards and the FAQ chevron. Scroll drives the hero and always rewinds. Nothing loops on its own; reduced motion turns transitions off.

## Iconography

None beyond the ring, the chevron and ✓ in consoles. The favicon is a small ring with a coral arc.

## Never

Gradients on text, glows, orbs, pulsing "live" dots, emoji, uniform card grids, a second accent, purple, typing effects, borrowed shapes from the reference site.
