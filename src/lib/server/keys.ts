import { createHash } from "node:crypto";
import { generateKeyPair } from "../jang/crypto.ts";

/**
 * JANG's signing identity. Supplied through the environment in any deployed
 * setting; generated once per process for local demos so there is nothing to
 * set up before `npm run demo`.
 */
function loadKeys(): { privateKeyPem: string; publicKeyPem: string } {
  const privateKeyPem = process.env.JANG_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const publicKeyPem = process.env.JANG_PUBLIC_KEY?.replace(/\\n/g, "\n");
  if (privateKeyPem && publicKeyPem) return { privateKeyPem, publicKeyPem };
  return generateKeyPair();
}

const globalForKeys = globalThis as unknown as { __jangKeys?: ReturnType<typeof loadKeys> };
export const jangKeys = (globalForKeys.__jangKeys ??= loadKeys());

/**
 * A short, stable handle for the key JANG signs agreements with. Worth showing
 * because an agreement is only as good as knowing which key signed it, and the
 * key changes whenever a keyless instance restarts.
 */
export function keyFingerprint(): string {
  return createHash("sha256").update(jangKeys.publicKeyPem).digest("hex").slice(0, 8);
}
