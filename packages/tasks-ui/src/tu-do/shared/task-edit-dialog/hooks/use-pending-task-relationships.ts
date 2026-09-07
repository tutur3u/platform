import type { RelatedTaskInfo } from '@tuturuuu/types/primitives/TaskRelationship';
import { useState } from 'react';
import type { PendingTaskRelationships } from '../types/pending-relationship';
import { getDraftStorageKey, loadDraft } from '../utils';
import { dedupeById } from './task-create-relationships';

export function usePendingTaskRelationships({
  taskId,
  boardId,
  wsId,
  isCreateMode,
  isOpen,
  seededRelationships,
}: {
  taskId?: string;
  boardId: string;
  wsId: string;
  isCreateMode: boolean;
  isOpen: boolean;
  seededRelationships?: PendingTaskRelationships;
}) {
  const sessionKey = JSON.stringify([
    wsId,
    boardId,
    isCreateMode,
    taskId,
    isOpen,
    seededRelationships?.parentTask?.id,
    seededRelationships?.childTasks.map((task) => task.id),
    seededRelationships?.blockingTasks.map((task) => task.id),
    seededRelationships?.blockedByTasks.map((task) => task.id),
    seededRelationships?.relatedTasks.map((task) => task.id),
  ]);
  const readInitial = () =>
    isCreateMode
      ? (loadDraft(getDraftStorageKey(boardId))?.pendingTaskRelationships ??
        seededRelationships)
      : undefined;
  const [session, setSession] = useState(sessionKey);
  const [initialPendingRelationships, setInitial] = useState(readInitial);
  const [pendingParent, setPendingParent] = useState<RelatedTaskInfo | null>(
    initialPendingRelationships?.parentTask ?? null
  );
  const [pendingChildren, setPendingChildren] = useState(() =>
    dedupeById(initialPendingRelationships?.childTasks ?? [])
  );
  const [pendingBlocking, setPendingBlocking] = useState(() =>
    dedupeById(initialPendingRelationships?.blockingTasks ?? [])
  );
  const [pendingBlockedBy, setPendingBlockedBy] = useState(() =>
    dedupeById(initialPendingRelationships?.blockedByTasks ?? [])
  );
  const [pendingRelated, setPendingRelated] = useState(() =>
    dedupeById(initialPendingRelationships?.relatedTasks ?? [])
  );

  // Reset before rendering a different editing session, never on query refresh.
  if (session !== sessionKey) {
    const initial = readInitial();
    setSession(sessionKey);
    setInitial(initial);
    setPendingParent(initial?.parentTask ?? null);
    setPendingChildren(dedupeById(initial?.childTasks ?? []));
    setPendingBlocking(dedupeById(initial?.blockingTasks ?? []));
    setPendingBlockedBy(dedupeById(initial?.blockedByTasks ?? []));
    setPendingRelated(dedupeById(initial?.relatedTasks ?? []));
  }

  return {
    initialPendingRelationships,
    pendingParent,
    setPendingParent,
    pendingChildren,
    setPendingChildren,
    pendingBlocking,
    setPendingBlocking,
    pendingBlockedBy,
    setPendingBlockedBy,
    pendingRelated,
    setPendingRelated,
  };
}
