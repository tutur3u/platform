import 'server-only';

import { createHash } from 'node:crypto';
import {
  type CoordinationRequest,
  coordinationResultSchema,
} from './coordination-protocol';
import { Effect } from './effect';

export class CoordinationUnavailableError extends Error {
  constructor() {
    super('Shared coordination is temporarily unavailable');
  }
}
export function coordinationKey(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

/** Server-only, bounded requests. Do not retry mutations after an ambiguous
 * network failure: their expiring lease may already have been committed. */
export async function coordinate(input: CoordinationRequest) {
  const result = await Effect.runPromise(
    Effect.either(
      Effect.tryPromise({
        try: async () => {
          const origin = new URL(process.env.CLOUDFLARE_COORDINATION_URL ?? '');
          const token = process.env.CLOUDFLARE_COORDINATION_TOKEN;
          if (
            origin.protocol !== 'https:' ||
            origin.username ||
            origin.password ||
            !token ||
            token.length < 32
          )
            throw new CoordinationUnavailableError();
          const response = await fetch(new URL('/v1/coordinate', origin), {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(input),
            cache: 'no-store',
            redirect: 'error',
            signal: AbortSignal.timeout(5000),
          });
          if (!response.ok) throw new CoordinationUnavailableError();
          return coordinationResultSchema.parse(await response.json());
        },
        // Never expose URLs, request bodies, or authorization headers in errors.
        catch: () => new CoordinationUnavailableError(),
      })
    )
  );
  if (result._tag === 'Left') throw result.left;
  return result.right;
}
