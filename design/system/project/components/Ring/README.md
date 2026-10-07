# Ring

The ring is the tab: the chrome band is the limit, the coral arc is what's spent, a translucent coral segment after it is what's in flight, and the readout is what's left.

Use one large ring per tab view, small rings on tab cards (no readout). It's driven by two CSS custom properties: `--spent` and `--held`, both fractions of the limit (0 to 1). Revoked or closed tabs add `.void`, which turns the arc grey.

- The readout number is Geist Mono, tabular, without a currency sign; the unit and the limit sit underneath, the limit in coral.
- Never animate the ring for decoration. It moves only when money moves (or when the landing page's scroll plays a simulated session).
- The consumer provides spent, held and limit as integers in base units and converts them to fractions for display.
