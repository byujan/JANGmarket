/**
 * Reading an advertisement and proposing what else could be negotiable.
 *
 * A listing with one term is a tug of war: price is the only thing on the
 * table, so every dollar one side gains the other loses. The worked examples
 * close more deals than that precisely because they carry four terms whose
 * weights disagree, and a seller can buy a price concession with a warranty
 * that costs them little.
 *
 * Asking an owner to describe a lattice is what made listing unusable in the
 * first place. So the prose they already wrote is read instead, and whatever
 * it suggests is put to them as a proposal they can edit or throw away.
 * Nothing here is adopted without their say-so: an invented term would be an
 * invented obligation.
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import { DimensionSchema, type Dimension } from "../jang/types.ts";
import { z } from "zod";

const SuggestionSchema = z.object({
  terms: z
    .array(
      DimensionSchema.extend({
        /** Why this is worth negotiating, in a few words, shown to the owner. */
        because: z.string().max(140),
      }),
    )
    .max(3),
});

export type SuggestedTerm = Dimension & { because: string };

const PROMPT = `You read classified advertisements and work out what, besides price, the two
sides could bargain over.

Reply with JSON only, no prose and no code fence, in this shape:
{"terms":[{"key":"deliveryDays","label":"Delivery","unit":"days","min":1,"max":30,"step":1,"buyerPrefers":"low","because":"the ad offers delivery for a bit more"}]}

Rules:
- At most three terms. Fewer is better. Zero is correct when the ad suggests nothing.
- Only terms the advertisement actually raises. Never invent an obligation the
  seller did not offer, and never add a warranty, a return window or a service
  to something nobody mentioned one for.
- Never propose price: that is already the headline term.
- key is camelCase and unique. label is what a person would call it.
- min and max are numbers a person would recognise, with min below max, and
  step small enough to move within that range. A yes-or-no term is min 0, max 1, step 1.
- buyerPrefers is "low" when a buyer wants a smaller number, "high" otherwise.
- because is a short phrase quoting or paraphrasing the ad.`;

/**
 * What the advertisement suggests. Returns nothing rather than throwing: a
 * suggestion that cannot be made is a listing without extra terms, which is
 * exactly where it started.
 */
export async function suggestTerms(input: {
  title: string;
  description?: string;
  termsNote?: string;
  listedRole: "buyer" | "seller";
}): Promise<{ terms: SuggestedTerm[]; unavailable?: string }> {
  const advert = [
    `Title: ${input.title}`,
    `The person listing it is the ${input.listedRole}.`,
    input.description ? `Description:\n${input.description}` : undefined,
    input.termsNote ? `They also said:\n${input.termsNote}` : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const response = query({
      prompt: advert,
      options: { model: "claude-sonnet-5-5", maxTurns: 1, systemPrompt: PROMPT, allowedTools: [] },
    });

    let text = "";
    for await (const message of response) {
      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type === "text") text += block.text;
        }
      }
    }

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return { terms: [] };

    const parsed = SuggestionSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
    if (!parsed.success) return { terms: [] };

    // The model is not trusted to have obeyed the arithmetic: a range with
    // nowhere to move, or a step bigger than the range, would be refused when
    // the listing was saved and is better dropped here.
    return {
      terms: parsed.data.terms.filter(
        (term) =>
          term.key !== "price" &&
          term.max > term.min &&
          term.step > 0 &&
          term.step <= term.max - term.min,
      ),
    };
  } catch (error) {
    return { terms: [], unavailable: error instanceof Error ? error.message : String(error) };
  }
}
