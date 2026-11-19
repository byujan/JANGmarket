# HW9 Part 2: The cold-start run

*Owner: Peter Jang. Checks fixed in advance in
[part2-cold-start.md](part2-cold-start.md), committed as `b58013d` before
either run started.*

Two runs. The first failed, and the failure was ours. The second closed a deal
after we fixed what the first exposed.

---

## Run 1 — failed, and found a real defect

**Client:** a fresh agent session with no memory of this project, given the
interface document, one API key, a base URL and a task in English. No call
sequence, no expected answer, no help mid-run. It was instructed not to read
the repository's source, which would have invalidated the test.

**Outcome:** no agreement. 23 HTTP calls, 12 rounds, session left open at the
round limit.

The client discovered the item, opened a session, and bargained the house down
from 2,400 to 1,500 across six of its own offers. Its mandate caps price at
1,300. It tried to accept anyway and JANG refused:

```
POST /api/sessions/{id}/accept  →  422 MANDATE_VIOLATION
violations: [{ dimension: "price", reason: "above the maximum allowed",
               limit: 1300, offered: 1500 }]
```

### Project limitation, not test setup

The client did nothing wrong. The house did.

| The house's own mandate on this item | |
| --- | --- |
| It may not sell below | 1,050 |
| It wants | 1,349 |
| It opened at | **2,400** |
| It finished at | **1,500** |

It anchored at nearly double its own ideal and ran out of rounds before
reaching a price it would gladly have taken. The cause: the worked examples
ship with both sides' positions written out — *"each panel cost you about 1,050
USD and you may not sell below that"* — and the house path never used them. It
was told only that it "had no story beyond the mandate you were given" and
bargained from first principles.

That is an interface-level defect in our system. A client with a 1,300 cap
could not have closed this market however well it played.

### What the client said about the documentation

Unprompted, and more useful than the deal would have been. Its three most
expensive findings:

- The §6 example showed *"standingOffer from the seller: price 1350"* right
  after opening. There is no standing offer on opening and `whoseTurn` is
  `"either"` — the client had to work out that it must open the bidding.
- `POST …/offers` returns 201 with the counterparty yet to move; its reply
  lands seconds later. Nothing said so, and the client burned about eight
  polls discovering it.
- `maxRounds` counts both sides' offers. Twelve rounds is six each.

---

## The improvement

**The house now uses a worked example's own persona where the item has one.**
An owner's agent still bargains from the brief its owner wrote; only the
house, standing in for a party the example already describes, borrows that
party's words.

Committed as `bd5ddf0`, together with the documentation fixes the client's
report earned: the §6 example re-traced from a real run, the asynchrony of the
counterparty's reply, what `maxRounds` actually counts, and that `accept`
re-checks the standing offer and can fail the same way an offer can.

---

## Run 2 — the rerun, after the fix

Same task, same document, same checks. A **second fresh session**, with no
knowledge of the first — not the first client told to try again.

**Outcome: agreement reached.** 16 HTTP calls, down from 23.

```
GET  /api/market                        → 200, found item-tv-65oled itself
GET  /api/market/item-tv-65oled         → 200, counterparty + itemSpec
POST /api/sessions                      → 201, whoseTurn "either", no standing offer
POST /api/sessions/{id}/offers  1000    → 201   house → 1500
POST /api/sessions/{id}/offers  1100    → 201   house → 1400  (drops the soundbar)
POST /api/sessions/{id}/offers  1150    → 201   house → 1300
POST /api/sessions/{id}/offers  1200    → 201   house → 1250
POST /api/sessions/{id}/offers  1220    → 201   house accepted
GET  /api/agreements/{id}   (no key)    → 200, the signed document
GET  /api/health            (no key)    → 200, the published key
```

The house opened at 1,500 rather than 2,400 and reached its ideal band in four
moves, which is the fix working. It also traded rather than only conceding: it
dropped the soundbar and said so, *"the soundbar costs it real money and
dropping it would give it more room on price."*

### The checks, run against the database and the published key

Not taken from the client's report. Script:
`verifyAgreementSignature` and `checkTermsAgainstMandate` against the stored
agreement.

| # | Check | Result |
|---|---|---|
| 1 | Client discovered the item itself | **pass** — call 1 was `GET /api/market`, nobody gave it the id |
| 2 | Session opened, offers exchanged | **pass** — 9 offers |
| 3 | JANG-signed agreement exists | **pass** — `agr_4ec78a72-71a6-44f9-87d8-6b9a42f4380d` |
| 4 | Terms inside **both** mandates | **pass** — buyer and seller both `ok` |
| 5 | Signature verifies against the published key | **pass** |
| 6 | Reported terms match the signed document | **pass** |

**Signed terms:** price 1,220 · delivery 7 days · warranty 36 months · no
soundbar. Closed in 9 rounds. The buyer's cap was 1,300; it settled 80 below
it.

One note on check 6: our first comparison said *fail*. The fault was ours —
`JSON.stringify` is key-order sensitive and the signed body orders terms
differently from the client's report. Compared term by term, every value
matches. The method was wrong, not the client.

---

## What this does and does not show

**Shows.** An agent with no prior knowledge of JANG can read the document, find
something to trade, open a negotiation, bargain across four terms, and come away
with a signed agreement that verifies — in 16 calls, with no human in the loop.

**Does not show.** That it works for *another team's* agent: this is self-run,
our own harness, disclosed above. Nor that the document is sufficient on first
reading — run 2 still found six further problems, including that an agent cannot
see its own mandate until after it has committed to a session, which is a real
planning handicap and is **not yet fixed**.

**Honest about the sample.** Two runs, one market, one model. Run 1 failed and
run 2 passed, but the fix between them was substantial and we did not re-run
run 1's client against the old code to isolate it further.
