# HW9 Part 2: Cold-start integration

*Owner: Peter Jang.*

**This file's pre-run section was committed before the run.** The success checks
below were fixed in advance so they could not be written to fit whatever
happened, in the same way `docs/hw7/protocol.md` was committed before the HW7
seeds were drawn.

---

## The question

Can an agent that knows nothing about JANG — that was not built around our demo
and has never seen this repository — read [the interface
document](../agent-interface.md), take an API key, and close a real deal?

## Disclosure, up front

- **Self-run, not independent.** The client is a fresh agent session started by
  us, not another team's agent. It has no memory of this project and did not
  see the repository's source, but it is our harness and we say so.
- **What the client is given:** the interface document, the base URL, one API
  key, and a task in English. Nothing else.
- **What the client is not given:** any sequence of calls, any endpoint or tool
  name not already in the document, the expected terms, or any hint about what
  a good outcome looks like. No messages are relayed mid-run; it either works
  from the document or it does not.
- **Manual help during the run:** to be recorded below, including none.

## Setup the owner does first, and why

Registering an agent and signing its mandate are **owner** acts, not agent acts,
and deliberately so: an agent that could write its own mandate would be an agent
with unlimited authority. So before the run we register `coldstart-client` and
lodge a buyer mandate for the television, exactly as any owner would for any
agent, and hand over only the key.

This is authorized access, not scaffolding. The client is told nothing about
what the mandate contains.

## The task given to the client

> You have an API key for a service called JANG at `http://localhost:8883`.
> The documentation is at `docs/agent-interface.md`. Using only that document
> and the key, acquire a 65-inch OLED television on the best terms you can get,
> and report what you agreed to.

## What counts as a useful result

Fixed before the run. The run succeeds if **all** of:

1. The client **discovers** the item itself rather than being told its id.
2. It **opens a session** and exchanges at least one offer with the counterparty.
3. A **JANG-signed agreement** exists for that session.
4. The agreed terms lie **inside the client's own mandate** — checked
   independently, not taken from the client's report.
5. The signature **verifies** against the key the instance publishes.
6. The client **reports the terms it agreed to**, and they match the signed
   document. Agreeing to something and reporting something else is a failure of
   result use even when the deal is valid.

A refusal along the way is not a failure. JANG refusing an out-of-mandate offer
is the authority model working, and an agent that reads the refusal and
corrects itself is a better result than one that never tested a limit.

## How each check will be run

Independently of whatever the client says, against the database and the
published key:

| Check | How |
|---|---|
| 1, 2 | `events` and `offers` rows for the session, and the tool calls the client made |
| 3 | `agreements` row joined to the session |
| 4 | `checkTermsAgainstMandate(terms, mandate)` for both sides |
| 5 | `verifyAgreementSignature(agreement, jangKeys.publicKeyPem)` |
| 6 | compare the client's reported terms to `agreements.body->'terms'` |

Written up in [part2-cold-start-run.md](part2-cold-start-run.md) after the run,
including the failure modes if it does not complete.
