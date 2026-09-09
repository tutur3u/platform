'use client';

import {
  type InfiniteData,
  type QueryClient,
  type QueryKey,
  useMutation,
  useMutationState,
  useQueryClient,
} from '@tanstack/react-query';
import {
  bulkUpdateMailThreads,
  type MailBootstrapResponse,
  type MailThreadDetail,
  type MailThreadSummary,
  type MailThreadsResponse,
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
import { restoreThreadPages } from './mail-thread-rollback';

type ThreadAction = Parameters<typeof updateMailThreadState>[3]['action'];
type BulkAction = 'archive' | 'mark_read' | 'trash';
export type MailSyncState = 'idle' | 'syncing' | 'synced' | 'failed';

type ThreadCacheSnapshot = Array<
  [QueryKey, InfiniteData<MailThreadsResponse> | undefined]
>;
type OptimisticContext = {
  mailboxId: string;
  workspaceId: string;
  ids: Set<string>;
  unreadDelta: number;
  details: Array<readonly [string, MailThreadDetail | undefined]>;
  threadCaches: ThreadCacheSnapshot;
};

function hasStateFilter(query: string, state: string) {
  return new RegExp(`(?:^|\\s)is:(?:"${state}"|${state})(?:\\s|$)`, 'iu').test(
    query
  );
}

function shouldRemoveFromFolder(
  action: ThreadAction,
  folder: MailFolder,
  query: string
) {
  if (action === 'trash') return folder !== 'trash';
  if (action === 'archive') {
    return folder === 'inbox' && !hasStateFilter(query, 'archived');
  }
  if (action === 'restore') {
    return (
      folder === 'archive' ||
      folder === 'trash' ||
      hasStateFilter(query, 'archived') ||
      hasStateFilter(query, 'trash')
    );
  }
  if (action === 'unstar') {
    return folder === 'starred' || hasStateFilter(query, 'starred');
  }
  if (action === 'mark_read' && hasStateFilter(query, 'unread')) return true;
  if (action === 'mark_unread' && hasStateFilter(query, 'read')) return true;
  return false;
}

export function updateThreadPages(
  current: InfiniteData<MailThreadsResponse> | undefined,
  threadIds: Set<string>,
  action: ThreadAction,
  folder: MailFolder,
  query = ''
) {
  if (!current) return current;
  const remove = shouldRemoveFromFolder(action, folder, query);
  const removedCount = remove
    ? current.pages.reduce(
        (count, page) =>
          count +
          page.threads.filter((thread) => threadIds.has(thread.id)).length,
        0
      )
    : 0;

  return {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      pagination: {
        ...page.pagination,
        total:
          page.pagination.total === null
            ? null
            : Math.max(0, page.pagination.total - removedCount),
      },
      threads: page.threads.flatMap((thread) => {
        if (!threadIds.has(thread.id)) return [thread];
        if (remove) return [];
        return [
          {
            ...thread,
            starred:
              action === 'star'
                ? true
                : action === 'unstar'
                  ? false
                  : thread.starred,
            unreadCount: action === 'mark_read' ? 0 : thread.unreadCount,
          },
        ];
      }),
    })),
  };
}

function updateDetail(
  current: MailThreadDetail | undefined,
  action: ThreadAction
) {
  if (!current || (action !== 'star' && action !== 'unstar')) return current;
  return {
    ...current,
    messages: current.messages.map((message) => ({
      ...message,
      starred: action === 'star',
    })),
  };
}

function applyOptimisticUpdate({
  action,
  activeFolder,
  mailboxId,
  queryClient,
  threadIds,
  unreadCount,
  workspaceId,
}: {
  action: ThreadAction;
  activeFolder: MailFolder;
  mailboxId: string;
  queryClient: QueryClient;
  threadIds: Set<string>;
  unreadCount: number;
  workspaceId: string;
}) {
  const caches = queryClient.getQueriesData<InfiniteData<MailThreadsResponse>>({
    queryKey: ['mail', workspaceId, mailboxId, 'threads'],
  });
  for (const [queryKey, current] of caches) {
    queryClient.setQueryData(
      queryKey,
      updateThreadPages(
        current,
        threadIds,
        action,
        queryKey[4] as MailFolder,
        String(queryKey[7] ?? '')
      )
    );
  }
  for (const threadId of threadIds) {
    queryClient.setQueryData<MailThreadDetail>(
      ['mail', workspaceId, mailboxId, 'thread', threadId],
      (current) => updateDetail(current, action)
    );
  }
  if (
    activeFolder === 'inbox' &&
    unreadCount > 0 &&
    ['archive', 'mark_read', 'trash'].includes(action)
  ) {
    queryClient.setQueryData<Record<string, number | null>>(
      ['mail', workspaceId, 'bootstrap-counts'],
      (current) =>
        current && current[mailboxId] != null
          ? {
              ...current,
              [mailboxId]: Math.max(0, current[mailboxId] - unreadCount),
            }
          : current
    );
    queryClient.setQueryData<MailBootstrapResponse>(
      ['mail', workspaceId, 'bootstrap'],
      (current) =>
        current
          ? {
              ...current,
              mailboxes: current.mailboxes.map((mailbox) =>
                mailbox.id === mailboxId
                  ? {
                      ...mailbox,
                      unreadCount:
                        mailbox.unreadCount === null
                          ? null
                          : Math.max(0, mailbox.unreadCount - unreadCount),
                    }
                  : mailbox
              ),
            }
          : current
    );
  }
}

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
      mutation.state.variables as {
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
      variables.targetThreadId === threadId ||
      Boolean(threadId && variables.threadIds?.includes(threadId))
  );
  const selectedThreadIdRef = useRef(threadId);
  selectedThreadIdRef.current = threadId;

  const snapshot = async (
    ids: Set<string>,
    action: ThreadAction
  ): Promise<OptimisticContext | null> => {
    if (!activeMailboxId) return null;
    await Promise.all([
      queryClient.cancelQueries({
        queryKey: ['mail', workspaceId, activeMailboxId],
      }),
      queryClient.cancelQueries({
        queryKey: ['mail', workspaceId, 'bootstrap-counts'],
      }),
    ]);
    const threadCaches = queryClient.getQueriesData<
      InfiniteData<MailThreadsResponse>
    >({ queryKey: ['mail', workspaceId, activeMailboxId, 'threads'] });
    const bootstrap = queryClient.getQueryData<MailBootstrapResponse>([
      'mail',
      workspaceId,
      'bootstrap',
    ]);
    const beforeCounts = queryClient.getQueryData<
      Record<string, number | null>
    >(['mail', workspaceId, 'bootstrap-counts']);
    const details = [...ids].map(
      (id) =>
        [
          id,
          queryClient.getQueryData<MailThreadDetail>([
            'mail',
            workspaceId,
            activeMailboxId,
            'thread',
            id,
          ]),
        ] as const
    );
    const unreadCount = threads
      .filter((thread) => ids.has(thread.id))
      .reduce((total, thread) => total + thread.unreadCount, 0);
    applyOptimisticUpdate({
      action,
      activeFolder: folder,
      mailboxId: activeMailboxId,
      queryClient,
      threadIds: ids,
      unreadCount,
      workspaceId,
    });
    const nextBootstrap = queryClient.getQueryData<MailBootstrapResponse>([
      'mail',
      workspaceId,
      'bootstrap',
    ]);
    const beforeUnread =
      beforeCounts?.[activeMailboxId] ??
      bootstrap?.mailboxes.find((mailbox) => mailbox.id === activeMailboxId)
        ?.unreadCount ??
      0;
    const afterUnread =
      queryClient.getQueryData<Record<string, number | null>>([
        'mail',
        workspaceId,
        'bootstrap-counts',
      ])?.[activeMailboxId] ??
      nextBootstrap?.mailboxes.find((mailbox) => mailbox.id === activeMailboxId)
        ?.unreadCount ??
      0;
    return {
      ids,
      mailboxId: activeMailboxId,
      workspaceId,
      unreadDelta: beforeUnread - afterUnread,
      details,
      threadCaches,
    };
  };

  const restore = (context: OptimisticContext | null | undefined) => {
    if (!context) return;
    const { mailboxId: activeMailboxId, workspaceId } = context;
    for (const [key, data] of context.threadCaches as ThreadCacheSnapshot) {
      queryClient.setQueryData<InfiniteData<MailThreadsResponse>>(
        key,
        (current) => restoreThreadPages(current, data, context.ids)
      );
    }
    queryClient.setQueryData<MailBootstrapResponse>(
      ['mail', workspaceId, 'bootstrap'],
      (current) =>
        current
          ? {
              ...current,
              mailboxes: current.mailboxes.map((mailbox) =>
                mailbox.id === activeMailboxId
                  ? {
                      ...mailbox,
                      unreadCount:
                        mailbox.unreadCount === null
                          ? null
                          : mailbox.unreadCount + context.unreadDelta,
                    }
                  : mailbox
              ),
            }
          : current
    );
    queryClient.setQueryData<Record<string, number | null>>(
      ['mail', workspaceId, 'bootstrap-counts'],
      (current) =>
        current && current[activeMailboxId] != null
          ? {
              ...current,
              [activeMailboxId]: current[activeMailboxId] + context.unreadDelta,
            }
          : current
    );
    for (const [id, detail] of context.details) {
      queryClient.setQueryData(
        ['mail', workspaceId, activeMailboxId, 'thread', id],
        detail
      );
    }
  };

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

  return {
    actionPending,
    actionsPending,
    bulkMutation: {
      ...bulkMutation,
      mutate: (action: BulkAction) => {
        const threadIds = [...selectedThreads].filter(
          (id) => !inFlight.current.has(id)
        );
        if (!threadIds.length) return;
        for (const id of threadIds) inFlight.current.add(id);
        bulkMutation.mutate({
          action,
          threadIds,
          mailboxId: activeMailboxId ?? '',
          targetWorkspaceId: workspaceId,
        });
      },
    },
    mutateThread: (action: ThreadAction, targetThreadId = threadId) => {
      if (!targetThreadId || inFlight.current.has(targetThreadId)) return;
      inFlight.current.add(targetThreadId);
      stateMutation.mutate({
        action,
        targetThreadId,
        mailboxId: activeMailboxId ?? '',
        targetWorkspaceId: workspaceId,
      });
    },
    stateMutation,
    syncState: actionsPending
      ? ('syncing' as const)
      : (syncStates[operationScope] ?? 'idle'),
  };
}
