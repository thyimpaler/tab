# Console

The carbon console shows what an agent is doing right now: a title bar, the live balance, a scrolling log and actions.

Use it only for live activity: the landing demo and the dashboard's test agent. Static code samples use `pre.code` on carbon, without the bar.

- Each request is two lines: the request (`GET url → 402 amount`), then TAB's verdict. The verdict is dim when signed and `.no` (carbon-stamp) when refused, and always ends with what happened ("nothing signed").
- The balance is the biggest thing in the panel: tabular, no currency symbol, with the unit in the note beside it.
- Buttons are uppercase mono, outlined in `carbon-rule`.
