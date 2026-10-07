# Receipt

A receipt is how TAB shows a tab: header, terms, one line per payment, totals, the limit in stamp red, and a meter.

Use it for a single tab: the hero demo and the tab page ledger. One receipt per view. It's the object, not a card style.

- Lines print in with `.line` (a left-to-right clip). Refused or released lines get `.rej` (struck through, ink-2) and read REFUSED, never a red amount.
- `LIMIT` is the only stamp-red row. The meter is ink on `paper-lo`; in-flight holds are the hatched `.res` bar.
- Closed or revoked tabs get the `.stamp` (CLOSED or VOID). Nothing else uses it.
- Tilt it 1.2deg only in the hero.
- The consumer provides the tab name, short id, dates, cap, lines and totals. Amounts are integers in base units, formatted only for display.
