/**
 * Photographs arriving with a listing.
 *
 * The browser resizes and re-encodes before sending, so what reaches here is
 * already small. These caps are the second line: the client is not trusted to
 * have obeyed, and a listing is not a place to upload a film.
 */
import { JangError } from "../jang/types.ts";

export const MAX_IMAGES = 6;
/** Per photograph, after decoding. The browser aims well under this. */
export const MAX_BYTES = 900_000;

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

const DATA_URL = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i;

/**
 * A `data:` URL as the browser's canvas produces it, turned into bytes.
 *
 * Only the three formats every browser can both read and write are allowed:
 * an SVG would let a listing carry script, and the exotic formats are not
 * worth the surface.
 */
export function decodeDataUrl(value: string): { mime: string; bytes: Buffer } {
  const match = DATA_URL.exec(value.trim());
  if (!match) throw new JangError("INVALID_TERMS", "a photograph was not a base64 data URL");

  const mime = match[1]!.toLowerCase();
  if (!ALLOWED.has(mime)) {
    throw new JangError("INVALID_TERMS", `${mime} photographs are not accepted; use JPEG, PNG or WebP`);
  }

  const bytes = Buffer.from(match[2]!, "base64");
  if (bytes.length === 0) throw new JangError("INVALID_TERMS", "a photograph decoded to nothing");
  if (bytes.length > MAX_BYTES) {
    throw new JangError(
      "INVALID_TERMS",
      `a photograph is ${Math.round(bytes.length / 1000)}KB, above the ${Math.round(MAX_BYTES / 1000)}KB limit`,
    );
  }
  return { mime, bytes };
}

export function decodeAll(values: string[] | undefined): { mime: string; bytes: Buffer }[] {
  if (!values?.length) return [];
  if (values.length > MAX_IMAGES) {
    throw new JangError("INVALID_TERMS", `a listing takes at most ${MAX_IMAGES} photographs`);
  }
  return values.map(decodeDataUrl);
}
