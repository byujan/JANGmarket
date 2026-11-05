# JANG 場

**Negotiation infrastructure for autonomous agents.**

Agents can already find each other, and they can already pay each other. They still have
to agree **what the deal is**. JANG is that missing middle: a buyer's agent and a seller's
agent exchange structured offers across several terms at once until they agree, while the
limits each owner set stay hidden from the other side.

場 (*jang*) is Korean for marketplace.

Peter Jang · Hendrick Jung

---

## The idea in one screen

A fixed price is a single number offered to everyone. It closes a deal only when it
happens to sit between what this buyer will pay and what this seller will accept. A
negotiation can do better, because a deal is never only about price:

```
         BUYER                                              SELLER
  1   ├──                                                      $1,900
  2   $900                                                   ──┤
  3   ├────                                                    $1,860
  4         $1,130                                           ──┤
  5   ├──────────                                              $1,640
  6              $1,200  ◄── agreed: 18 days · 36 months · no soundbar
```

The seller extended the warranty and took a later delivery rather than cut the price
further. Both sides came out above their own walk-away point. At the posted shelf price
this buyer would have left empty-handed and there would have been no sale at all.

Across 40 randomised markets, negotiation closed **17 of the 27 deals that were actually
possible**, against 1 at a blind posted price and 1 at an oracle price that somehow knew
both sides' private limits, with zero agreements breaching a mandate. Reproduce it with
`npm run benchmark`.

That 63% is the shipped strategy with its options off. The HW7 study in
`results/hw7/SUMMARY.md` measures the same thing far more carefully, across three seeds
and four market shapes with confidence intervals, and finds that enabling the
`respectBounds` fix raises the close rate to 81% in ordinary markets and from 0% to 18%
in narrow ones. See [HENDRICK.md](HENDRICK.md) on whether that should become the default.

## The trust model

An owner writes down the authority they are willing to delegate (the line their agent may
not cross on each term, how much each term matters, and the point below which no deal is
worth doing) and signs it. That signed **mandate** is the whole model:

- **JANG enforces it.** An agent cannot propose *or* accept a package outside its own
  mandate. Proposing a package is an offer to be bound by it, so the check runs on offers
  as well as accepts.
- **JANG never reveals it.** The counterparty sees offers, never limits. One function,
  `redactSessionFor`, builds every response an agent can see, and a test asserts the
  seller's floor price appears nowhere in the buyer's view.
- **JANG signs the outcome.** When a deal closes it issues an Ed25519-signed agreement.
  Each agent verifies the signature and re-checks the terms against its own mandate before
  handing it to a payment step.
- **Owners hold their own keys.** In the web console the signing key is generated with
  WebCrypto in the browser and never sent. JANG can verify a mandate; it cannot write one.

Nothing in the engine knows what a television is. An item declares its own negotiable
dimensions and everything else follows from that.

## Quick start

No database, no API key, nothing to configure:

```bash
npm install
npm run demo        # two agents negotiate over MCP and close a signed deal
npm run verify      # independently re-check that agreement
npm run misuse      # five probes at the limits of delegated authority
npm run benchmark   # JANG against a posted price across 40 random markets
npm test            # the unit tests
```

`npm run demo` starts the server itself if it is not already running, and falls back to an
in-memory store when no database is configured.

To watch two **Claude** agents do it instead of two rule-based ones, which needs Claude
credentials and takes about a minute:

```bash
npm run demo:llm
```

### The web console

This part needs Postgres and a Clerk application. Copy `.env.example` to `.env.local` and
fill it in, then:

```bash
createdb jang
npm run db:setup    # applies db/schema.sql
npm run dev         # http://localhost:3939
npm run smoke:ui    # exercises the console's own path without a browser
```

Put your email in `JANG_ADMIN_EMAILS` to reach `/admin`.

## What is in here

```
src/lib/jang/      the domain core: mandates, sessions, utility, signed agreements.
                   Pure TypeScript, no I/O, no framework.
src/lib/store/     a Store interface with in-memory and Postgres implementations,
                   held to one shared conformance suite
src/lib/browser/   WebCrypto signing: the owner's private key never leaves the browser
src/lib/server/    identity, the service layer, the marketplace, SSE
src/app/api/       the REST API, which agents reach with their own key
src/app/app/       the owner console
src/app/admin/     the operator view
src/components/    the convergence ladder, the limits builder, the live views
mcp/server.ts      the MCP front door: open_session, get_session, offer, counter, accept
agents/            a deterministic strategy and a Claude one, plus the scenarios
db/schema.sql      owners, agents, mandates, sessions, offers, agreements, events
scripts/           demo, verify, misuse, benchmark, db:setup, smoke:ui
docs/              limitations, the work split, the HW6 submission
```

### How a request flows

```
 a Claude agent, or your own code
            │
            │  MCP tool call over stdio
            ▼
      mcp/server.ts            a thin client of the REST API, one identity per process
            │
            │  HTTP + X-Agent-Key
            ▼
      src/app/api/*            authenticates the agent, redacts every response
            │
            ▼
      src/lib/jang/*           checks the mandate, advances the session, signs the deal
            │
            ▼
      src/lib/store/*          in memory, or Postgres
```

Keeping the MCP server a *client* of the REST API means the API stays the product and MCP
is one door onto it rather than the only one. The domain core underneath has no I/O at
all, which is why it is fast to test and easy to reason about.

## The web console

People sign in with Clerk; agents keep authenticating with their own key against `/api/*`.
The two paths never mix.

An owner registers an agent, which is a name rather than a program, because JANG has a
negotiator built in. They then set their limits on a form. Negotiations are drawn as a **convergence ladder**,
the buyer reaching in from the left and the seller from the right, updating live over
server-sent events as agents move, whether those agents run in this process or are
connected from elsewhere over MCP.

`/admin` shows every session and every refusal as it happens, and deliberately shows
**both** mandates side by side. JANG really can read them, and the operator view is the
honest place to say so.

## Testing

```bash
npm run check                                   # typecheck, tests, demo, verify, misuse
DATABASE_URL=postgres://localhost:5432/jang npm test   # also runs the Postgres store suite
```

36 tests. The ones that matter most: an agent cannot act outside its mandate; a session
view leaks nothing about the counterparty; a tampered agreement fails verification; a
signature made in the browser verifies on the server; and both store implementations
satisfy the same contract.

Beyond unit tests, `npm run misuse` drives five probes through the real MCP interface: an
agent offering below its own floor, accepting above its own ceiling, a stranger reading
someone else's session, and the counterparty's mandate leaking into a view.

## Status and honesty

The negotiation core is done and tested. The console runs locally against Postgres.
Deploying to `jangmarketplace.com`, owner-to-owner negotiation and real listings come next.
Money is simulated throughout; JANG stops at a signed agreement.

**[docs/limitations.md](docs/limitations.md) is the honest account** of what this does not
yet do, and is worth reading before trusting any of the above. The headline: JANG holds
both mandates in plaintext in order to validate offers against them, so mandate privacy is
a trust assumption about the operator rather than a cryptographic guarantee.

Other docs: **[docs/work-split.md](docs/work-split.md)** for who owns what,
**[HENDRICK.md](HENDRICK.md)** to pick the work up from here, and
**[docs/hw6-submission.md](docs/hw6-submission.md)** for the coursework deliverable.
