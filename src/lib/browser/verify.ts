/**
 * Checking JANG's signature in the reader's own browser.
 *
 * The receipt page could simply report what the server said about its own
 * signature, which would be worth nothing: the party that signed a document is
 * the last party whose word you should take for whether the signature is good.
 * This re-derives the signed bytes and verifies them here, against the public
 * key the instance publishes, using only WebCrypto.
 */
import { canonicalJson } from "../jang/canonical.ts";
import type { Agreement } from "../jang/types.ts";

const ALGORITHM = "Ed25519";

function fromBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** The inverse of the server's PEM wrapping: strip the armour, decode the DER. */
function spkiFromPem(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\s+/g, "");
  return fromBase64(body);
}

export type Verification = { ok: boolean; reason?: string; otherKey?: boolean };

export async function verifyAgreementHere(agreement: Agreement, jangPublicKeyPem: string): Promise<Verification> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    return { ok: false, reason: "this browser does not offer WebCrypto" };
  }
  try {
    const key = await crypto.subtle.importKey("spki", spkiFromPem(jangPublicKeyPem), { name: ALGORITHM }, false, [
      "verify",
    ]);
    // Exactly the fields the server signed: the body without the three it adds
    // once the signature exists.
    const { algorithm: _algorithm, jangPublicKey: _key, signature, ...body } = agreement;
    const ok = await crypto.subtle.verify(
      ALGORITHM,
      key,
      fromBase64(signature),
      new TextEncoder().encode(canonicalJson(body)).buffer as ArrayBuffer,
    );
    if (ok) return { ok };
    // An instance with no JANG_PRIVATE_KEY set mints a fresh signing key every
    // time it restarts, which makes everything it signed before unverifiable
    // against the key it publishes now. That is worth saying plainly, because
    // it is nothing like the terms having been altered.
    const otherKey = agreement.jangPublicKey.replace(/\s+/g, "") !== jangPublicKeyPem.replace(/\s+/g, "");
    return {
      ok,
      otherKey,
      reason: otherKey
        ? "it was signed with a key this instance no longer holds"
        : "the signature does not match these terms",
    };
  } catch (problem) {
    return { ok: false, reason: problem instanceof Error ? problem.message : String(problem) };
  }
}
