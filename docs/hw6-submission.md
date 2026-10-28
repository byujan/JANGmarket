# HW6 — MVP submission

## The paragraph

> JANG is negotiation infrastructure for autonomous agents: the layer between agent
> discovery and agent payment, where a buyer agent and a seller agent agree what the deal
> actually is. Each owner signs a mandate — hard limits, what they care about, and the
> point below which a deal is not worth doing — and lodges it with JANG; neither agent
> ever sees the other's. In our MVP two agents connect to the JANG MCP server over stdio
> and negotiate a clearance television across price, delivery date, warranty and a bundled
> soundbar, making real `offer`, `counter` and `accept` tool calls against a running
> service. They closed in 11 rounds and 48 MCP tool calls, and JANG issued an
> Ed25519-signed agreement. We check the result independently: a separate script re-derives
> the agreement, verifies JANG's signature, confirms a tampered copy fails that check, and
> re-tests every agreed term against both owners' mandates — seven checks, zero violations.
> Five misuse probes are all refused by the service: an agent offering below its own floor,
> an agent accepting above its own ceiling, a stranger reading someone else's session, and
> the counterparty's mandate leaking into a session view. Across 40 randomised markets,
> negotiation closed 20 of the 25 deals that were actually possible, against 2 at a posted
> price and 9 at an oracle price that knows both private limits, with zero constraint
> violations. Current limitation: JANG holds both mandates in plaintext to validate offers,
> so mandate privacy is a trust assumption about the operator rather than a cryptographic
> guarantee — closing that needs an enclave or a zero-knowledge proof, and neither is in
> this prototype.

(Trim to taste; the required parts are what it does, that agents really used it, the
verification, and the one limitation.)

## The one-minute video

A suggested cut. Run commands in a clean terminal, large font.

| Time | What is on screen | What to say |
|---|---|---|
| 0:00–0:08 | `npm run demo`, section 1 and 2 | "JANG is where two agents agree what a deal is. Each owner signs a private mandate — the buyer's ceiling is $1,500, the seller's floor is $1,180. Neither agent sees the other's." |
| 0:08–0:14 | section 3, the MCP tool list | "Both agents connect to the JANG MCP server. Every move is a real tool call." |
| 0:14–0:32 | section 4 scrolling | "They open far apart and trade across four terms at once — the seller gives up the soundbar and a faster delivery rather than cut price. Twelve rounds, under a second." |
| 0:32–0:42 | sections 5 and 6 | "JANG signs the agreement. Both owners end above their reservation — and at the posted shelf price, this buyer would have walked away. No sale at all." |
| 0:42–0:52 | `npm run verify` | "An independent script re-checks it: JANG's signature, a tampered copy failing, and every term against both mandates. Seven checks, zero violations." |
| 0:52–1:00 | `npm run misuse` | "And when an agent tries to go beyond what its owner authorised, JANG refuses. Five probes, all blocked." |

If there is room, cut in two seconds of `npm run demo:llm` showing two Claude agents doing
the same thing.

## Checklist

- [ ] record the video, upload unlisted to YouTube
- [ ] paragraph above, trimmed, in the Canvas submission
- [ ] both team members named: Peter Jang, Hendrick Jung
- [ ] class team spreadsheet updated: members, title "JANG 場 — negotiation infrastructure
      for autonomous agents", unlisted YouTube link
- [ ] each team member submits the same deliverables in Canvas
