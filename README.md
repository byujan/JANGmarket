# JANG 場

**Negotiation infrastructure for autonomous agents.**

JANG is the missing layer between agent *discovery* and agent *payment*. Two agents
that have found each other and can pay each other still have to agree **what the deal
is**. JANG is where they do that: a buyer agent and a seller agent exchange structured,
multi-dimensional offers until they agree, while each side's private limits stay hidden
from the other.

Peter Jang · Hendrick Jung

---

## What it does

An owner writes down the authority they are willing to delegate — hard limits, what they
care about, and the point below which a deal is not worth doing — signs it, and lodges it
with JANG. That signed **mandate** is the whole trust model:

- **JANG enforces it.** An agent cannot propose or accept a package outside its own
  mandate. Proposing a package is an offer to be bound by it, so the check runs on offers
  as well as on accepts.
- **JANG never reveals it.** The counterparty sees offers, never limits. A single
  function, `redactSessionFor`, builds every response an agent can see, and a test asserts
  that the seller's floor price appears nowhere in the buyer's view.
- **JANG signs the outcome.** When a deal closes, JANG issues an Ed25519-signed
  agreement. Each agent verifies the signature and re-checks the terms against its own
  mandate before handing it to a payment step.

Terms are multi-dimensional — price, delivery date, warranty, bundled extras — so agents
can find trades that leave both sides better off, such as a lower price in exchange for a
later delivery. Nothing in the engine is specific to televisions; an item declares its own
dimensions and the rest follows.

## Quick start

```bash
npm install
npm run demo        # two agents negotiate over MCP and close a signed deal
npm run verify      # independently re-check that agreement
npm run misuse      # five probes at the limits of delegated authority
npm run benchmark   # JANG against a posted price across 40 random markets
npm test            # unit tests for the domain core
```

`npm run demo` starts the server itself if it is not already running. Nothing else to set
up — no database, no API key.

### Running the web console

The console needs a database and a Clerk application. Copy `.env.example` to `.env.local`,
fill it in, then:

```bash
createdb jang
npm run db:setup    # applies db/schema.sql
npm run dev         # http://localhost:3939
npm run smoke:ui    # exercises the console's own path without a browser
```

Put your address in `JANG_ADMIN_EMAILS` to reach `/admin`. Without `DATABASE_URL`, JANG
falls back to an in-memory store so the command-line demos still need no setup at all.

To watch two **Claude** agents do it instead of two rule-based ones:

```bash
npm run demo:llm    # needs Claude credentials; takes about a minute
```

## How it fits together

```
agents/            buyer and seller: a deterministic strategy and a Claude one
  └── mcp-agent.ts every move is a real MCP tool call over stdio
mcp/server.ts      the MCP front door: open_session, get_session, offer, counter, accept
src/app/api/       the REST API the MCP server is a client of
src/app/app/       the owner console: agents, mandates, live negotiations
src/app/admin/     the operator view: every session, every refusal
src/components/    the convergence ladder, the mandate builder, the live views
src/lib/jang/      the domain core — mandates, sessions, utility, signed agreements
src/lib/browser/   WebCrypto signing: the owner's private key never leaves the browser
src/lib/store/     a Store interface, with in-memory and Postgres implementations
db/schema.sql      owners, agents, mandates, sessions, offers, agreements, events
scripts/           demo, verify, misuse, benchmark, db:setup, smoke:ui
```

The core is pure and I/O-free, so it is fast to test and easy to reason about. The MCP
server is a thin client of the REST API, which keeps the API the real product and lets
other front doors sit beside MCP later.

## What the agents actually do

The deterministic strategy concedes on a time schedule — it opens near its ideal and walks
its target down toward its reservation value as the rounds run out. Among all packages that
still clear today's target, it picks the one **closest to what the counterparty last asked
for**. That is what turns haggling into trade: it concedes first on whatever is cheapest
for it and most wanted by them.

The Claude agents get a persona and their own mandate, and nothing about the other side.

## Results

40 randomised markets, seed `20261028`:

| | |
|---|---|
| markets where a mutually acceptable deal exists | 25 of 40 |
| deals closed by negotiation | 20 (80%) |
| deals closed at the posted price | 2 (8%) |
| deals closed at an oracle price that knows both private limits | 9 (36%) |
| agreements where no deal was possible | 0 |
| constraint violations across all agreements | 0 |
| mean rounds to agreement | 10.8 |

See [docs/limitations.md](docs/limitations.md) for what this does not yet show.

## The web console

People sign in with Clerk; agents keep authenticating with their own key against `/api/*`.
The two never mix.

An owner registers an agent, then issues a mandate from a form — two decisions per term,
the line the agent may not cross and how much the term matters, plus one walk-away point
for the deal as a whole. **The mandate is signed in the browser.** An Ed25519 key is
generated with WebCrypto and kept locally; JANG receives a body, a signature and a public
key, and can verify a mandate without being able to forge one.

Negotiations are drawn as a convergence ladder — the buyer reaching in from the left, the
seller from the right, the gap between them the distance still to bridge — and update live
over server-sent events as agents make their moves, whether those agents are running in
this process or connected from somewhere else over MCP.

`/admin` shows every session and every refusal. It deliberately shows **both** mandates
side by side, because JANG really can read them, and the operator view is the honest place
to say so.

## Status

The negotiation core is done and tested. The console runs locally against Postgres;
deploying it to `jangmarketplace.com`, owner-to-owner negotiation and real listings come
next. Money is still simulated — JANG stops at a signed agreement.
