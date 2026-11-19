# Final presentation: video script

Two minutes forty-five, which leaves room under a three-minute cap. Narration is
about 420 words — read at a normal pace, not rushed.

The deck ([JANG-final-deck.pptx](JANG-final-deck.pptx)) bookends it: slide 1 to
open, slides 3 and 4 to close. The middle is the app.

---

## Before you record

- [ ] Signed in at `localhost:8883`, dev server running
- [ ] `claude` logged in, or `ANTHROPIC_API_KEY` set — otherwise negotiations
      fall back to the deterministic agent and the notes read as a template
- [ ] **Run one negotiation and leave it finished.** Every older agreement was
      signed by a key the instance no longer holds and will show that warning.
      A fresh one shows "Verified in your browser", which is the shot you want.
- [ ] Have `npm run market -- --buyers=6 --supply=1` ready in a terminal, run
      once already so it is warm
- [ ] `JANG_AUTOPLAY_DELAY_MS` can slow the live view if it reads too fast
- [ ] Browser at 1440 wide, no bookmarks bar, dark theme as it ships

---

## 0:00–0:22 · The problem

**Screen.** Slide 1.

> Agents can find each other. Agents can pay each other. What they cannot do is
> agree what the deal actually is — not just the price, but the delivery date,
> the warranty, the quantity, all at once.
>
> JANG is that layer. It only exists between agents, and the agents in it act on
> authority their owners delegated, which means that authority has to be
> enforced rather than trusted.

## 0:22–0:50 · Listing, in a person's own words

**Screen.** `/app/items/new`. Photos already attached. Scroll past the asking
price to the description, then press **Read this and suggest terms**.

> Listing something is a photograph, a paragraph and a price. No schemas.
>
> But a deal about price alone is a tug of war — every pound one side gains, the
> other loses. So JANG reads the advertisement and proposes what else is on the
> table. Here it found the lock and the Cambridge delivery, quoting the
> sentences that offered them. It invented nothing: this bicycle has no
> warranty, and it did not pretend otherwise.

## 0:50–1:12 · The authority

**Screen.** `/app/limits`, then into one item.

> This is the part nobody else sees. I sign my limits in my browser — JANG never
> holds the key — and lodge them. From then on JANG checks every offer against
> them and refuses anything beyond, including offers from my own agent.
>
> My counterparty never sees any of this. They see offers, and nothing else.

## 1:12–1:52 · Two agents talking

**Screen.** Press **Start negotiating**, land on the live view. Let offers
appear. Read one note aloud from the screen.

> Both sides are Claude agents now, so this is a conversation rather than a
> machine conceding.
>
> *(read the seller's note)*
>
> Watch what that is: not splitting a difference. The seller says where it has
> least room, and the buyer uses that — giving up delivery time to buy a longer
> warranty. That is a trade, and it is the thing a fixed price cannot reach.

## 1:52–2:08 · The agreement

**Screen.** Open the agreement. Scroll to the signature block.

> JANG signs the result. The terms, both mandates it was checked against, and an
> Ed25519 signature.
>
> And this line matters: that signature was just verified **in my browser**,
> against the key the instance publishes. The party that signed a document is
> the last party whose word you should take for whether it is valid.

## 2:08–2:28 · Scarcity, and a refusal

**Screen.** Terminal: `npm run market -- --buyers=6 --supply=1`. Let it finish.

> Six buyers, one television. One closes. Five are refused at the moment of
> acceptance, because the seller's mandate authorised one unit and JANG will not
> let the same item be sold twice.
>
> That refusal is the system working. It is also a bug we found this week: supply
> was being counted rather than reserved, and four of six were closing. It
> reserves now.

## 2:28–2:45 · What held, what did not

**Screen.** Slide 3, then slide 4.

> On markets where a deal exists, negotiating four terms closed eighty-one
> percent against fifty-three for price alone. On one market, Claude agents
> closed eight of eight where price-only closed none — there were fourteen
> hundred feasible packages and not one of them at price alone.
>
> Our second claim failed. The deals are not worth more jointly; JANG splits the
> surplus more evenly rather than enlarging it. We pre-registered that check, so
> we report it.
>
> And mandate privacy is still a trust assumption about the operator, not
> cryptography. That is the next thing.

---

## If you need to cut to two minutes

Drop **0:50–1:12** (the limits section) and say the sentence "my limits are
signed in my browser and JANG enforces them" over the live negotiation instead.
Keep the refusal and keep the failed claim: they are what make it credible.

## Numbers used, and where they come from

| Claim | Source |
|---|---|
| 81% vs 53% closing | [hw7/HW7_report.md](../hw7/HW7_report.md) §3.1, ordinary with fix, fresh seeds — 47/58 vs 31/58 |
| 8 of 8 vs 0 of 8 | HW7 §3.2, market #0; 1443 feasible four-term packages, none price-only |
| Joint value not supported | HW7 §5, paired efficiency −0.030; buyer share 0.55 vs 0.27 |
| Six buyers, one unit | `npm run market -- --buyers=6 --supply=1` |
| Mandate privacy | [limitations.md](../limitations.md) §1 |
