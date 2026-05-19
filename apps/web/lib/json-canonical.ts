/**
 * Canonical JSON encoder. Encodes a value with object keys sorted
 * lexicographically so the resulting string is stable across runs and
 * across runtimes. Auditors recompute a DDS bundle's `contentHash` by
 * removing the `contentHash` field, running this encoder over the rest,
 * and SHA-256ing the output.
 *
 * Arrays preserve their order (semantically meaningful in our event
 * payloads); only object key order is normalised. Primitives go
 * through `JSON.stringify`'s default rules.
 */
export function canonicaliseJson(value: unknown): string {
  return JSON.stringify(value, sortedKeyReplacer);
}

function sortedKeyReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return value;
}
