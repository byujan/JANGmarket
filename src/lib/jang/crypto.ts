import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as nodeSign,
  verify as nodeVerify,
} from "node:crypto";

export type KeyPairPem = { privateKeyPem: string; publicKeyPem: string };

export function generateKeyPair(): KeyPairPem {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

/** Ed25519 signature over a canonical payload, base64-encoded. */
export function signPayload(payload: unknown, privateKeyPem: string, canonicalize: (v: unknown) => string): string {
  const key = createPrivateKey(privateKeyPem);
  return nodeSign(null, Buffer.from(canonicalize(payload), "utf8"), key).toString("base64");
}

export function verifyPayload(
  payload: unknown,
  signatureB64: string,
  publicKeyPem: string,
  canonicalize: (v: unknown) => string,
): boolean {
  try {
    const key = createPublicKey(publicKeyPem);
    return nodeVerify(null, Buffer.from(canonicalize(payload), "utf8"), key, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}
