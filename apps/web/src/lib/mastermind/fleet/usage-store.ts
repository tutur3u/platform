import 'server-only';

import type { MastermindStore } from '@tuturuuu/utils/mastermind-store/client';
import {
  type FleetUsageResponse,
  type FleetUsageSnapshot,
  fleetUsageResponseSchema,
} from './usage-contract';

const KEY = 'mastermind:fleet:v1:usage';
const TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 30_000;

export class UsageSnapshotTimeError extends Error {}

function parse(raw: string | null): FleetUsageResponse | null {
  if (raw === null) return null;
  return fleetUsageResponseSchema.parse(JSON.parse(raw));
}

export async function readFleetUsage(store: MastermindStore) {
  return parse(await store.get(KEY));
}

export async function writeFleetUsage(
  store: MastermindStore,
  snapshot: FleetUsageSnapshot,
  now = new Date()
): Promise<FleetUsageResponse> {
  const generation = Date.parse(snapshot.generatedAt);
  if (generation > now.getTime() + MAX_CLOCK_SKEW_MS) {
    throw new UsageSnapshotTimeError('future usage snapshot');
  }
  const next = { snapshot, receivedAt: now.toISOString() };
  const serialized = JSON.stringify(next);
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await store.get(KEY);
    const previous = parse(raw);
    if (previous && generation <= Date.parse(previous.snapshot.generatedAt)) {
      throw new UsageSnapshotTimeError('stale usage snapshot');
    }
    if (await store.compareAndSet(KEY, raw, serialized, TTL_MS)) {
      return next;
    }
  }
  throw new Error('usage snapshot contention');
}
