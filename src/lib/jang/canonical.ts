/**
 * Canonical JSON: deterministic key ordering so that two processes signing or
 * verifying the same logical object always produce byte-identical input.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) continue;
      sorted[key] = sortDeep(source[key]);
    }
    return sorted;
  }
  return value;
}
