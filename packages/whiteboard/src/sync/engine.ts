import type { ElementChange, ExcalidrawElement } from '../types';
import {
  dedupeElementChanges,
  detectElementChanges,
  mergeElements,
} from './elements';

export interface ElementSyncEngine {
  /** Diffs a local edit against the previous scene and queues the changes. */
  trackLocal(
    previous: readonly ExcalidrawElement[],
    current: readonly ExcalidrawElement[]
  ): number;
  /** Takes the queued changes as one deduplicated batch and clears the queue. */
  drain(): ElementChange[];
  /** Puts an undelivered batch back in front of anything queued since. */
  requeue(changes: readonly ElementChange[]): void;
  /** Merges a remote batch into the local scene. */
  applyRemote(
    local: readonly ExcalidrawElement[],
    remote: readonly ExcalidrawElement[]
  ): ExcalidrawElement[];
  readonly pendingCount: number;
  clear(): void;
}

/**
 * Pure bookkeeping for element sync: a queue of local changes and the remote
 * merge rule. It has no timers, transport or React, so callers decide when to
 * flush.
 */
export function createElementSyncEngine(): ElementSyncEngine {
  let pending: ElementChange[] = [];

  return {
    trackLocal(previous, current) {
      const changes = detectElementChanges(previous, current);
      pending.push(...changes);
      return changes.length;
    },
    drain() {
      const queued = pending;
      pending = [];
      return dedupeElementChanges(queued);
    },
    requeue(changes) {
      pending = [...changes, ...pending];
    },
    applyRemote(local, remote) {
      return mergeElements(local, remote);
    },
    get pendingCount() {
      return pending.length;
    },
    clear() {
      pending = [];
    },
  };
}
