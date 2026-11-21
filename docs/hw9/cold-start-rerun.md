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
