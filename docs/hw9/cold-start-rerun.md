# Cold start, rerun after `describe_item` returned the agent's own mandate

*Hendrick, 2026-11-21. This pre-run section was committed before the run.*

## Why rerun

HW9's second cold-start run closed a deal but listed six further problems. The
sharpest was that **an agent could not see its own mandate until after it had
committed to a session**. `describe_item` now returns `yourMandate` and names
the hard limits in its first `nextSteps`. This run asks whether a fresh agent
uses that, and whether anything else breaks.

## Same as HW9 run 2

- **Instance:** this branch (`hendrick/own-mandate`), memory store,
  `PORT=8883`. The house bargains as it does by default.
- **Owner setup, before the run:** register `coldstart-client-3` and lodge a
  buyer mandate for `item-tv-65oled` with the same limits as HW9: price at most
  1,300; delivery at most 30 days; reservation 0.2. These are the TV scenario's
  own buyer limits.
- **The client:** a fresh agent session with no memory of this project. It gets
  the interface document, the base URL, one API key and the task below, and
  nothing else. It is told not to read the repository's source. No messages
  mid-run.
- **Task:** *"You have an API key for a service called JANG at
  `http://localhost:8883`. The documentation is in the file you were given.
  Using only that document and the key, acquire a 65-inch OLED television on
  the best terms you can get, and report what you agreed to."*

## Disclosure

Self-run, not independent. The client is a subagent started from the same
Claude Code session that made the change, on the same machine, and it is the
same model family as the house. It is told not to read the source, and its
tool calls are reported back so that can be checked. One run, one market.

## Checks, fixed now

HW9's six, unchanged. The run succeeds if **all** hold:

1. It **discovers** the item itself.
2. It **opens a session** and exchanges at least one offer.
3. A **JANG-signed agreement** exists for that session.
4. The terms lie **inside both mandates**, checked independently.
5. The signature **verifies** against the instance's published key.
6. Its **reported terms match** the signed document, compared term by term.

Added for the change under test, also pass/fail:

7. It calls `describe_item` (`GET /api/market/{itemId}`) **before** opening a
   session. That call is where the limits now are.
8. **No offer or accept of its own is refused as `MANDATE_VIOLATION`.** That
   refusal is what HW9 run 1 hit, by bargaining at a price above its own cap.

Observed, not pass/fail: whether its report shows it planned against its limits
before opening, and how many HTTP calls it used (run 2: 16).

Checks 3–5 and 8 are run against the instance, not taken from the client's
report.

---

## The run — agreement reached, all eight checks pass

*Run 2026-11-21, 08:52–08:55 UTC.*

**Deviation from the plan above.** The instance came up on port **3939** (the
repository's default) rather than 8883, so the client was given
`http://localhost:3939`. Nothing else changed: same branch, memory store, house
bargaining by default, same mandate, same task wording apart from the port.

**Client.** A fresh subagent. It read exactly two files, the interface
document and the key file, both copied to a folder outside the repository. All
its other actions were HTTP requests to the instance and small helper scripts
of its own. Its tool log was checked: no access to the repository or to the
owner's setup file.

**Outcome.** Agreement `agr_1aad4ad2-e52d-4523-be6b-e3402375cbbd`: **price
1,130 · delivery 14 days · warranty 36 months · no soundbar.** The house
accepted the client's offer at round 16 (the client chose `maxRounds` 20
itself). The house opened at 1,850 and came down to 1,150.

| # | Check | Result | How |
|---|---|---|---|
| 1 | Discovered the item itself | **pass** | server log: its first call after `/api/health` was `GET /api/market` |
| 2 | Opened a session, exchanged offers | **pass** | 8 offers of its own, all `201` |
| 3 | JANG-signed agreement exists | **pass** | `GET /api/agreements/{id}` → 200 |
| 4 | Terms inside both mandates | **pass** | `checkTermsAgainstMandate`: buyer mandate as lodged, and the house mandate rebuilt from the scenario's seller party: both `ok` |
| 5 | Signature verifies against the published key | **pass** | `verifyAgreementSignature` with the key from `/api/health` |
| 6 | Reported terms match the signed document | **pass** | compared term by term |
| 7 | `describe_item` before opening a session | **pass** | server log: `GET /api/market/item-tv-65oled` twice, then `POST /api/sessions` |
| 8 | No `MANDATE_VIOLATION` on its own moves | **pass** | server log: every request 200/201, no 422 |

**Observed.** It planned against its limits before opening. Its report lists
the mandate as read from `describe_item` (price at most 1,300; delivery at most
30; the weights; reservation 0.2), and every offer it made was at or below
1,130. It traded delivery (its lowest weight) and the soundbar for price, which
matches its owner's weights. **24 HTTP calls** against run 2's 16. The extra
calls are polling: it read the session after each offer.

**What the document still gets wrong, from its report.** These are new findings
for the next fix, all in `docs/agent-interface.md`:

- The house can post the first offer about two seconds after opening, before
  the client moves. §6 says "it may be you", which reads as if it will be.
- The open-session response has no `market` field, though §4.4 lists it. A
  later `GET` has it.
- The session's default lifetime (15 minutes) is not stated, nor that it can be
  far shorter than the mandate's.
- "Canonical JSON" in §4.5 is not defined. Sorted keys, no whitespace verified.
- How utility is scored between and beyond `worst` and `ideal` is not stated.
- It does not say the house may accept your offer on its own, or that a last
  offer nobody accepts ends the session with no deal.
- The MCP example uses port 8883. The default is 3939.
- §6 says "5 items" (there were 4) and a note says "fifty pounds" on a USD item.
- It links `limitations.md`, which an integrator is not given.

**Limits of this result.** Self-run: the client is a subagent of the session
that made the change, on the same machine, and the same model family as the
house. One run, one market. It shows the change is used and nothing broke. It
does not show another team's agent would do the same.
