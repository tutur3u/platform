import { createHash, timingSafeEqual } from 'node:crypto';
import { connection } from 'next/server';
import { z } from 'zod';
import { getFleetIntentDb } from '../intent-db';
import { fleetUnavailable, parseFleetRequest } from '../intent-request';
import { fleetJson } from '../session';

const tokenPattern = /^Bearer (ttr_fleet_consumer_[A-Za-z0-9_-]{43})$/i;
const verifierPattern = /^[0-9a-f]{64}$/;

export const slotSchema = z.strictObject({
  slot: z.iso.datetime({ precision: 3 }),
  generation: z.string().regex(/^[1-9][0-9]{0,18}$/),
});

export const receiptSchema = slotSchema.extend({
  id: z.uuid(),
  leaseId: z.uuid(),
  idempotencyKey: z.uuid(),
  state: z.literal('dry_run'),
});

type FleetDb = Awaited<ReturnType<typeof getFleetIntentDb>>;

export function consumerRoute<T>(
  schema: z.ZodType<T>,
  run: (db: FleetDb, data: T) => PromiseLike<{ data: unknown; error: unknown }>
) {
  return async (request: Request) => {
    await connection();
    const token = tokenPattern.exec(
      request.headers.get('authorization') ?? ''
    )?.[1];
    if (!token) return fleetJson({ error: 'unauthorized' }, 401);
    const verifier = process.env.FLEET_CONSUMER_TOKEN_SHA256;
    if (!verifier || !verifierPattern.test(verifier))
      return fleetJson({ error: 'consumer_unavailable' }, 503);

    const actual = createHash('sha256').update(token).digest();
    if (!timingSafeEqual(actual, Buffer.from(verifier, 'hex')))
      return fleetJson({ error: 'unauthorized' }, 401);

    const input = await parseFleetRequest(request, schema);
    if (input.error) return input.error;

    try {
      const { data, error } = await run(await getFleetIntentDb(), input.data);
      if (!error && data !== null) return fleetJson(data);
    } catch {
      // Credentials and database diagnostics stay out of response and logs.
    }
    return fleetUnavailable();
  };
}
