/**
 * A stable, exact serialisation for golden-baseline tests.
 *
 * Keys are sorted so two objects built in a different order serialise the
 * same; Maps and Sets become sorted arrays; numbers are written the way
 * `JSON.stringify` writes them, which is the shortest string that round-trips
 * to the same double — so a one-ULP change in any number changes the text.
 * There is no rounding here on purpose: a baseline that rounds cannot tell a
 * reassociated sum from the original one.
 */
export function canonical(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonical);
  if (value instanceof Map) {
    return [...value.entries()]
      .map(([key, entry]) => [canonical(key), canonical(entry)] as const)
      .sort((a, b) => JSON.stringify(a[0]).localeCompare(JSON.stringify(b[0])));
  }
  if (value instanceof Set) {
    return [...value].map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const entry = (value as Record<string, unknown>)[key];
    if (entry !== undefined) out[key] = canonical(entry);
  }
  return out;
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(canonical(value), null, 1)}\n`;
}
