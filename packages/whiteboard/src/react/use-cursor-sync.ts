import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CursorUpdate,
  SelectionUpdate,
  WhiteboardTransport,
} from '../adapters';
import { pruneStaleEntries } from '../sync/collaborators';
import {
  type SelectedElementIds,
  sanitizeSelectedElementIds,
} from '../sync/selection';
import type { WhiteboardIdentity } from '../types';
import type { ErrorBudget } from './use-error-budget';

export interface RemoteCursor {
  x: number;
  y: number;
  tool?: string;
  user: WhiteboardIdentity;
  lastUpdatedAt: number;
}

interface RemoteSelectionState {
  selectedElementIds: SelectedElementIds;
  lastUpdatedAt: number;
}

export interface CursorSyncOptions {
  transport: WhiteboardTransport;
  user: WhiteboardIdentity;
  enabled: boolean;
  isActive: () => boolean;
  budget: ErrorBudget;
  pageVisible?: boolean;
  throttleMs?: number;
  cursorTimeoutMs?: number;
}

const ANIMATION_FACTOR = 0.2;
const MOVEMENT_THRESHOLD = 5;
const HIDDEN_CURSOR = -1000;

/**
 * Smooths and throttles the local pointer onto the transport and tracks the
 * remote cursors and selections, dropping any that go quiet.
 */
export function useCursorSync({
  transport,
  user,
  enabled,
  isActive,
  budget,
  pageVisible = true,
  throttleMs = 250,
  cursorTimeoutMs = 5000,
}: CursorSyncOptions) {
  const [remoteCursors, setRemoteCursors] = useState<
    ReadonlyMap<string, RemoteCursor>
  >(new Map());
  const [remoteSelectionStates, setRemoteSelectionStates] = useState<
    ReadonlyMap<string, RemoteSelectionState>
  >(new Map());

  const lastBroadcastTimeRef = useRef(0);
  const throttleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetPositionRef = useRef({ x: HIDDEN_CURSOR, y: HIDDEN_CURSOR });
  const currentPositionRef = useRef({ x: HIDDEN_CURSOR, y: HIDDEN_CURSOR });
  const currentToolRef = useRef<string | undefined>(undefined);
  const animationFrameRef = useRef<number | null>(null);
  const pageVisibleRef = useRef(pageVisible);
  pageVisibleRef.current = pageVisible;

  const sendCursor = useCallback(
    async (x: number, y: number, tool?: string) => {
      if (!isActive() || !enabled) return;
      if (budget.isSpent()) return;
      if (!pageVisibleRef.current) return;

      const doBroadcast = async () => {
        try {
          await transport.sendCursor({ x, y, tool, user });
          lastBroadcastTimeRef.current = Date.now();
          budget.reset();
        } catch (error) {
          budget.record(error);
        }
      };

      const sinceLast = Date.now() - lastBroadcastTimeRef.current;

      if (sinceLast < throttleMs) {
        if (!throttleTimeoutRef.current) {
          throttleTimeoutRef.current = setTimeout(async () => {
            await doBroadcast();
            throttleTimeoutRef.current = null;
          }, throttleMs - sinceLast);
        }
      } else {
        await doBroadcast();
      }
    },
    [budget, enabled, isActive, throttleMs, transport, user]
  );

  const sendSelection = useCallback(
    async (selectedElementIds: SelectedElementIds) => {
      if (!isActive() || !enabled) return;
      if (budget.isSpent()) return;

      try {
        await transport.sendSelection({
          senderId: user.id,
          selectedElementIds,
          timestamp: Date.now(),
        });
        budget.reset();
      } catch (error) {
        budget.record(error);
      }
    },
    [budget, enabled, isActive, transport, user.id]
  );

  const smoothAnimate = useCallback(() => {
    if (!enabled || !user.id) {
      animationFrameRef.current = requestAnimationFrame(smoothAnimate);
      return;
    }

    const current = currentPositionRef.current;
    const target = targetPositionRef.current;
    current.x += (target.x - current.x) * ANIMATION_FACTOR;
    current.y += (target.y - current.y) * ANIMATION_FACTOR;

    const distance = Math.hypot(target.x - current.x, target.y - current.y);

    if (distance > MOVEMENT_THRESHOLD && pageVisibleRef.current) {
      void sendCursor(current.x, current.y, currentToolRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(smoothAnimate);
  }, [enabled, user.id, sendCursor]);

  const broadcastCursor = useCallback(
    (x: number, y: number, tool?: string) => {
      if (!enabled || !user.id) return;

      currentToolRef.current = tool;

      if (x <= HIDDEN_CURSOR || y <= HIDDEN_CURSOR) {
        targetPositionRef.current = { x, y };
        currentPositionRef.current = { x, y };
        void sendCursor(x, y, tool);
        return;
      }

      targetPositionRef.current = { x, y };
    },
    [enabled, user.id, sendCursor]
  );

  const broadcastSelection = useCallback(
    (selectedElementIds: SelectedElementIds) => {
      if (!enabled || !user.id) return;

      void sendSelection(sanitizeSelectedElementIds(selectedElementIds) ?? {});
    },
    [enabled, user.id, sendSelection]
  );

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(smoothAnimate);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [smoothAnimate]);

  useEffect(() => {
    return () => {
      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current);
        throttleTimeoutRef.current = null;
      }
    };
  }, [transport]);

  useEffect(() => {
    if (budget.exhausted || !enabled) return;

    const interval = setInterval(() => {
      const now = Date.now();
      setRemoteCursors((prev) =>
        pruneStaleEntries(prev, now, cursorTimeoutMs, (c) => c.lastUpdatedAt)
      );
      setRemoteSelectionStates((prev) =>
        pruneStaleEntries(prev, now, cursorTimeoutMs, (s) => s.lastUpdatedAt)
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [budget.exhausted, enabled, cursorTimeoutMs]);

  const receiveCursor = useCallback(
    (update: CursorUpdate) => {
      const { x, y, tool, user: sender } = update;

      if (sender.id === user.id) return;

      setRemoteCursors((prev) => {
        const next = new Map(prev);
        next.set(sender.id, {
          x,
          y,
          tool,
          user: sender,
          lastUpdatedAt: Date.now(),
        });
        return next;
      });

      budget.reset();
    },
    [budget, user.id]
  );

  const receiveSelection = useCallback(
    (update: SelectionUpdate) => {
      const { senderId, selectedElementIds, timestamp } = update;

      if (senderId === user.id) return;

      const normalized = sanitizeSelectedElementIds(selectedElementIds);

      setRemoteSelectionStates((prev) => {
        const next = new Map(prev);

        if (!normalized) {
          next.delete(senderId);
        } else {
          next.set(senderId, {
            selectedElementIds: normalized,
            lastUpdatedAt: timestamp || Date.now(),
          });
        }

        return next;
      });

      budget.reset();
    },
    [budget, user.id]
  );

  const clearRemote = useCallback(() => {
    setRemoteCursors(new Map());
    setRemoteSelectionStates(new Map());
  }, []);

  const remoteSelections = useMemo(
    () =>
      new Map(
        Array.from(remoteSelectionStates.entries()).map(([userId, state]) => [
          userId,
          state.selectedElementIds,
        ])
      ),
    [remoteSelectionStates]
  );

  return {
    remoteCursors,
    remoteSelections,
    broadcastCursor,
    broadcastSelection,
    receiveCursor,
    receiveSelection,
    clearRemote,
  };
}
