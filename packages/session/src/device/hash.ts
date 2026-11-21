/**
 * The request hash of a mutation: SHA-256 over the UTF-8 bytes of
 * `canonicalJson` of the mutation without `operationId` and `nowMs`, with
 * byte arrays as canonical base64url strings.
 */
import { canonicalJson, encodeBase64Url, utf8 } from '../encoding';
import type { DeviceMutation } from './types';

/** A plain JSON projection: bytes become base64url, objects become plain records. */
function projection(value: unknown, depth: number): unknown {
  if (depth > 16) throw new TypeError('too deep');
  if (value instanceof Uint8Array) return encodeBase64Url(value);
  if (Array.isArray(value))
    return value.map((entry) => projection(entry, depth + 1));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      const entry = (value as Record<string, unknown>)[key];
      // An absent optional member and `undefined` hash the same way.
      if (entry !== undefined) out[key] = projection(entry, depth + 1);
    }
    return out;
  }
  return value;
}

/** Null when the mutation holds a value `canonicalJson` rejects. */
export async function requestHash(
  mutation: DeviceMutation
): Promise<Uint8Array | null> {
  const { operationId: _operationId, nowMs: _nowMs, ...body } = mutation;
  let canonical: string | undefined;
  try {
    canonical = canonicalJson(projection(body, 0));
  } catch {
    return null;
  }
  if (canonical === undefined) return null;
  return new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(canonical)));
}
