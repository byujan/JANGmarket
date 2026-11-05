# Hendrick, start here

Written 27 October 2026, at the end of the session that built the web console.
This picks up where we left off: what exists, what is urgent, what is yours, and
what we have not decided yet.

Read [README.md](README.md) first for what JANG is. This file is about the work.

---

## 1. The urgent thing

**HW6 is due Wednesday 28 October and the video has not been recorded.**

Everything it needs already runs. The deliverables are a one-minute unlisted YouTube
video, a short paragraph, and the class spreadsheet updated with both our names.
[docs/hw6-submission.md](docs/hw6-submission.md) has a drafted paragraph hitting all four
rubric criteria and a timed shot list.

The shortest path to a recording, in a clean terminal with a large font:

```bash
npm run demo      # ~15s: two agents negotiate over MCP and close a signed deal
npm run verify    # 7 independent checks on that agreement, all PASS
npm run misuse    # 5 probes at the limits of authority, all BLOCKED
```

That is the whole story: agents really used the interface, the result was independently
checked, and the system refuses what it should. If there is time, `npm run demo:llm`
shows two Claude agents doing the same thing in about a minute, which works better as a five-second
cutaway than as the main footage, because it is slow.

The one limitation to state out loud, because the rubric asks for one and this is the
truest: **JANG holds both sides' mandates in plaintext in order to validate offers against
them, so mandate privacy is a trust assumption about the operator, not a cryptographic
guarantee.**

---

## 2. Where things stand

Done and tested:

- **The negotiation engine.** Signed mandates, a turn-taking offer state machine, utility
  scoring over arbitrary named dimensions, Ed25519-signed agreements. Pure TypeScript with
  no I/O.
- **Two front doors.** A REST API, and an MCP server that is a thin client of it. Agents
  authenticate with their own key.
- **Two kinds of agent.** A deterministic strategy used for the benchmark, and Claude
  agents via the Agent SDK. Both go through the same MCP interface.
- **Evidence.** 36 tests, an independent verifier, five misuse probes, and a benchmark
  against two baselines.
- **The web console.** Clerk sign-in, Postgres, agent registration, a limits form that
  signs in the browser, live negotiation views over SSE, and an operator board.

Not done: deployment to `jangmarketplace.com`, owner-to-owner negotiation, listings,
and settlement. Money is simulated everywhere.

### Getting it running

```bash
npm install
npm run demo                        # works immediately, no setup

# for the console:
createdb jang
cp .env.example .env.local          # then fill in Clerk keys and your email
npm run db:setup
npm run dev                         # http://localhost:3939
```

Your email needs to be in `JANG_ADMIN_EMAILS` to see `/admin`.

To run the Postgres half of the store tests, give them their own database:
`createdb jang_test`, apply the schema to it, then
`TEST_DATABASE_URL=postgres://localhost:5432/jang_test npm test`. That suite
truncates between tests and will refuse to run against anything whose name does
not contain "test". Ask Peter for the Clerk
development keys, or make your own application at dashboard.clerk.com. They are already
in his `.env.local`, which is gitignored and must stay that way.

---

## 3. What is yours

The split is **you own the market, Peter owns the machine.** Your work lands in data files
and prose that the engine validates when it loads them, so a mistake fails a test rather
than breaking a demo. Full table in [docs/work-split.md](docs/work-split.md); the short
version:

| Yours | Where |
|---|---|
| Market design: items, limits, baselines | `agents/scenarios/*.json` |
| How the Claude agents behave | `agents/prompts/*.md` |
| Results, framing, submission | `docs/*.md`, the video, the spreadsheet |

The contract between your half and Peter's is `ScenarioSchema` in
`src/lib/jang/scenario.ts`. It validates every scenario file on load, and
`src/lib/jang/scenario.test.ts` asserts the shipped scenario is coherent: the mandates
verify, a zone of possible agreement exists, and the posted price is genuinely one the
buyer would walk away from. Write a scenario where no deal is possible, or where the fixed
price trivially clears, and those tests fail and tell you so.

### Your next three tasks

**1. Sanity-check the economics.** `agents/scenarios/tv-clearance.json` has placeholder
numbers chosen to make a readable demo, not researched ones. A $1,180 floor and a $1,500
budget on a clearance 65-inch OLED: are those plausible? Is a soundbar really worth a
tenth of the package to a buyer? Change the weights and bounds, then run `npm test` and
`npm run demo` and see what it does to the outcome.

**2. Add a second market.** One new file in `agents/scenarios/`, in a category that is not
a physical product. A service contract, say, where the terms are rate, deadline,
revisions and scope. No code. This is the thing that would actually answer the open
question in our proposal, which is whether one negotiation protocol generalises across
transaction types. It will also appear in the web console automatically, because the
console reads that directory.

**3. Tighten the two personas** in `agents/prompts/`. They drive the Claude agents, and the
quality of `npm run demo:llm` depends mostly on them rather than on any code.

---

## 4. Decisions already made, and why

Worth knowing so you do not spend time relitigating them.

- **Money is simulated.** JANG stops at a signed agreement. Payment rails are Phase 3.
- **The seller is always the house.** An owner negotiating from the console bargains
  against JANG's own agent, which runs under a real signed mandate and gets no special
  treatment from the engine. This is so one person can run an honest negotiation alone.
  Owner-to-owner needs no schema change and has not been built.
- **Admins are an env allowlist**, not Clerk organisations. There are two of us.
- **Offers are rows, not a blob.** The `offers` table is the event stream the live views
  tail, which is why a negotiation driven from a terminal shows up in a browser.
- **The MCP server is a client of the REST API**, so the API stays the product.
- **Deterministic agents came first.** They make the benchmark reproducible and gave us a
  demo that does not depend on an LLM behaving.

### A modelling decision that is really yours

Each term in a mandate carries a hard bound, a weight, and an `ideal`/`worst` pair that
sets the scale utility is scored on. The **web form currently collapses the last two**: the
limit you drag is used as both the hard bound and the `worst` end of the scale. That keeps
the form to two controls per term instead of three.

It is a simplification, and it is in your territory. The engine fully supports three
independent points. `agents/scenarios/*.json` already uses them, and the TV scenario has
a buyer whose price ideal is $900 while their hard ceiling is $1,500. If you think owners
need to express "I'd love $900, I'll tolerate $1,400, I absolutely cannot exceed $1,500",
say so and Peter will add the third control. Tell him which way; do not assume the current
form is the considered answer.

---

## 5. Open questions we need you on

1. **Does the utility model hold up?** It is a weighted sum of per-dimension scores, each
   normalised linearly from worst to ideal. Linear and additive are strong assumptions.
   Real preferences have thresholds and interactions, since a warranty may be worth much more
   on an expensive item than a cheap one. Does additive separability mislead here, and is
   it worth the complexity to fix?
2. **Is the reservation value the right walk-away construct?** Right now an owner sets one
   number on a 0–1 utility scale. That is abstract. Is there a formulation an actual
   person could answer confidently?
3. **What is the fair baseline?** We report against a blind posted price and an oracle
   midpoint. Neither is an adaptive seller who runs promotions and segments. What would a
   real retailer do, and does negotiation still win against it?
4. **Which category do we launch in?** The prototype is consumer electronics because it
   made a readable demo. That is not a market-selection argument.

---

## 6. Known gaps and rough edges

Beyond [docs/limitations.md](docs/limitations.md), which is the serious list:

- **Seller limits do not appear in the console.** If you set limits for *selling*, nothing
  shows under "Start a negotiation", because the house always takes the seller side. The
  empty state says so now, but it is still confusing.
- **The owner's signing key lives in `localStorage`.** Clearing site data destroys it,
  there is no export or backup, and it cannot move between devices.
- **JANG's own signing key is generated per process** unless set in the environment, so
  agreements signed before a restart will not verify after one. The fingerprint in the top
  bar is there to make that visible.
- **No revocation.** A leaked agent key works until the mandate expires.
- **The shipped strategy still has the bounds bug off by default.** Hendrick's HW7 study
  shows `respectBounds` raises the close rate from 69% to 81% in ordinary markets and from
  0% to 18% in narrow ones, with no cost in violations or false agreements. It fixes a
  genuine defect: an agent tries to accept a package that breaks its own hard bound, JANG
  refuses, and the agent then stops countering. **It was left off so the HW7 report's
  `base` variant keeps meaning what the report says it means.** Turn it on once that is
  submitted, and refresh the README numbers. `deadlineAware` is a different matter: it
  buys closing rate by conceding hard at the end, costing surplus and buyer share, so it
  is a policy choice rather than a bug fix and should stay off.
- **Nothing has been seen in a real browser by Claude.** The console was verified by
  markup checks and a server-side smoke test; Peter has clicked through it. Treat the
  visual design as reviewed by one pair of eyes.

---

## 7. Where this is going

- **Phase 1, hosted.** Deploy to `jangmarketplace.com`. Needs a managed Postgres, Clerk
  production keys, and `JANG_PRIVATE_KEY`/`JANG_PUBLIC_KEY` set so the signing identity
  survives restarts.
- **Phase 2, a marketplace.** Listings, seller onboarding, discovery, a simulated
  settlement ledger, owner-to-owner negotiation.
- **Phase 3, settlement.** Hand the signed agreement to a payment step: human-approved
  Stripe first, agent-native rails later.

The natural next shared piece is making the limits form good. It is your design problem
and Peter's implementation, and it is the point where JANG stops being a protocol and
starts being a product.

---

## 8. Glossary

- **Mandate.** The signed authority an agent carries: hard bounds per term, weights, a
  reservation value, an expiry. Called "your limits" in the interface, because nobody
  searching for where to enter a budget scans a menu for the word mandate.
- **Reservation value.** The utility below which no deal beats no deal. Walk-away point.
- **Utility.** A package scored 0 to 1 against one side's preferences. Private; it never
  crosses the wire to the counterparty.
- **ZOPA.** Zone of possible agreement: the set of packages both mandates allow. The
  benchmark grid-searches for one before judging whether a miss was a failure.
- **Convergence ladder.** How the console draws a negotiation: buyer reaching in from the
  left, seller from the right, the gap between them what is left to bridge.
- **House agent.** JANG's built-in counterparty, so one owner can negotiate alone.
- **Session.** One negotiation. **Offer.** One complete package of terms, which is
  binding on whoever proposes it. **Agreement.** The signed result.
