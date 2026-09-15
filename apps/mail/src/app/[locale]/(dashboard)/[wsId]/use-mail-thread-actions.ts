'use client';

import {
  useMutation,
  useMutationState,
  useQueryClient,
} from '@tanstack/react-query';
import {
  bulkUpdateMailThreads,
  type MailThreadSummary,
  updateMailThreadState,
} from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import type { MailFolder } from './mail-folders';
import {
  getMailArchiveBehavior,
  nextMailThreadId,
} from './mail-reading-preferences';
import {
  type OptimisticContext,
  restoreMailThreads,
  snapshotMailThreads,
} from './mail-thread-optimistic';

export { updateThreadPages } from './mail-thread-optimistic';

type ThreadAction = Parameters<typeof updateMailThreadState>[3]['action'];
type BulkAction = 'archive' | 'mark_read' | 'trash';
export type MailSyncState = 'idle' | 'syncing' | 'synced' | 'failed';

export function useMailThreadActions({
  activeMailboxId,
  closeThread,
  folder,
  invalidateMailbox,
  reopenThread,
  selectedThreads,
  setSelectedThreads,
  threadId,
  threads,
  workspaceId,
}: {
  activeMailboxId: string | null;
  closeThread: () => void;
  folder: MailFolder;
  invalidateMailbox: () => Promise<void>;
  reopenThread: (threadId: string) => void;
  selectedThreads: Set<string>;
  setSelectedThreads: (threads: Set<string>) => void;
  threadId: string | null;
  threads: MailThreadSummary[];
  workspaceId: string;
}) {
  const t = useTranslations('mail');
  const queryClient = useQueryClient();
  const [syncStates, setSyncStates] = useState<Record<string, MailSyncState>>(
    {}
  );
  const setSyncState = (
    scope: { mailboxId: string; targetWorkspaceId: string },
    state: MailSyncState
  ) => {
    setSyncStates((current) => ({
      ...current,
      [`${scope.targetWorkspaceId}/${scope.mailboxId}`]: state,
    }));
  };
  const actionKey = ['mail', workspaceId, activeMailboxId, 'actions'];
  const pendingActions = useMutationState({
    filters: { mutationKey: actionKey, status: 'pending' },
    select: (mutation) =>
      (mutation.state.variables ?? {}) as {
        threadId?: string;
        targetThreadId?: string;
        threadIds?: string[];
      },
  });
  const inFlight = useRef(new Set<string>());
  const operations = useRef(new Map<string, number>());
  const operationScope = `${workspaceId}/${activeMailboxId}`;
  const beginOperation = () =>
    operations.current.set(
      operationScope,
      (operations.current.get(operationScope) ?? 0) + 1
    );
  const settleOperation = async () => {
    const remaining = Math.max(
      0,
      (operations.current.get(operationScope) ?? 1) - 1
    );
    operations.current.set(operationScope, remaining);
    if (!remaining) {
      operations.current.delete(operationScope);
      await invalidateMailbox();
    }
  };
  const actionsPending = pendingActions.length > 0;
  const actionPending = pendingActions.some(
    (variables) =>
      Object.keys(variables).length === 0 ||
      variables.threadId === threadId ||
      variables.targetThreadId === threadId ||
      Boolean(threadId && variables.threadIds?.includes(threadId))
  );
  const selectedThreadIdRef = useRef(threadId);
  selectedThreadIdRef.current = threadId;

  const snapshot = (ids: Set<string>, action: ThreadAction) =>
    snapshotMailThreads({
      queryClient,
      activeMailboxId,
      workspaceId,
      ids,
      action,
      folder,
      threads,
    });
  const restore = (context: OptimisticContext | null | undefined) =>
    restoreMailThreads(queryClient, context);

  const stateMutation = useMutation({
    mutationKey: [...actionKey, 'state'],
    mutationFn: ({
      action,
      targetThreadId,
      mailboxId,
      targetWorkspaceId,
    }: {
      action: ThreadAction;
      targetThreadId: string;
      mailboxId: string;
      targetWorkspaceId: string;
    }) =>
      updateMailThreadState(targetWorkspaceId, mailboxId, targetThreadId, {
        action,
      }),
    onMutate: async (variables) => {
      const { action, targetThreadId } = variables;
      beginOperation();
      setSyncState(variables, 'syncing');
      const context = await snapshot(new Set([targetThreadId]), action);
      let navigatedTo: string | null | undefined;
      if (
        selectedThreadIdRef.current === targetThreadId &&
        (action === 'archive' || action === 'trash')
      ) {
        navigatedTo =
          action === 'archive' &&
          folder === 'inbox' &&
          getMailArchiveBehavior() === 'next'
            ? nextMailThreadId(
                threads,
                targetThreadId,
                new Set([targetThreadId])
              )
            : null;
        if (navigatedTo) reopenThread(navigatedTo);
        else closeThread();
      }
      return { navigatedTo, snapshot: context, settle: settleOperation };
    },
    onError: (_error, variables, context) => {
      restore(context?.snapshot);
      if (
        context?.snapshot?.mailboxId === activeMailboxId &&
        context.snapshot.workspaceId === workspaceId &&
        context.navigatedTo !== undefined &&
        selectedThreadIdRef.current === context.navigatedTo &&
        (variables.action === 'archive' || variables.action === 'trash')
      ) {
        reopenThread(variables.targetThreadId);
      }
      setSyncState(variables, 'failed');
      toast.error(t('update_failed'));
    },
    onSuccess: (_data, variables) => {
      setSyncState(variables, 'synced');
    },
    onSettled: async (_data, _error, variables, context) => {
      inFlight.current.delete(variables.targetThreadId);
      // Earlier requests must not refetch and resurrect later optimistic archives.
      await (context?.settle ?? settleOperation)();
    },
  });

  const bulkMutation = useMutation({
    mutationKey: [...actionKey, 'bulk'],
    mutationFn: ({
      action,
      threadIds,
      mailboxId,
      targetWorkspaceId,
    }: {
      action: BulkAction;
      threadIds: string[];
      mailboxId: string;
      targetWorkspaceId: string;
    }) =>
      bulkUpdateMailThreads(targetWorkspaceId, mailboxId, {
        action,
        threadIds,
      }),
    onMutate: async (variables) => {
      const { action, threadIds } = variables;
      beginOperation();
      setSyncState(variables, 'syncing');
      const ids = new Set(threadIds);
      for (const id of ids) inFlight.current.add(id);
      const optimistic = await snapshot(ids, action);
      const previousThreadId = selectedThreadIdRef.current;
      let navigatedTo: string | null | undefined;
      if (
        previousThreadId &&
        ids.has(previousThreadId) &&
        (action === 'archive' || action === 'trash')
      ) {
        navigatedTo =
          action === 'archive' &&
          folder === 'inbox' &&
          getMailArchiveBehavior() === 'next'
            ? nextMailThreadId(threads, previousThreadId, ids)
            : null;
        if (navigatedTo) reopenThread(navigatedTo);
        else closeThread();
      }
      setSelectedThreads(new Set());
      return {
        ids,
        optimistic,
        previousThreadId,
        navigatedTo,
        settle: settleOperation,
      };
    },
    onError: (_error, variables, context) => {
      restore(context?.optimistic);
      if (
        context?.ids &&
        context.optimistic?.mailboxId === activeMailboxId &&
        context.optimistic.workspaceId === workspaceId
      )
        setSelectedThreads(context.ids);
      if (
        context?.optimistic?.mailboxId === activeMailboxId &&
        context.optimistic.workspaceId === workspaceId &&
        context.previousThreadId &&
        context.navigatedTo !== undefined &&
        selectedThreadIdRef.current === context.navigatedTo
      ) {
        reopenThread(context.previousThreadId);
      }
      setSyncState(variables, 'failed');
      toast.error(t('update_failed'));
    },
    onSuccess: (_data, variables) => {
      setSyncState(variables, 'synced');
    },
    onSettled: async (_data, _error, variables, context) => {
      for (const id of variables.threadIds) inFlight.current.delete(id);
      await (context?.settle ?? settleOperation)();
    },
  });

  const readOperationPending = () =>
    queryClient.isMutating({ mutationKey: [...actionKey, 'viewed-read'] }) >
      0 ||
    queryClient.isMutating({ mutationKey: [...actionKey, 'folder-read'] }) > 0;

  return {
    actionPending,
    actionsPending,
    bulkMutation: {
      ...bulkMutation,
      mutate: (action: BulkAction) => {
        if (!activeMailboxId || readOperationPending()) return;
        const threadIds = [...selectedThreads].filter(
          (id) => !inFlight.current.has(id)
        );
        if (!threadIds.length) return;
        for (const id of threadIds) inFlight.current.add(id);
        bulkMutation.mutate({
          action,
          threadIds,
          mailboxId: activeMailboxId,
          targetWorkspaceId: workspaceId,
        });
      },
    },
    mutateThread: (action: ThreadAction, targetThreadId = threadId) => {
      if (!activeMailboxId || readOperationPending()) return;
      if (!targetThreadId || inFlight.current.has(targetThreadId)) return;
      inFlight.current.add(targetThreadId);
      stateMutation.mutate({
        action,
        targetThreadId,
        mailboxId: activeMailboxId,
        targetWorkspaceId: workspaceId,
      });
    },
    stateMutation,
    syncState: actionsPending
      ? ('syncing' as const)
      : (syncStates[operationScope] ?? 'idle'),
  };
}
