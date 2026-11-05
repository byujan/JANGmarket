# TV clearance scenario: economics review

Hendrick, 3 November 2026. Replaces the placeholder numbers in
`agents/scenarios/tv-clearance.json` with researched ones.

## What changed and why

| Term | Before | After | Basis |
|---|---|---|---|
| Seller floor (cost) | $1,180 | $1,050 | Last season's 65" OLEDs (LG C5, Samsung S90F) sell for about $1,100 to $1,350 on sale in 2026; TV retail margins are thin, so cost sits just under street price. |
| Buyer ceiling / ideal | $1,500 / $900 | $1,300 / $999 | A buyer who has watched the price knows the Black Friday 2025 low was about $1,246. |
| Posted price | $1,499 | $1,349 | Current street price for the class. |
| Warranty scale | 0 to 36 months | 12 to 36 months | 12 months comes from the manufacturer. |
| Warranty weight | buyer 2, seller 2 | buyer 3, seller 1.2 | Service contracts retail at roughly 15 to 17% of product price, but expected claims in years two and three are far lower, so warranty is cheap for the seller and valuable to the buyer. |
| Soundbar weight | buyer 1, seller 1 | buyer 1.5, seller 2.2 | A bundled soundbar costs the seller more at wholesale than a buyer who sees it as a nice extra will pay for it. |
| Delivery weight | buyer 2, seller 2 | buyer 1, seller 0.7 | Minor lever; expedited delivery costs the seller a little. |
| Buyer reservation | 0.3 | 0.2 | Needed so the test's mid-point package ($1,280, 24 months) stays acceptable under the tighter ceiling. |

The seller persona also said it wanted to ship later because warehouse space was short,
which contradicts itself (shipping later holds stock longer). It now says expedited
delivery costs more, and that stock must clear before Black Friday.

## Effect on the deterministic demo

| | Deal | Buyer utility | Seller utility |
|---|---|---|---|
| Before | $1,250, 16 days, 24 months, no soundbar | 0.44 | 0.32 |
| After | $1,200, 12 days, 36 months, no soundbar | 0.51 | 0.54 |

Both sides do better: warranty is now the efficient trade, and the soundbar correctly
stays out of the deal because it is worth less to the buyer than it costs the seller.

## Code change

`scripts/misuse.ts` hard-coded $1,180 and $1,500. It now reads the floor and ceiling
from the scenario, so the five probes keep working whatever the market numbers are.

## Sources

- https://www.digitalcitizen.life/lg-c5-oled-tv-drops-to-1099-as-samsung-s90f-deals-also-cut-prices/
- https://www.tomsguide.com/tvs/oled-tvs/i-would-not-buy-the-lg-c6-oled-yet-heres-how-long-you-should-wait
- https://warrantyweek.com/archive/ww20161208.html
