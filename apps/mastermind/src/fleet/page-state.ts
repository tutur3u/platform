import type { FleetRead } from '../native/clients';
import type { FleetSnapshot } from './contract';
import { freshness } from './model';

/** What one fleet load returned, plus a failed refresh kept beside it. */
export interface FleetLoad {
  email: string;
  fetchedAt: string;
  read: FleetRead;
  /** Set when a refresh failed and the previous snapshot is kept. */
  refreshError?: Extract<FleetRead, { kind: 'error' }>['reason'];
}

export type FleetPageState =
  | { kind: 'ready'; snapshot: FleetSnapshot }
  | {
      kind: 'stale';
      snapshot: FleetSnapshot;
      reason: 'old' | Extract<FleetRead, { kind: 'error' }>['reason'];
    }
  | { kind: 'unpublished' }
  | { kind: 'error'; reason: Extract<FleetRead, { kind: 'error' }>['reason'] };

/** A refresh that fails keeps the last snapshot on screen, marked stale. */
export function mergeRefresh(
  previous: FleetLoad | undefined,
  next: FleetLoad
): FleetLoad {
  return next.read.kind === 'error' && previous?.read.kind === 'ready'
    ? { ...previous, refreshError: next.read.reason }
    : next;
}

export function fleetPageState(load: FleetLoad, now: number): FleetPageState {
  const { read } = load;
  switch (read.kind) {
    case 'unpublished':
      return { kind: 'unpublished' };
    case 'error':
      return { kind: 'error', reason: read.reason };
    case 'ready':
      if (load.refreshError)
        return {
          kind: 'stale',
          snapshot: read.snapshot,
          reason: load.refreshError,
        };
      return freshness(read.snapshot.state, now) === 'stale'
        ? { kind: 'stale', snapshot: read.snapshot, reason: 'old' }
        : { kind: 'ready', snapshot: read.snapshot };
    default: {
      const exhaustive: never = read;
      return exhaustive;
    }
  }
}
