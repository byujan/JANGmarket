# Second market: a Cambridge apartment lease

Hendrick, 3 November 2026. `agents/scenarios/cambridge-rental.json`.

This scenario tests whether the same protocol, engine and agents work for a
transaction that is not a physical product. No code changed: the file is data and
the web console picks it up from the scenarios directory.

## The market

A graduate student with a car needs a place in Cambridge from 1 January. A property
manager near Central Square has a studio and a one-bedroom empty off-cycle, months
after the 1 September rush.

| Term | Range | Tenant (buyer) | Landlord (seller) |
|---|---|---|---|
| Monthly rent | $1,800 to $4,000 | max $2,900, ideal $2,400, weight 5 | min $2,450, ideal $2,950, weight 5 |
| One-bedroom vs studio | 0 or 1 | wants 1BR, weight 3 (about $300/month) | slightly prefers 1BR (empty longer), weight 0.5 |
| Lease length | 6 to 24 months | max 15, ideal 9, weight 1 | min 9, ideal 20, weight 1.5 |
| Free rent | 0 to 8 weeks | ideal 4, weight 2.2 | max 4, weight 1.1 |
| Parking space | 0 or 1 | wants it, weight 2 (about $200/month) | costs about $175/month in lost rent, weight 1.75 |

Posted listing: one-bedroom at $2,850, 12 months, no free rent, parking extra. The
tenant scores it 0.30 against a reservation of 0.35 and walks away.

## Why these numbers

- Cambridge average rents in 2026: studio about $2,535, one-bedroom about $2,968
  (Boston Pads, March 2026). RentHop medians for October 2026: studio $2,695,
  one-bedroom $2,925. Winter rents run about 3% below the summer peak.
- The landlord's floor sits near the winter studio rate, because the engine scores
  each term separately (see the limitation below).
- Free rent is cheaper for the landlord than a lower rent, because headline rent sets
  renewals and valuations. Boston landlords were offering free months again from late
  2025 (The Real Deal, December 2025).
- Broker fees are left out on purpose. Since 1 August 2025 Massachusetts law makes
  whoever hired the broker pay, so a landlord's broker fee cannot be passed to the
  tenant (mass.gov). In 2026 about 74% of Cambridge landlords pay the full fee.
- Parking at about $175 to $200 a month is an estimate for an off-street space near
  Central Square, not a sourced figure.

## Result with the deterministic agents

`JANG_SCENARIO=agents/scenarios/cambridge-rental.json npm run demo`

Agreed in 10 rounds: one-bedroom, $2,775, 12 months, four weeks free, no parking.
Tenant 0.53, landlord 0.60, against reservations of 0.35 and 0.30.

## What this tells us

1. **The protocol generalises.** Five terms, two binary, different units, no code
   change, and a signed deal inside both mandates.
2. **The additive utility model shows its limit.** The 1BR is worth more rent than the
   studio, but the engine gives one rent floor for both units. In reality the landlord's
   floor depends on which unit it is. This is open question 1 in HENDRICK.md, and a
   real example of why interactions between terms matter.
3. **The agents found the efficient trade.** Free rent is worth more to the tenant than
   it costs the landlord, so the deal used the full four weeks instead of a lower rent.
   Parking went the other way: relative to everything else each side cares about, the
   space costs the landlord slightly more than it is worth to the tenant, so it stayed
   out. The outcome can vary between runs (an in-process run closed at 14 months with
   parking and no free rent), so treat one demo as an example, not a benchmark.

## Sources

- https://bostonpads.com/boston-rental-market/2026-cambridge-apartment-rental-market-report/
- https://www.renthop.com/average-rent-in/cambridge-ma
- https://www.mass.gov/info-details/frequently-asked-questions-about-residential-rental-brokers-fees
- https://therealdeal.com/national/boston/2025/12/02/bostons-rental-fever-breaks-as-landlords-chase-tenants
