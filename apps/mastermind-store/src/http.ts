/** Request helpers shared by the store and bridge routes. */
import { MASTERMIND_STORE_LIMITS } from '@tuturuuu/utils/mastermind-store/protocol';

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });

async function digest(value: string) {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  );
}

/** Constant-time match of the bearer token against any configured token. */
export async function tokenMatches(
  header: string | null,
  configured: string | undefined
) {
  const tokens = (configured ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0 || tokens.some((token) => token.length < 32))
    return 'unconfigured' as const;
  const presented = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const actual = await digest(presented);
  let ok = false;
  for (const token of tokens) {
    const expected = await digest(token);
    // Equal-length digests compared in full, and every token is compared, so
    // timing reveals neither the token nor which one matched.
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
    if (diff === 0) ok = true;
  }
  return ok ? ('ok' as const) : ('denied' as const);
}

/** The body as text, or null past `maxBytes`. */
export async function readCapped(
  request: Request,
  maxBytes: number = MASTERMIND_STORE_LIMITS.maxBodyBytes
) {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > maxBytes) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
