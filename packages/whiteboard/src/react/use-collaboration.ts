import type { Collaborator, SocketId } from '@excalidraw/excalidraw/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  WhiteboardChannelKind,
  WhiteboardConnectionStatus,
  WhiteboardTransport,
} from '../adapters';
import {
  buildCollaborators,
  type WhiteboardPresenceMember,
} from '../sync/collaborators';
import type {
  ExcalidrawElement,
  SelectedElementIds,
  WhiteboardIdentity,
} from '../types';
import { useCursorSync } from './use-cursor-sync';
import { useElementBroadcast } from './use-element-broadcast';
import { useErrorBudget } from './use-error-budget';

export interface WhiteboardCollaborationOptions {
  transport: WhiteboardTransport;
  /** The local participant. An empty id keeps collaboration idle. */
  user: WhiteboardIdentity;
  enabled?: boolean;
  /** Roster that decides who is listed as a collaborator. */
  presence?: readonly WhiteboardPresenceMember[];
  pageVisible?: boolean;
  onRemoteElementsChange?: (elements: ExcalidrawElement[]) => void;
  onError?: (error: Error) => void;
}

export interface WhiteboardCollaborationResult {
  collaborators: Map<SocketId, Collaborator>;
  isConnected: boolean;
  isSynced: boolean;
  broadcastElementChanges: (
    previousElements: readonly ExcalidrawElement[],
    currentElements: readonly ExcalidrawElement[]
  ) => void;
  broadcastCursorPosition: (x: number, y: number, tool?: string) => void;
  broadcastSelectionChange: (selectedElementIds: SelectedElementIds) => void;
}

/** Connects a whiteboard to a transport and exposes live collaborators. */
export function useWhiteboardCollaboration({
  transport,
  user,
  enabled = true,
  presence,
  pageVisible = true,
  onRemoteElementsChange,
  onError,
}: WhiteboardCollaborationOptions): WhiteboardCollaborationResult {
  const [status, setStatus] =
    useState<WhiteboardConnectionStatus>('connecting');
  const activeRef = useRef(false);
  const isActive = useCallback(() => activeRef.current, []);
  const live = enabled && !!user.id;

  const elementBudget = useErrorBudget(onError);
  const cursorBudget = useErrorBudget();

  const { broadcastChanges, receive: receiveElements } = useElementBroadcast({
    transport,
    userId: user.id,
    enabled: live,
    isActive,
    budget: elementBudget,
    onRemoteChanges: onRemoteElementsChange,
  });

  const {
    remoteCursors,
    remoteSelections,
    broadcastCursor,
    broadcastSelection,
    receiveCursor,
    receiveSelection,
    clearRemote,
  } = useCursorSync({
    transport,
    user,
    enabled: live,
    isActive,
    budget: cursorBudget,
    pageVisible,
  });

  const handlers = {
    receiveElements,
    receiveCursor,
    receiveSelection,
    clearRemote,
    // Each channel spends its own budget; only element failures reach the host.
    recordError: (error: unknown, channel?: WhiteboardChannelKind) => {
      if (channel === 'cursors') {
        cursorBudget.record(error);
      } else {
        elementBudget.record(error, true);
      }
    },
    resetBudgets: () => {
      elementBudget.reset();
      cursorBudget.reset();
    },
  };
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!live) {
      setStatus('disconnected');
      return;
    }

    activeRef.current = true;

    const disconnect = transport.connect({
      user,
      onStatus: (next, error, channel) => {
        setStatus(next);

        if (next === 'connected') {
          handlersRef.current.resetBudgets();
        } else if (next === 'error') {
          handlersRef.current.recordError(
            error ?? new Error('Channel error'),
            channel
          );
        } else if (next === 'disconnected') {
          handlersRef.current.clearRemote();
        }
      },
      onElementChanges: (batch) => handlersRef.current.receiveElements(batch),
      onCursor: (update) => handlersRef.current.receiveCursor(update),
      onSelection: (update) => handlersRef.current.receiveSelection(update),
    });

    return () => {
      activeRef.current = false;
      disconnect();
    };
  }, [live, transport, user]);

  const collaborators = useMemo(
    () =>
      buildCollaborators({
        presence,
        cursors: remoteCursors,
        selections: remoteSelections,
      }),
    [presence, remoteCursors, remoteSelections]
  );

  const isConnected = live && status === 'connected';
  const isSynced =
    isConnected && !elementBudget.exhausted && !cursorBudget.exhausted;

  return {
    collaborators,
    isConnected,
    isSynced,
    broadcastElementChanges: broadcastChanges,
    broadcastCursorPosition: broadcastCursor,
    broadcastSelectionChange: broadcastSelection,
  };
}
