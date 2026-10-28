# How Peter and Hendrick split the work

The split follows a simple rule: **Hendrick owns the market, Peter owns the machine.**
Hendrick's work lands in data files, prompts and prose that the engine validates on load,
so a mistake there fails loudly in a test rather than quietly in a demo. Peter reviews
every pull request.

## Boundaries

| Area | Owner | Files |
|---|---|---|
| Domain core, crypto, state machine | Peter | `src/lib/jang/**` |
| REST API, store, MCP server | Peter | `src/app/api/**`, `src/lib/store/**`, `mcp/**` |
| Agent harness and strategies | Peter | `agents/*.ts` |
| **Market design: items, mandates, baselines** | **Hendrick** | `agents/scenarios/*.json` |
| **Agent personas and negotiating posture** | **Hendrick** | `agents/prompts/*.md` |
| **Results, framing, submission** | **Hendrick** | `docs/*.md`, the video, the spreadsheet |

The contract between the two halves is `ScenarioSchema` in `src/lib/jang/scenario.ts`. It
validates every scenario file, and `src/lib/jang/scenario.test.ts` asserts the shipped
scenario is coherent: mandates verify, a zone of possible agreement exists, and the posted
price is one the buyer would actually walk away from. If Hendrick writes a scenario where
no deal is possible, or where the fixed price trivially clears, those tests fail.

## Immediate (before the HW6 video)

**Peter** — done: core, API, MCP server, both agent strategies, demo, verifier, misuse
probes, benchmark.

**Hendrick** — next:

1. Read `agents/scenarios/tv-clearance.json` and sanity-check the economics. The numbers
   are placeholders chosen to make a readable demo, not researched ones. Are a $1,180 floor
   and a $1,500 budget on a clearance 65-inch OLED plausible? Is a soundbar really worth
   only a tenth of the package to a buyer? Adjust the weights and bounds and re-run
   `npm test` and `npm run demo`.
2. Add a second scenario in a different market — a service contract, say, where the terms
   are rate, deadline, revisions and scope. One file, no code. It proves the claim that the
   protocol generalises beyond one product category, which is the open question in our
   proposal.
3. Tighten the two personas in `agents/prompts/`. They drive the Claude agents, and the
   quality of the negotiation in `npm run demo:llm` depends mostly on them.
4. Own `docs/hw6-submission.md`: record the video, trim the paragraph, update the
   spreadsheet.

## Phase 1 and beyond

Peter takes the Postgres store, agent accounts and keys, the streamable-HTTP MCP endpoint,
and deployment to `jangmarketplace.com`. Hendrick takes the market design that a real
marketplace needs: what a listing is, how an owner expresses a mandate without writing
JSON, what the pricing and take-rate model looks like, and which category to launch in.

The natural next shared piece is the **mandate builder** — the screen where an owner sets
the authority they are delegating. It is Hendrick's design problem and Peter's
implementation, and it is the point where JANG stops being a protocol and starts being a
product.
