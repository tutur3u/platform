import 'server-only';

import type { MastermindStore } from '@tuturuuu/utils/mastermind-store/client';
import { type NextRequest, NextResponse } from 'next/server';
import { isFleetOwner } from './auth';
import { type ClaimsReader, readAssurance } from './bridge';
import { type FleetReadError, fleetReadFailure } from './bridge-rpc';
import { FLEET_NO_STORE, fleetError } from './http';

export const MACHINE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
export const ENVIRONMENT_ID = /^\w[\w-]{0,99}$/u;
export const THREAD_ID = /^[\w:%.][\w:%.-]{0,399}$/u;

/**
 * Admission for every thread read: the fleet owner, and an account the
 * platform's second-factor policy still accepts. Returns the refusal, or
 * null to go on.
 */
export async function refuseFleetRead(
  request: Pick<NextRequest, 'headers' | 'url'>,
  principal: {
    user: Parameters<typeof isFleetOwner>[0];
    supabase: ClaimsReader;
  }
) {
  if (!(await isFleetOwner(principal.user)))
    return fleetError('forbidden', 403);
  const assurance = await readAssurance(request, {
    userId: principal.user.id,
    supabase: principal.supabase,
  });
  if (assurance === 'unavailable') return fleetError('unavailable', 503);
  if (assurance !== 'allowed') return fleetError('mfa_required', 401);
  return null;
}

/** The response for a read the machine did not answer. */
export function fleetReadError(error: FleetReadError) {
  const failure = fleetReadFailure(error);
  return NextResponse.json(
    { error: failure.error },
    { status: failure.status, headers: FLEET_NO_STORE }
  );
}

/** A number from a query value, or undefined; anything malformed is null. */
export function queryInt(value: string | null, max: number) {
  if (value === null) return undefined;
  if (!/^\d{1,9}$/u.test(value)) return null;
  const parsed = Number(value);
  return parsed <= max ? parsed : null;
}

const SEEN_PREFIX = 'mastermind:fleet:v1:seen:';
const SEEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SEEN_MAX = 300;
const CAS_ATTEMPTS = 3;

/** How many timeline items of each thread the owner has seen, newest writes last. */
type Seen = Record<string, number>;

export const seenKey = (
  machineId: string,
  environmentId: string | undefined,
  threadId: string
) => `${machineId}|${environmentId ?? ''}|${threadId}`;

function parseSeen(raw: string | null): Seen {
  try {
    const value = JSON.parse(raw ?? '{}') as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        ([, count]) => Number.isSafeInteger(count) && (count as number) >= 0
      )
    ) as Seen;
  } catch {
    return {};
  }
}

export async function readSeen(store: MastermindStore, ownerId: string) {
  return parseSeen(await store.get(`${SEEN_PREFIX}${ownerId}`));
}

/**
 * Records that the owner has seen `itemCount` items of a thread. The count
 * only ever grows, the map keeps the 300 threads touched last, and a lost
 * race is retried a few times and then dropped: a read marker is a
 * convenience, never worth failing a request for.
 */
export async function markSeen(
  store: MastermindStore,
  ownerId: string,
  key: string,
  itemCount: number
) {
  const storeKey = `${SEEN_PREFIX}${ownerId}`;
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
    const raw = await store.get(storeKey);
    const seen = parseSeen(raw);
    if ((seen[key] ?? -1) >= itemCount) return true;
    delete seen[key];
    seen[key] = itemCount;
    const kept = Object.fromEntries(Object.entries(seen).slice(-SEEN_MAX));
    if (
      await store.compareAndSet(
        storeKey,
        raw,
        JSON.stringify(kept),
        SEEN_TTL_MS
      )
    )
      return true;
  }
  return false;
}
