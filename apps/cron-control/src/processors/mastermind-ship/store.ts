import { withinDeadline } from '../deadline';
import type { ProcessorContext } from '../types';

// The Mastermind store's `/v1/ops` RPC (packages/utils/src/mastermind-store/
// protocol.ts): one attempt, a four-second timeout and no redirects, like the
// store's own client. The store's durable fence refuses with `stopped`.

const STORE_TIMEOUT_MS = 4_000;
const MAX_RESPONSE_BYTES = 640 * 1024;

export type StoreOp =
  | { op: 'mget'; ks: string[] }
  | { op: 'set'; k: string; v: string; ttlMs: number; mode: 'always' };

export type StoreOutcome =
  | { ok: true; results: unknown[] }
  | { ok: false; error: string };

export async function storeOps(
  context: Pick<
    ProcessorContext,
    'deadline' | 'fetch' | 'now' | 'signal' | 'target' | 'userAgent'
  >,
  ops: StoreOp[]
): Promise<StoreOutcome> {
  try {
    const response = await withinDeadline(context, () =>
      context.fetch(new URL('/v1/ops', context.target.url), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${context.target.secret}`,
          'Content-Type': 'application/json',
          'User-Agent': context.userAgent,
        },
        body: JSON.stringify({ v: 1, ops }),
        redirect: 'manual',
        signal: context.signal
          ? AbortSignal.any([
              context.signal,
              AbortSignal.timeout(STORE_TIMEOUT_MS),
            ])
          : AbortSignal.timeout(STORE_TIMEOUT_MS),
      })
    );
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > MAX_RESPONSE_BYTES) {
      void response.body?.cancel().catch(() => undefined);
      return { ok: false, error: 'invalid' };
    }
    const text = await withinDeadline(context, () => response.text());
    if (text.length > MAX_RESPONSE_BYTES)
      return { ok: false, error: 'invalid' };
    const body = JSON.parse(text) as {
      ok?: unknown;
      results?: unknown;
      error?: unknown;
    };
    if (body.ok === true && Array.isArray(body.results))
      return { ok: true, results: body.results };
    return {
      ok: false,
      error: typeof body.error === 'string' ? body.error : 'invalid',
    };
  } catch {
    return { ok: false, error: 'unavailable' };
  }
}
