# JANG 場 — HW9: Agent Usability

| | |
|---|---|
| **Team** | Peter Jang, Hendrick Jung · MAS.665 |
| **Repository** | https://github.com/byujan/JANGmarket |
| **Interface documentation** | [`docs/agent-interface.md`](https://github.com/byujan/JANGmarket/blob/main/docs/agent-interface.md) |
| **Slides in the shared deck** | [team slides](https://docs.google.com/presentation/d/1wzX2bjwuEO62SsyohwPmLxOWkhPu1JUtwL62fFJCKUU/edit?slide=id.h1826dba2f464808f_122_12#slide=id.h1826dba2f464808f_122_12) |

JANG is negotiation infrastructure for autonomous agents: the layer between
agent discovery and agent payment, where a buyer agent and a seller agent settle
what the deal actually is across several terms at once, each under limits its
owner signed and JANG enforces.

---

## 1. The usable interface

[`docs/agent-interface.md`](https://github.com/byujan/JANGmarket/blob/main/docs/agent-interface.md)
is written for the builder of an agent and is meant to be sufficient on its own.
It covers what JANG offers; how an agent connects over MCP or REST; the setup an
owner must do first and why an agent cannot do it; all seven tools with their
REST equivalents, inputs and outputs; what a key may and may not do; every error
code; a worked example traced from a real run; and the boundaries at the end.

**Two things an integrator has to know up front**, both documented:

- **An agent cannot write its own mandate.** The owner signs it in their browser
  and JANG never holds the key. An agent that could grant itself authority would
  be an agent with unlimited authority. So "authorized access" means a key *and*
  a lodged mandate.
- **Refusals are data, not crashes.** An offer outside the proposing agent's own
  mandate comes back as `MANDATE_VIOLATION` with the term, the limit and the
  value, because an agent is expected to read it and try something else.

### To repeat the test yourself

```bash
git clone https://github.com/byujan/JANGmarket && cd JANGmarket
npm install
cp .env.example .env.local          # set DATABASE_URL, JANG_PRIVATE_KEY, JANG_PUBLIC_KEY
npm run db:setup
PORT=8883 npm run dev
```

Register an agent in the console at `/app/agents`, sign limits for an item at
`/app/limits`, then give an agent the key, the base URL and
`docs/agent-interface.md` — and nothing else.

---

## 2. Cold-start integration

Full account, both runs, in
[`docs/hw9/part2-cold-start-run.md`](https://github.com/byujan/JANGmarket/blob/main/docs/hw9/part2-cold-start-run.md).
Success checks were **fixed in advance** in
[`part2-cold-start.md`](https://github.com/byujan/JANGmarket/blob/main/docs/hw9/part2-cold-start.md),
committed as `b58013d` before either run started.

**Disclosure.** Self-run, not independent. The client is a fresh agent session
with no memory of this project and no access to the repository's source, but it
is our own harness and we say so. It was given the document, one API key, a base
URL and a task in English — no call sequence, no expected answer, no messages
relayed mid-run. **No manual help was given during either run.**

**Task.** *"Acquire a 65-inch OLED television on the best terms you can get, and
report what you agreed to."*

### Run 1 — failed, and the failure was ours

23 calls, 12 rounds, no agreement. The client bargained the house from 2,400 to
1,500; its mandate caps price at 1,300; JANG refused the accept:

```
POST /api/sessions/{id}/accept → 422 MANDATE_VIOLATION
violations: [{ dimension: "price", reason: "above the maximum allowed",
               limit: 1300, offered: 1500 }]
```

**Project limitation, not test setup.** The house's own mandate floors at 1,050
and wants 1,349. It opened at 2,400 and never reached a price it would gladly
have taken, because the house path never used the hand-written persona its
market ships with. No client could have closed that market with a 1,300 cap.

### The improvement

The house now uses a worked example's own persona where the item has one
(`bd5ddf0`), plus the documentation fixes the client's report earned: the §6
example re-traced from a real run, the asynchrony of the counterparty's reply,
what `maxRounds` counts, and that `accept` re-checks and can fail.

### Run 2 — rerun with a second fresh session

**Agreement reached**, 16 calls, 9 rounds.
`agr_4ec78a72-71a6-44f9-87d8-6b9a42f4380d` — **price 1,220 · delivery 7 days ·
warranty 36 months · no soundbar.**

The house opened at 1,500 instead of 2,400, reached its band in four moves, and
traded rather than only conceding — it dropped the soundbar and said why.

### Result use, verified independently

Run against the database and the published key, not taken from the client:

| Check (fixed in advance) | Result |
|---|---|
| Discovered the item itself | **pass** — first call was `GET /api/market` |
| Opened a session, exchanged offers | **pass** — 9 offers |
| JANG-signed agreement exists | **pass** |
| Terms inside **both** mandates | **pass** |
| Signature verifies against the published key | **pass** |
| Reported terms match the signed document | **pass** |

Our first run of check 6 reported *fail*; the fault was ours, comparing terms
with `JSON.stringify`, which is key-order sensitive. Recorded rather than
quietly corrected.

---

## 3. Boundary, improvement, rerun

Three, where one was asked for.

### 3a. Off-grid terms — *Hendrick*

Full account in
[`docs/hw9/part3-boundary.md`](https://github.com/byujan/JANGmarket/blob/main/docs/hw9/part3-boundary.md).
JANG accepted and **signed** a package of `{price: 1225.5, deliveryDays: 10.5,
warrantyMonths: 13, bundle: 0.5}` — half a soundbar, and a price in cents on a
£10 grid. Terms must now land on the item's step grid; the refusal names the
nearest valid values so an agent can fix every term in one retry. Reran with
`npm run probe:off-step`, plus regression tests.

### 3b. Scarcity under a race — *Peter*

`npm run market -- --buyers=6 --supply=1` printed its own verdict:
**"Oversold: more deals than units"** — four of six buyers closing on one unit.
Supply was *counted*: the accept path read a total, then signed and wrote
several awaits later, so every racer read zero.

A unit is now **claimed in the same act that checks it**, against a
`commitments` table whose primary key makes the database pick the winner.

| | Before | After |
|---|---|---|
| 6 buyers, 1 unit | 4 closed · *Oversold* | **1 closed**, 5 refused |
| 8 buyers, 3 units | — | **3 closed**, 5 refused |

Regression test races the claims rather than making them in turn, which is the
only shape the bug appeared in. `limitations.md` had described this as a
millisecond window; it was as wide as a signature and two round trips, and that
entry has been corrected.

### 3c. The house bargaining against itself — *Peter*

Found by the cold start, described in §2 above: found, fixed, rerun with a fresh
client, result verified.

---

## What remains unproven

- **Not independent.** Our own harness, twice. An agent built by another team on
  another machine has not tried this.
- **One market, one model, two runs.** Run 1 failed and run 2 passed, but the fix
  between them was substantial and we did not re-run run 1's client against the
  old code to isolate it further.
- **The document is still not sufficient on first reading.** Run 2 found six
  further problems. The sharpest is unfixed: **an agent cannot see its own
  mandate until after it has committed to a session**, so it cannot plan against
  its own budget before opening one.
- **Mandate privacy remains a trust assumption.** JANG holds both mandates in
  plaintext to validate offers. Closing that needs an enclave or a
  zero-knowledge proof, and neither is built.

---

## Team and contributions

**Peter Jang** — the platform: domain core, mandates and signed agreements,
REST API and MCP server, the web console, agent discovery (`list_items`,
`describe_item`), model-driven negotiation in-process, the agent-facing
interface document, the cold-start integration (§2), and the scarcity boundary
test and fix (§3b).

**Hendrick Jung** — market design: the four scenario files with both sides'
economics and personas, the HW7 benchmark protocol and its analysis, the
off-grid boundary test, fix and regression tests (§3a), and the limitations
write-up.

---

## Evidence index

| | |
|---|---|
| Interface document | `docs/agent-interface.md` |
| Pre-registered checks | `docs/hw9/part2-cold-start.md` (commit `b58013d`) |
| Cold-start runs | `docs/hw9/part2-cold-start-run.md` |
| Off-grid boundary | `docs/hw9/part3-boundary.md`, `results/hw9/` |
| Scarcity regression | `src/lib/server/supply-race.test.ts` |
| Benchmark protocol and results | `docs/hw7/protocol.md`, `docs/hw7/HW7_report.md` |
| Limitations | `docs/limitations.md` |

Test suite: **222 passing**. Production build clean.
