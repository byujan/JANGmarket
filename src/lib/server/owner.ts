/**
 * The bridge between a signed-in person and the negotiation layer.
 *
 * Agents authenticate with an API key against /api/*; people authenticate with
 * Clerk against /app and /admin. This module is the only place the two meet.
 */
import { currentUser } from "@clerk/nextjs/server";
import { JangError, type Mandate } from "../jang/types.ts";
import { store } from "../store/index.ts";
import type { OwnerRecord } from "../store/types.ts";

/** Admins are an env allowlist rather than Clerk organisations: there are two of us. */
function adminEmails(): string[] {
  return (process.env.JANG_ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export type SignedInOwner = OwnerRecord & { isAdmin: boolean };

/**
 * The owner record for the current Clerk user, created on first sight.
 * Returns undefined when nobody is signed in, so callers can decide between
 * redirecting and returning 401.
 */
export async function currentOwner(): Promise<SignedInOwner | undefined> {
  const user = await currentUser();
  if (!user) return undefined;

  const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
  const existing = await store.getOwnerByClerkId(user.id);
  const owner: OwnerRecord = existing ?? {
    ownerId: `own_${user.id}`,
    clerkUserId: user.id,
    email,
    displayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || email,
    createdAt: new Date().toISOString(),
  };

  // Keep the profile fresh, and create the row the first time we see them.
  if (!existing || existing.email !== email) {
    await store.upsertOwner({ ...owner, email });
  }

  return { ...owner, email, isAdmin: Boolean(email && adminEmails().includes(email.toLowerCase())) };
}

export async function requireOwner(): Promise<SignedInOwner> {
  const owner = await currentOwner();
  if (!owner) throw new JangError("UNAUTHORIZED", "sign in to continue");
  return owner;
}

export async function requireAdmin(): Promise<SignedInOwner> {
  const owner = await requireOwner();
  if (!owner.isAdmin) throw new JangError("UNAUTHORIZED", "this view is for JANG operators");
  return owner;
}

/**
 * Trust on first use for an owner's signing key.
 *
 * The first mandate an owner lodges registers the public key that signed it.
 * Every later mandate must carry the same key, so a stolen session cannot
 * quietly swap in a different signer.
 */
export async function bindOwnerKey(owner: OwnerRecord, mandate: Mandate): Promise<void> {
  const known = (await store.getOwner(owner.ownerId))?.publicKey;
  if (!known) {
    await store.upsertOwner({ ...owner, publicKey: mandate.ownerPublicKey });
    return;
  }
  if (normalise(known) !== normalise(mandate.ownerPublicKey)) {
    throw new JangError(
      "INVALID_MANDATE",
      "this mandate was signed with a different key than the one registered to your account",
    );
  }
}

function normalise(pem: string): string {
  return pem.replace(/\s+/g, "");
}
