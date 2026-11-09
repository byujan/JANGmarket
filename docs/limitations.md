# What JANG does not yet show

Honest accounting of the Phase 0 prototype, in rough order of how much it matters.

## 1. Mandate privacy is a trust assumption, not a guarantee

JANG holds both mandates in plaintext in order to validate offers against them. The
counterparty never sees them, which is enforced in one place and tested, but **the
operator could**. The current design protects agents from each other, not owners from
JANG. The operator view at `/admin/sessions/[id]` prints both mandates side by side, which
is this limitation stated out loud rather than hidden.

This is the main limitation to state out loud. Closing it means either moving validation
into an enclave, or proving offer-inside-mandate with a zero-knowledge proof so JANG can
check the claim without holding the constraint. Neither is in this prototype.

## 2. Negotiation misses deals that were available

Across 40 randomised markets, a mutually acceptable package existed in 25 and the agents
found one in 20. The other five ran out of rounds while still converging. The schedule is
tuned for a readable demo, not for closing rate; a longer round budget or a less stubborn
concession curve would close more, at the cost of time.

## 3. Key custody is partly solved

Owners who use the web console now hold their own key: it is generated with WebCrypto in
the browser and only the public half is ever sent. What remains unsolved is **storage**.
The private key sits in `localStorage`, so clearing site data destroys it, any script on
the origin can read it, and it cannot move between devices. There is no export, no backup
and no rotation. A non-extractable key would fix the first two problems and make the last
one worse.

The command-line scenarios still generate a keypair per run inside `issueMandate`, so
their signature chain is real but their custody story is not. JANG's own signing key is
generated per process unless supplied through the environment, which means agreements
signed before a restart cannot be verified after one.

## 4. One process, one memory

The store is an in-memory `Map` behind a `Store` interface. That is correct for a local
demo where a single server serves both agents, and wrong for anything deployed across more
than one instance. Postgres is the first Phase 1 task, before any hosting that matters.

## 5. Agent registration, and what a key can do

Owners register agents through the console, and `POST /api/agents`, the unauthenticated
route the command-line demos use, is now closed unless `JANG_OPEN_REGISTRATION=true` or
no database is configured. What is still missing is revocation: a leaked agent key is good
until the mandate expires, and there is no way to withdraw one.

## 5a. The only counterparty is the house

An owner negotiating from the console bargains against JANG's own house agent, which runs
under a mandate derived from the scenario file. It is a real agent getting no special
treatment from the engine, but it is not another person. Owner-to-owner negotiation needs
no schema change and has not been built.

**Decision for the final demo (2026-11-09): stay one-to-one.** One buyer against the house
seller is stable, deterministic and tested, and it shows everything JANG adds to a single
negotiation.

**Where it should go: many buyers and many sellers on one negotiation layer.** Sellers list
items under their own mandates, buyers lodge theirs, and JANG runs the negotiations between
them. The engine already allows this (any number of agents can lodge a mandate for an item,
and a session can open between any buyer and seller who have), but nothing around it exists:

- **Seller listings**: a seller creating a listing and a seller mandate from the console.
- **Matching** (needs discussion before building): who is paired with whom, in what order
  (one counterparty at a time or several at once), and by what priority (arrival, expected
  surplus). JANG holds both mandates, so it could open sessions only between pairs whose
  limits overlap, which no outside directory can do; but being matched then tells each side
  that a deal is possible, which leaks a little about the other's limits.
- **Inventory lock**: nothing stops one TV from being sold twice today. An agreement must
  close the listing and every other open session on it.
- **Views** of several negotiations at once, and seed data of synthetic buyers and sellers.

Rough size: four to seven working days for a demo-quality version, touching the store and
deployment as well as the console. Why it matters beyond realism: with several
counterparties, a small safety margin on the walk-away pays for itself, because a deal it
blocks is usually recovered with the next counterparty
([claude-experiments.md](final/claude-experiments.md), "The margin when an owner can try
another counterparty"). With one counterparty it costs deals.

## 6. The benchmark compares against a simple seller

The posted-price baseline is drawn blind, which flatters negotiation. We also report an
oracle baseline that posts the midpoint of the two private limits, and negotiation still wins
(80% against 36%), because a single price cannot trade delivery against warranty. But
neither baseline is an adaptive seller, and a real retailer runs promotions and segments.

## 7. Settlement is out of scope

JANG stops at a signed agreement. Nothing is paid. Handing the agreement to a payment
step, human-approved first and agent-native rails later, is Phase 3.
