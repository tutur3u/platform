import { type LiveData, mergeLiveData, parseLiveData } from './model.ts';
import type { HostsPayload } from './host-probe.ts';

export const REFRESH_MS = 30 * 60_000;
export const CACHE_KEY = 'tuturuuu-roadmap-live-v3';
export const MAX_SNAPSHOT_CHARS = 1_000_000;

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Unknown or absent probes cannot renew retained host facts. */
export function requireCompleteHosts(
  payload: HostsPayload,
  expected: readonly string[],
  now: number
) {
  const age = now - Date.parse(payload.checkedAt);
  const apps = new Set(payload.hosts.map((host) => host.app));
  if (
    !Number.isFinite(age) ||
    age < 0 ||
    age >= REFRESH_MS ||
    apps.size !== payload.hosts.length ||
    apps.size !== expected.length ||
    expected.some((app) => !apps.has(app)) ||
    payload.hosts.some((host) => host.platform === 'unknown' || !host.commit)
  )
    throw new Error('Incomplete host observation');
}

/** A runtime observation expires at thirty minutes, including future clocks. */
export function freshRuntime(data: LiveData, initial: LiveData, now: number) {
  const at = Date.parse(data.generatedAt);
  return (
    data.source === 'live' &&
    at >= Date.parse(initial.generatedAt) &&
    at <= now &&
    now - at < REFRESH_MS
  );
}

export function readRuntimeSnapshot(
  storage: Storage,
  initial: LiveData,
  build: string,
  now: number
): LiveData {
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (!raw || raw.length > MAX_SNAPSHOT_CHARS) return initial;
    const cached = JSON.parse(raw);
    if (cached.build !== build) return initial;
    const data = parseLiveData(cached.data, now);
    return freshRuntime(data, initial, now)
      ? runtimeObservation(initial, data, now)
      : initial;
  } catch {
    return initial;
  }
}

export function forgetRuntimeSnapshot(storage: Storage) {
  try {
    storage.removeItem(CACHE_KEY);
  } catch {
    // Storage is optional; callers also discard the in-memory observation.
  }
}

export function writeRuntimeSnapshot(
  storage: Storage,
  data: LiveData,
  build: string
) {
  try {
    const raw = JSON.stringify({ build, data });
    if (raw.length > MAX_SNAPSHOT_CHARS) {
      forgetRuntimeSnapshot(storage);
      return;
    }
    storage.setItem(CACHE_KEY, raw);
  } catch {
    // Private mode and full storage still allow an in-memory observation.
  }
}

/** Merge only against this deployment, never an earlier runtime observation. */
export function runtimeObservation(
  initial: LiveData,
  observation: LiveData,
  now: number
): LiveData {
  if (JSON.stringify(observation).length > MAX_SNAPSHOT_CHARS)
    throw new Error('Runtime observation is too large');
  const fresh = parseLiveData(observation, now);
  if (!fresh.main || !freshRuntime(fresh, initial, now))
    throw new Error('Invalid runtime observation');
  return parseLiveData(mergeLiveData(initial, fresh), now);
}

/** A failed or partial read has no new observation time. */
export async function refreshRuntime(
  initial: LiveData,
  load: () => Promise<LiveData>,
  now: () => number
): Promise<{ data: LiveData; state: 'live' | 'failed' }> {
  try {
    return {
      data: runtimeObservation(initial, await load(), now()),
      state: 'live',
    };
  } catch {
    return { data: initial, state: 'failed' };
  }
}
