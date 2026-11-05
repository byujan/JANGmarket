/**
 * Owner signing keys, held in the browser.
 *
 * The private key is generated here and never sent anywhere: JANG receives a
 * mandate body, a signature and a public key, and can verify the first against
 * the other two without ever being able to produce one itself.
 *
 * The key lives in localStorage, which is a real tradeoff. Clearing site data
 * loses it, and any script on this origin can read it. The alternative, a
 * non-extractable WebCrypto key, cannot be backed up or carried to another
 * device, which is worse for a person who owns their own mandates.
 */
import { canonicalJson } from "../jang/canonical.ts";
import type { MandateBody } from "../jang/types.ts";

const STORAGE_KEY = "jang.owner-key.v1";
const ALGORITHM = "Ed25519";

export type OwnerKey = { publicKeyPem: string; privateJwk: JsonWebKey };

function toBase64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

/** SPKI DER wrapped as PEM, which is what the server's verifier expects. */
function toPem(spki: ArrayBuffer): string {
  const body = toBase64(spki).replace(/(.{64})/g, "$1\n").trimEnd();
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----\n`;
}

export function isSupported(): boolean {
  return typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined";
}

/** A fresh owner keypair. Exported so the round trip can be tested. */
export async function createOwnerKey(): Promise<OwnerKey> {
  const pair = (await crypto.subtle.generateKey({ name: ALGORITHM }, true, ["sign", "verify"])) as CryptoKeyPair;
  return {
    publicKeyPem: toPem(await crypto.subtle.exportKey("spki", pair.publicKey)),
    privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
  };
}

/** The owner's key, created on first use and reused thereafter. */
export async function loadOrCreateOwnerKey(): Promise<OwnerKey> {
  const stored = readStoredKey();
  if (stored) return stored;
  const created = await createOwnerKey();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(created));
  return created;
}

export function readStoredKey(): OwnerKey | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as OwnerKey;
    return parsed.publicKeyPem && parsed.privateJwk ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function forgetOwnerKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Sign a mandate body. The canonicalisation is shared with the server, so both
 * sides hash exactly the same bytes.
 */
export async function signMandateBody(body: MandateBody, key: OwnerKey): Promise<string> {
  const privateKey = await crypto.subtle.importKey("jwk", key.privateJwk, { name: ALGORITHM }, false, ["sign"]);
  const payload = new TextEncoder().encode(canonicalJson(body));
  return toBase64(await crypto.subtle.sign({ name: ALGORITHM }, privateKey, payload));
}
