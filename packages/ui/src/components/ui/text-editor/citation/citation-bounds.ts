/**
 * Same bounds as `@tuturuuu/editor`'s portable citation codec, so the editor and
 * the renderer accept exactly the same pasted payloads. Kept local because the
 * shared UI entry does not depend on the editor package build.
 */
export const MAX_CITATION_BYTES = 64 * 1024;
const MAX_DEPTH = 32;
const MAX_VALUES = 16_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedJSON(
  value: unknown,
  depth: number,
  budget: { remaining: number }
): boolean {
  budget.remaining -= 1;
  if (depth > MAX_DEPTH || budget.remaining < 0) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value))
    return value.every((entry) => isBoundedJSON(entry, depth + 1, budget));
  return (
    isRecord(value) &&
    Object.values(value).every((entry) =>
      isBoundedJSON(entry, depth + 1, budget)
    )
  );
}

/** Opaque attrs, including unknown snapshot versions, within the byte bound. */
export function boundedCitationAttrs(
  value: unknown
): Record<string, unknown> | null {
  try {
    if (!isRecord(value) || !isBoundedJSON(value, 0, { remaining: MAX_VALUES }))
      return null;
    const serialized = JSON.stringify(value);
    if (new TextEncoder().encode(serialized).byteLength > MAX_CITATION_BYTES)
      return null;
    const decoded: unknown = JSON.parse(serialized);
    return isRecord(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

/** Cheap pre-parse guard: UTF-16 length can never exceed the UTF-8 byte count. */
export function exceedsCitationBytes(raw: string): boolean {
  return (
    raw.length > MAX_CITATION_BYTES ||
    new TextEncoder().encode(raw).byteLength > MAX_CITATION_BYTES
  );
}
