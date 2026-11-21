import type { InternalApiClientOptions } from '@tuturuuu/internal-api/client';
import {
  confirmFleetLink,
  createFleetLinkCode,
  type FleetAccess,
  type FleetDigest,
  type FleetIntentInput,
  type FleetIntentPage,
  type FleetLinkCode,
  type FleetLinkConfirmation,
  type FleetLinkConfirmationInput,
  fleetAccessSchema,
  fleetIntentPageSchema,
  fleetLinkCodeSchema,
  fleetLinkConfirmationSchema,
  fleetStoredDigestSectionSchema,
  getFleetAccess,
  getFleetDigest,
  listFleetIntents,
  submitFleetIntent,
  summarizeFleetDigest,
} from '@tuturuuu/internal-api/fleet';
import { z } from 'zod';

const WEB_ORIGIN = 'https://tuturuuu.com';

/** Bearer-bearing calls refuse redirects before reading the body or `Location`. */
export function fleetApiOptions(
  token: string,
  fetchImpl: typeof fetch = fetch
): InternalApiClientOptions {
  return {
    baseUrl: WEB_ORIGIN,
    defaultHeaders: { Authorization: `Bearer ${token}` },
    async fetch(input, init) {
      const response = await fetchImpl(
        new Request(input, {
          ...init,
          redirect: 'manual',
          signal: AbortSignal.timeout(8_000),
        })
      );
      if (
        String(response.type) === 'opaqueredirect' ||
        (response.status >= 300 && response.status < 400)
      ) {
        throw new Error('Upstream redirect refused');
      }
      return response;
    },
  };
}

const refusalCodes = [
  'questions_per_hour',
  'intents_per_day',
  'stale_project_mapping',
  'fleet_stopped',
  'inactive_grant',
  'missing_capability',
  'project_outside_grant',
  'identity_already_linked',
  'invalid_confirmation',
] as const;
export type FleetRefusal =
  | (typeof refusalCodes)[number]
  | 'forbidden'
  | 'invalid'
  | 'conflict'
  | 'quota'
  | 'unavailable';

export type FleetRead<T> = { kind: 'ok'; data: T } | { kind: 'denied' };
export type FleetWrite<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'refused'; reason: FleetRefusal };

function statusOf(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : 0;
}

export function refusalOf(error: unknown): FleetRefusal {
  const message = error instanceof Error ? error.message : '';
  const known = refusalCodes.find((code) => code === message);
  if (known) return known;
  const status = statusOf(error);
  if (status === 400 || status === 413) return 'invalid';
  if (status === 401 || status === 403) return 'forbidden';
  if (status === 409) return 'conflict';
  if (status === 429) return 'quota';
  return 'unavailable';
}

/** Denials become a typed state; transport and contract failures throw. */
async function read<T>(
  pending: Promise<unknown>,
  parse: (value: unknown) => T
): Promise<FleetRead<T>> {
  try {
    return { kind: 'ok', data: parse(await pending) };
  } catch (error) {
    const status = statusOf(error);
    if (status === 401 || status === 403) return { kind: 'denied' };
    throw new Error('Fleet read unavailable');
  }
}

async function write<T>(
  pending: Promise<unknown>,
  parse: (value: unknown) => T
): Promise<FleetWrite<T>> {
  let value: unknown;
  try {
    value = await pending;
  } catch (error) {
    return { kind: 'refused', reason: refusalOf(error) };
  }
  try {
    return { kind: 'ok', data: parse(value) };
  } catch {
    return { kind: 'refused', reason: 'unavailable' };
  }
}

const digestSchema = z.strictObject({
  sections: z.array(fleetStoredDigestSectionSchema),
  totals: z.unknown(),
});

export function readFleetAccess(options: InternalApiClientOptions) {
  return read<FleetAccess>(getFleetAccess(options), (value) =>
    fleetAccessSchema.parse(value)
  );
}

/** Totals are recomputed from the validated sections. */
export function readFleetDigest(options: InternalApiClientOptions) {
  return read<FleetDigest>(getFleetDigest(options), (value) =>
    summarizeFleetDigest(digestSchema.parse(value).sections)
  );
}

export function readFleetIntents(
  before: string | undefined,
  options: InternalApiClientOptions
) {
  return read<FleetIntentPage>(listFleetIntents(before, options), (value) =>
    fleetIntentPageSchema.parse(value)
  );
}

export function sendFleetIntent(
  input: FleetIntentInput,
  options: InternalApiClientOptions
) {
  return write<{ id: string }>(submitFleetIntent(input, options), (value) =>
    z.strictObject({ id: z.uuid() }).parse(value)
  );
}

export function issueFleetLinkCode(options: InternalApiClientOptions) {
  return write<FleetLinkCode>(createFleetLinkCode(options), (value) =>
    fleetLinkCodeSchema.parse(value)
  );
}

export function checkFleetLink(
  input: FleetLinkConfirmationInput,
  options: InternalApiClientOptions
) {
  return write<FleetLinkConfirmation>(
    confirmFleetLink(input, options),
    (value) => fleetLinkConfirmationSchema.parse(value)
  );
}
