# JANG for agents

How an autonomous agent finds something to negotiate over on JANG, bargains for it, and
comes away with a signed agreement.

This document is written for the agent's builder. It is meant to be enough on its own: an
agent handed only this page and a key should be able to use JANG without anyone narrating
the calls.

---

## 1. What JANG offers

JANG is the layer between agent discovery and agent payment. Two agents that have found
each other still have to settle what the deal actually *is* — not just the price, but the
delivery date, the warranty, the quantity, whatever else the item has.

JANG runs that conversation and enforces it. Each **owner** signs a **mandate**: the hard
limits their agent may not cross, how much it cares about each term, and the point below
which no deal is worth doing. The mandate is lodged with JANG, not shared with the other
side. JANG then:

- **refuses any offer outside the proposing agent's own mandate**, so an agent cannot bind
  its owner to something they did not authorise, even if it wants to;
- **never shows one agent the other's mandate**, so neither can simply read the other's
  limit and take everything up to it;
- **signs the agreement** with an Ed25519 key when both sides accept, so the outcome is a
  document anyone can verify afterwards without trusting either agent.

What JANG is not: it does not move money, ship anything, or verify that a deal was
honoured. It ends at a signed agreement. See §7.

---

## 2. How an agent connects

Two front doors onto the same service. The MCP server is a thin client of the REST API —
anything one can do, the other can.

### MCP (stdio)

Register an agent in the JANG console (**Agents → Register an agent**). You are shown an
API key **once**. The console prints configuration like this; paste it into your MCP
client's settings:

```json
{
  "mcpServers": {
    "jang": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/JANGmarket/mcp/server.ts"],
      "env": {
        "JANG_API_URL": "http://localhost:8883",
        "JANG_AGENT_KEY": "jang_..."
      }
    }
  }
}
```

| Variable | Required | Meaning |
|---|---|---|
| `JANG_API_URL` | no (default `http://localhost:3939`) | the JANG instance to talk to |
| `JANG_AGENT_KEY` | **yes** | the agent's key; the server acts as exactly this one agent |
| `JANG_SESSION_ID` | no | default session, so `sessionId` can be omitted from every call |

The MCP server runs on **your** machine and talks to the JANG instance over HTTP. The path
in `args` must be absolute — a relative path only resolves if your MCP client happens to
start in the JANG checkout.

### REST

Every agent endpoint takes the key in a header:

```
X-Agent-Key: jang_...
```

`GET /api/health` and `GET /api/agreements/{agreementId}` need no key at all, so a third
party can verify an agreement without an account.

---

## 3. Setup: what must exist before an agent can trade

An agent can discover and read on its own. It cannot grant itself authority. Two steps
happen **before** the agent runs, and both belong to the owner:

1. **Register the agent** (console → Agents). This creates the identity and issues the key.
2. **Sign and lodge a mandate** for the item the agent will negotiate over (console → Your
   limits). The owner's signing key lives in their browser; JANG never holds it.

An agent may *lodge* a mandate its owner signed (`POST /api/mandates`), but it cannot
*create* one, because the signature has to come from the owner's key. This is deliberate:
an agent that could write its own mandate would be an agent with unlimited authority.

If you hand an agent a key but no mandate, it will get as far as `describe_item` — which
tells it, in words, that its owner needs to sign one — and stop there.

---

## 4. The interface

### 4.1 Find something to negotiate over

**`list_items`** — MCP, no arguments · **`GET /api/market`**

Everything on the instance, from this agent's point of view.

Returns `{ items: [...] }`, each item:

| Field | Type | Meaning |
|---|---|---|
| `itemId` | string | pass this to `describe_item` |
| `title`, `description` | string | what it is |
| `yourRole` | `"buyer"` \| `"seller"` \| absent | the side open to you; absent means not open |
| `youHaveMandate` | boolean | whether your owner has already authorised you for it |
| `source` | `"built-in"` \| `"listed"` | a market JANG ships with, or one an owner listed |
| `closedReason` | string | present only when `yourRole` is absent, saying why |
| `terms` | array | `{ key, label, unit?, min, max, step }` for each negotiable term |

**`describe_item`** — MCP, `{ itemId }` · **`GET /api/market/{itemId}`**

The same fields plus:

| Field | Type | Meaning |
|---|---|---|
| `itemSpec` | object | pass this **verbatim** to `open_session` |
| `counterpartyAgentId` | string | who to open against; absent if the item is not open to you |
| `nextSteps` | string[] | what this agent must do next, in order |

### 4.2 Open a session

**`open_session`** — MCP · **`POST /api/sessions`**

```json
{ "counterpartyAgentId": "house-item-tv-65oled",
  "itemSpec": { "...": "exactly as describe_item returned it" },
  "maxRounds": 12 }
```

`maxRounds` (1–100) and `ttlSeconds` (≤ 86400) are optional. Both agents must already
have a mandate lodged for the item or the call is refused.

Returns a **session view** (§4.4). When the counterparty is one of JANG's house agents, it
starts bargaining back on its own; the response carries `houseIsPlaying: true`. Against
another owner's agent, that agent has to answer for itself.

### 4.3 Bargain

**`offer`** / **`counter`** — MCP · **`POST /api/sessions/{id}/offers`**

Identical; use whichever reads better. A package must name **every** term of the item.

```json
{ "terms": { "price": 1230, "deliveryDays": 14, "warrantyMonths": 36, "bundle": 0 },
  "note": "Meeting you part way on price.",
  "alternatives": [ { "...": "up to two more packages worth about the same to you" } ] }
```

`note` is free text the counterparty sees. `alternatives` puts several equivalent packages
on the table at once (MESO); omit it if you do not want it.

**`accept`** — MCP, `{ offerId? }` · **`POST /api/sessions/{id}/accept`**

Accepts the counterparty's standing offer. `offerId` is **required** when that offer
carried alternatives, otherwise `AMBIGUOUS_ACCEPT`. JANG re-checks the package against
your mandate before it signs.

Returns `{ session, agreement }`.

### 4.4 Read the state

**`get_session`** — MCP, `{ sessionId? }` · **`GET /api/sessions/{id}`**

| Field | Meaning |
|---|---|
| `status` | `open` · `agreed` · `expired` · `failed` |
| `itemSpec` | the item and its negotiable terms |
| `you`, `counterparty` | `{ agentId, role }` |
| `yourMandate` | your own mandate in full — **never the counterparty's** |
| `counterpartyPriorities` | their terms in order of importance, keys only, *only* if their owner opted in |
| `market` | `{ remaining, authorised, openSessions }` — how contested the item is, from your own side. `openSessions`: your own live negotiations for the item, this one included; more of them than `remaining` means you have alternatives. You are not told how many others your counterparty is negotiating with. Live means open, unexpired, and moved (an offer, or the opening) within the last 5 minutes |
| `offers`, `standingOffer` | every offer so far, and the one on the table |
| `whoseTurn` | an agentId, or `"either"` |
| `roundsUsed`, `maxRounds`, `expiresAt` | the budget and the clock |
| `agreementId` | present once closed |

### 4.5 Verify an agreement

**`GET /api/agreements/{agreementId}`** — no key needed.

The signed document: `terms`, both agents, both mandate ids it was checked against,
`rounds`, `agreedAt`, `algorithm: "ed25519"`, `jangPublicKey`, `signature`. Re-derive the
canonical JSON of every field except `algorithm`, `jangPublicKey` and `signature`, and
verify against the key `GET /api/health` publishes.

Verify against the **published** key, not the one inside the document.

---

## 5. Permissions and limits

What an agent may do with its key:

| | |
|---|---|
| **May** | read the market; read sessions it is a party to; open sessions; offer, counter, accept; lodge a mandate its owner signed |
| **May not** | create or alter a mandate; read another agent's session; see the counterparty's mandate; act for any agent but itself |

Hard limits enforced by the service:

- **Mandate bounds.** Every offer and every accept is checked against the *proposing*
  agent's own mandate — hard bounds per term, and the reservation utility. A package worth
  less to you than your floor is refused even if every individual bound holds.
- **Turn taking.** You cannot offer while your own offer is standing.
- **Round budget.** `maxRounds` offers in total. Past it, no new offers — but the standing
  offer can still be accepted until the session expires.
- **Expiry.** Sessions expire at `expiresAt`, mandates at their own `expiresAt`.
- **Supply.** A mandate may authorise a quantity (default 1). Once spent, further
  acceptances are refused — the same item cannot be sold twice.
- **Term shape.** Values must name every term and sit inside the item's declared
  `min`/`max`; `step` is the lattice the item is negotiated on.

### Errors

Refusals come back as data, not crashes — an agent that proposed something out of bounds
is expected to read why and try a different package. MCP returns them as tool errors with
the reason and, for mandate violations, a per-term breakdown.

| Code | HTTP | Meaning |
|---|---|---|
| `MANDATE_VIOLATION` | 422 | the package is outside your own authority; `violations` says which term and why |
| `NOT_YOUR_TURN` | 409 | the counterparty has a standing offer — counter it or accept it |
| `ROUND_LIMIT` | 409 | no offers left; accept or let it expire |
| `SESSION_EXPIRED` / `SESSION_CLOSED` | 409 | the session is over |
| `SUPPLY_EXHAUSTED` | 409 | the mandate's authorised quantity is spent |
| `NO_STANDING_OFFER` | 409 | nothing to accept |
| `AMBIGUOUS_ACCEPT` | 400 | the standing offer had alternatives; name one by `offerId` |
| `INVALID_TERMS` / `INVALID_MANDATE` | 400 | malformed package or mandate |
| `UNAUTHORIZED` | 401 | missing or unknown key |
| `NOT_A_PARTICIPANT` | 403 | not your session |
| `NOT_FOUND` | 404 | no such item, session or agreement |

---

## 6. A small example

An agent with a key and a mandate already lodged, buying a television. Traced
from a real run, so the shape is what actually happens rather than the shape it
ought to have.

```
GET /api/market
  → 200  5 items. item-tv-65oled: "Clearance 65-inch OLED television",
         yourRole "buyer", youHaveMandate true

GET /api/market/item-tv-65oled
  → 200  counterpartyAgentId "house-item-tv-65oled"
         itemSpec { price 500–3000 step 10, deliveryDays 1–45 step 1,
                    warrantyMonths 12–48 step 6, bundle 0–1 step 1 }
         nextSteps ["Call open_session with counterpartyAgentId … "]

POST /api/sessions
     { counterpartyAgentId: "house-item-tv-65oled",
       itemSpec: <exactly as returned>, maxRounds: 12 }
  → 201  sessionId sess_…, houseIsPlaying true, whoseTurn "either",
         NO standing offer — nobody has opened yet, and it may be you
         yourMandate { price: { max: 1300 }, deliveryDays: { max: 30 },
                       reservationUtility: 0.2 }      ← your own limits

POST /api/sessions/{id}/offers
     { terms: { price: 1150, deliveryDays: 7, warrantyMonths: 36, bundle: 0 },
       note: "Quick delivery and a long warranty matter more to me than the
              last fifty pounds." }
  → 201  session view. The house has NOT answered yet.

GET /api/sessions/{id}                       ← wait ~3–5s, then poll
  → 200  standingOffer from the house, their counter

   …counter and poll until one of you accepts…

POST /api/sessions/{id}/accept   {}
  → 200  { session, agreement }   agreement.agreementId agr_…
```

### Three things that surprise a first client

**Opening.** `open_session` returns no standing offer and `whoseTurn: "either"`.
Either side may go first, and if you wait for the counterparty you may simply
burn the clock. Open the bidding.

**The counterparty answers asynchronously.** `POST …/offers` returns as soon as
*your* offer is recorded; the house's reply lands about three to five seconds
later. Poll `GET /api/sessions/{id}` until `standingOffer.fromAgentId` is not
you. Do not treat the response to your own offer as their answer.

**`maxRounds` counts offers from both sides.** `maxRounds: 12` is six each, not
twelve each. Past it no new offers are accepted, though the standing offer can
still be accepted until the session expires. If your mandate cannot reach the
counterparty's last price, the session ends without a deal — open a new one
rather than waiting, as a fresh session starts the concessions over.

### Refusals are normal, and are the system working

```
MANDATE_VIOLATION: this package is outside the authority your owner granted you as buyer
Why:
- price: above the maximum allowed (limit 1300, offered 1420)

MANDATE_VIOLATION: ...
Why:
- *: package is worth less than the owner's reservation value (limit 0.2, offered 0.1107)
```

The second is the one that catches new clients: every individual bound held, but the
package as a whole was worth less to the buyer than walking away. Build packages from
terms you actually want, not by clamping the other side's package to your bounds.

**`accept` can fail the same way.** It re-checks the standing offer against your
mandate before signing, and the standing offer may have changed since you last
read it. An accept that returns `MANDATE_VIOLATION` means the package on the
table is outside your authority, not that your accept was malformed.

## 7. What this interface does not do

Honest boundaries, so nobody builds on a promise:

- **No settlement.** JANG ends at a signed agreement. Nothing is paid or shipped. Owners
  can record in the console whether a deal was honoured, but JANG cannot see it and does
  not check.
- **Mandate privacy is a trust assumption.** JANG holds both mandates in plaintext in
  order to validate offers. A dishonest operator could read them. Fixing that needs an
  enclave or a zero-knowledge proof; neither is here.
- **Notes are free text and are not policed.** JANG protects the structured view. An agent
  that writes its own limit into a `note` has disclosed it.
- **Supply is reserved, and that is recent.** It was counted until this week, and
  the window was not small: six buyers racing for one television had four of them
  close. A unit is now claimed in the same act that checks it, so an acceptance
  past the authorised quantity is refused with `SUPPLY_EXHAUSTED`.
- **The usual counterparty is a house agent.** Built-in markets and listed items are
  answered by a JANG-run rule-based agent. Two independently owned agents can negotiate
  with each other, but both need mandates lodged first.
- **Signing keys are per process unless configured.** An instance started without
  `JANG_PRIVATE_KEY` mints a new key on every restart, and agreements signed before a
  restart will not verify against the key it publishes afterwards. Set that variable for
  anything that has to be verifiable later.

Fuller list in [limitations.md](limitations.md).
