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

## 5b. Many buyers to one seller: what it does and does not do

A seller mandate can now authorise a quantity, and JANG refuses an acceptance
once it is spent, so the same item cannot be promised to two buyers. Agents are
told how many they may still commit and how many negotiations are running for
the item, and the rule strategy concedes faster as rivals outnumber the units.
`npm run market -- --buyers=6 --supply=1` runs it.

What it does not do:

- **Supply is counted, not reserved.** Two acceptances arriving in the same
  instant both read the count before either writes, so both could pass. The
  window is milliseconds and the fix is a transaction or a unique constraint,
  neither of which is written.
- **Nobody is told who the rivals are**, only how many. That is deliberate, but
  it also means an agent cannot tell one serious rival from five idle ones.
- **The seller runs one mandate across every buyer.** It cannot ask more of a
  buyer who seems keen, which is most of what a real seller does with scarcity.
- **An expired or abandoned session still counts as a rival** until it closes,
  so contention reads high after a burst of dead sessions.

## 5c. Listings, and the counterparty they get

An owner can list an item with terms of their own, stored in the database
rather than written as a scenario file. The terms and their ranges are public,
because a counterparty cannot make an offer without them; how far the lister
would actually go stays private and is signed in their browser like any other
mandate.

The other side is derived from the item's declared ranges alone, never from the
lister's mandate. That is deliberate: a counterparty built from your own limits
could always deal with you, and the negotiation would be theatre. Derived this
way the house holds a real position and refuses packages it does not like.

It is still a synthetic counterparty, with the obvious consequences:

- **It is the same every time.** One listing, one house position, forever. No
  variation, no learning, no second opinion.
- **Its position is a guess from the ranges**, at fixed fractions written into
  `listing.ts`. A listing whose ranges are unrealistic gets an unrealistic
  counterparty, and nothing warns the lister.
- **Owner-to-owner still is not wired up in the console.** The protocol allows
  it, and a listing names which side is open, but nothing yet lets one owner
  discover another's listing and take the other side of it.
- **Nothing expires or withdraws a listing.** It stays in the catalogue until
  the row is deleted by hand.

## 5a. The only counterparty is the house

An owner negotiating from the console bargains against JANG's own house agent, which runs
under a mandate derived from the scenario file, authorised for a large quantity so repeated
demos do not exhaust it. It is a real agent getting no special
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

**Everything above was designed and tested one-to-one, and may change many-to-many.** The
mandate builder, the walk-away, priority disclosure, MESO, the agents' prompts and every
experiment assume one buyer and one seller. With many on each side, some of that may need
rethinking, for example: the walk-away becomes "the best other deal on JANG", not only an
outside offer, so it moves with the market; an agent negotiating with several
counterparties at once needs rules for commitment and withdrawal; disclosure and MESO reveal
preferences to more parties; and deal quality should be judged against the whole market,
not one pair. Treat the current protocol and its criteria as the one-to-one version.

## 6. The benchmark compares against a simple seller

The posted-price baseline is drawn blind, which flatters negotiation. We also report an
oracle baseline that posts the midpoint of the two private limits, and negotiation still wins
(80% against 36%), because a single price cannot trade delivery against warranty. But
neither baseline is an adaptive seller, and a real retailer runs promotions and segments.

## 7. Settlement is out of scope

JANG stops at a signed agreement. Nothing is paid. Handing the agreement to a payment
step, human-approved first and agent-native rails later, is Phase 3.
