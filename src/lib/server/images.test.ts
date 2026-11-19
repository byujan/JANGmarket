import { describe, expect, it } from "vitest";
import { JangError } from "../jang/types.ts";
import { decodeAll, decodeDataUrl, MAX_BYTES, MAX_IMAGES } from "./images.ts";

const dataUrl = (mime: string, body: Buffer) => `data:${mime};base64,${body.toString("base64")}`;
const jpeg = (size: number) => dataUrl("image/jpeg", Buffer.alloc(size, 7));

describe("photographs arriving with a listing", () => {
  it("decodes a data URL the way the browser wrote it", () => {
    const image = decodeDataUrl(dataUrl("image/jpeg", Buffer.from("hello")));
    expect(image.mime).toBe("image/jpeg");
    expect(image.bytes.toString()).toBe("hello");
  });

  it("accepts the three formats every browser can read and write", () => {
    for (const mime of ["image/jpeg", "image/png", "image/webp"]) {
      expect(decodeDataUrl(dataUrl(mime, Buffer.from("x"))).mime).toBe(mime);
    }
    // Upper case from some clients is still the same type.
    expect(decodeDataUrl(dataUrl("IMAGE/JPEG", Buffer.from("x"))).mime).toBe("image/jpeg");
  });

  it("refuses an SVG, which would let a listing carry script", () => {
    expect(() => decodeDataUrl(dataUrl("image/svg+xml", Buffer.from("<svg/>")))).toThrow(JangError);
  });

  it("refuses anything that is not a base64 data URL", () => {
    for (const bad of ["https://example.com/cat.jpg", "data:image/jpeg,notbase64", "", "   "]) {
      expect(() => decodeDataUrl(bad)).toThrow(JangError);
    }
  });

  it("does not trust the browser to have resized", () => {
    // The client caps itself, so this is the second line, not the first.
    expect(() => decodeDataUrl(jpeg(MAX_BYTES + 1))).toThrow(/above the .* limit/);
    expect(decodeDataUrl(jpeg(MAX_BYTES)).bytes.length).toBe(MAX_BYTES);
    // A payload that parses as base64 but carries no bytes.
    expect(() => decodeDataUrl("data:image/jpeg;base64,=")).toThrow(/decoded to nothing/);
  });

  it("caps how many a listing may carry", () => {
    const one = dataUrl("image/jpeg", Buffer.from("x"));
    expect(decodeAll(Array.from({ length: MAX_IMAGES }, () => one))).toHaveLength(MAX_IMAGES);
    expect(() => decodeAll(Array.from({ length: MAX_IMAGES + 1 }, () => one))).toThrow(
      new RegExp(`at most ${MAX_IMAGES}`),
    );
  });

  it("treats no photographs as a listing without any, not an error", () => {
    expect(decodeAll(undefined)).toEqual([]);
    expect(decodeAll([])).toEqual([]);
  });
});
