'use client';

import {
  type InfiniteData,
  type QueryClient,
  type QueryKey,
  useMutation,
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

type ThreadAction = Parameters<typeof updateMailThreadState>[3]['action'];
type BulkAction = 'archive' | 'mark_read' | 'trash';
export type MailSyncState = 'idle' | 'syncing' | 'synced' | 'failed';

type ThreadCacheSnapshot = Array<
  [QueryKey, InfiniteData<MailThreadsResponse> | undefined]
>;
type OptimisticContext = {
  bootstrap: MailBootstrapResponse | undefined;
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
                      unreadCount: Math.max(
                        0,
                        mailbox.unreadCount - unreadCount
                      ),
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
  const [syncState, setSyncState] = useState<MailSyncState>('idle');
  const selectedThreadIdRef = useRef(threadId);
  selectedThreadIdRef.current = threadId;

  const snapshot = async (
    ids: Set<string>,
    action: ThreadAction
  ): Promise<OptimisticContext | null> => {
    if (!activeMailboxId) return null;
    await queryClient.cancelQueries({
      queryKey: ['mail', workspaceId, activeMailboxId],
    });
    const threadCaches = queryClient.getQueriesData<
      InfiniteData<MailThreadsResponse>
    >({ queryKey: ['mail', workspaceId, activeMailboxId, 'threads'] });
    const bootstrap = queryClient.getQueryData<MailBootstrapResponse>([
      'mail',
      workspaceId,
      'bootstrap',
    ]);
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
    return { bootstrap, details, threadCaches };
  };

  const restore = (context: OptimisticContext | null | undefined) => {
    if (!context || !activeMailboxId) return;
    for (const [key, data] of context.threadCaches as ThreadCacheSnapshot) {
      queryClient.setQueryData(key, data);
    }
    queryClient.setQueryData(
      ['mail', workspaceId, 'bootstrap'],
      context.bootstrap
    );
    for (const [id, detail] of context.details) {
      queryClient.setQueryData(
        ['mail', workspaceId, activeMailboxId, 'thread', id],
        detail
      );
    }
  };

  const stateMutation = useMutation({
    mutationKey: ['mail', workspaceId, activeMailboxId, 'state'],
    mutationFn: ({
      action,
      targetThreadId,
    }: {
      action: ThreadAction;
      targetThreadId: string;
    }) =>
      updateMailThreadState(
        workspaceId,
        activeMailboxId ?? '',
        targetThreadId,
        { action }
      ),
    onMutate: async ({ action, targetThreadId }) => {
      setSyncState('syncing');
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
      return { navigatedTo, snapshot: context };
    },
    onError: (_error, variables, context) => {
      restore(context?.snapshot);
      if (
        context?.navigatedTo !== undefined &&
        selectedThreadIdRef.current === context.navigatedTo &&
        (variables.action === 'archive' || variables.action === 'trash')
      ) {
        reopenThread(variables.targetThreadId);
      }
      setSyncState('failed');
      toast.error(t('update_failed'));
    },
    onSuccess: () => {
      setSyncState('synced');
    },
    onSettled: () => invalidateMailbox(),
  });

  const bulkMutation = useMutation({
    mutationKey: ['mail', workspaceId, activeMailboxId, 'bulk'],
    mutationFn: (action: BulkAction) =>
      bulkUpdateMailThreads(workspaceId, activeMailboxId ?? '', {
        action,
        threadIds: [...selectedThreads],
      }),
    onMutate: async (action) => {
      setSyncState('syncing');
      const ids = new Set(selectedThreads);
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
      return { ids, optimistic, previousThreadId, navigatedTo };
    },
    onError: (_error, _action, context) => {
      restore(context?.optimistic);
      if (context?.ids) setSelectedThreads(context.ids);
      if (
        context?.previousThreadId &&
        context.navigatedTo !== undefined &&
        selectedThreadIdRef.current === context.navigatedTo
      ) {
        reopenThread(context.previousThreadId);
      }
      setSyncState('failed');
      toast.error(t('update_failed'));
    },
    onSuccess: () => {
      setSyncState('synced');
    },
    onSettled: () => invalidateMailbox(),
  });

  return {
    bulkMutation,
    mutateThread: (action: ThreadAction, targetThreadId = threadId) => {
      if (targetThreadId) stateMutation.mutate({ action, targetThreadId });
    },
    stateMutation,
    syncState,
  };
}
