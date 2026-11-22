import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ElementChangeBatch, WhiteboardTransport } from '../adapters';
import { createElementSyncEngine } from '../sync/engine';
import type { ExcalidrawElement } from '../types';
import type { ErrorBudget } from './use-error-budget';

export interface ElementBroadcastOptions {
  transport: WhiteboardTransport;
  userId: string;
  enabled: boolean;
  /** Whether the transport connection is currently open. */
  isActive: () => boolean;
  budget: ErrorBudget;
  debounceMs?: number;
  onRemoteChanges?: (elements: ExcalidrawElement[]) => void;
}

/**
 * Queues local element changes, flushes them to the transport after a quiet
 * period, and hands remote batches to `onRemoteChanges`.
 */
export function useElementBroadcast({
  transport,
  userId,
  enabled,
  isActive,
  budget,
  debounceMs = 100,
  onRemoteChanges,
}: ElementBroadcastOptions) {
  const engine = useMemo(() => createElementSyncEngine(), []);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRemoteRef = useRef(onRemoteChanges);
  onRemoteRef.current = onRemoteChanges;

  const flush = useCallback(async () => {
    if (!isActive() || engine.pendingCount === 0) return;
    if (budget.isSpent()) return;

    const changes = engine.drain();

    try {
      await transport.sendElementChanges({
        senderId: userId,
        changes: changes.map((c) => ({ element: c.element, type: c.type })),
        timestamp: Date.now(),
      });
      budget.reset();
    } catch (error) {
      engine.requeue(changes);
      budget.record(error, true);
    }
  }, [budget, engine, isActive, transport, userId]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cancel;
  }, [cancel, transport, enabled]);

  const broadcastChanges = useCallback(
    (
      previous: readonly ExcalidrawElement[],
      current: readonly ExcalidrawElement[]
    ) => {
      if (!enabled || !isActive()) return;

      engine.trackLocal(previous, current);

      cancel();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void flush();
      }, debounceMs);
    },
    [cancel, debounceMs, enabled, engine, flush, isActive]
  );

  const receive = useCallback(
    (batch: ElementChangeBatch) => {
      const remoteElements = batch.changes.map((c) => c.element);

      if (remoteElements.length > 0) {
        onRemoteRef.current?.(remoteElements);
      }

      budget.reset();
    },
    [budget]
  );

  return { broadcastChanges, receive };
}
