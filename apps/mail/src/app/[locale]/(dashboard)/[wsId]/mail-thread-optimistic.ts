import type {
  InfiniteData,
  QueryClient,
  QueryKey,
} from '@tanstack/react-query';
import type {
  MailBootstrapResponse,
  MailThreadDetail,
  MailThreadSummary,
  MailThreadsResponse,
  UpdateMailMessageStatePayload,
} from '@tuturuuu/internal-api';
import {
  claimMailOptimisticRevision,
  currentMailOptimisticIds,
} from './mail-action-coordination';
import type { MailFolder } from './mail-folders';
import { restoreThreadPages } from './mail-thread-rollback';

type ThreadAction = UpdateMailMessageStatePayload['action'];
export type ThreadCacheSnapshot = Array<
  [QueryKey, InfiniteData<MailThreadsResponse> | undefined]
>;
export type OptimisticContext = {
  mailboxId: string;
  workspaceId: string;
  ids: Set<string>;
  unreadDelta: number;
  revision: symbol;
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
  if (
    (action === 'mark_read' || action === 'archive') &&
    hasStateFilter(query, 'unread')
  )
    return true;
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
            ...updateInboxMetadata(thread, action),
            starred:
              action === 'star'
                ? true
                : action === 'unstar'
                  ? false
                  : thread.starred,
            unreadCount:
              action === 'mark_read' || action === 'archive'
                ? 0
                : action === 'mark_unread'
                  ? (thread.inboundCount ?? Math.max(1, thread.unreadCount))
                  : thread.unreadCount,
          },
        ];
      }),
    })),
  };
}

export function updateDetail(
  current: MailThreadDetail | undefined,
  action: ThreadAction
) {
  if (!current) return current;
  return {
    ...current,
    thread: {
      ...current.thread,
      ...updateInboxMetadata(current.thread, action),
      unreadCount:
        action === 'mark_read' || action === 'archive'
          ? 0
          : action === 'mark_unread'
            ? (current.thread.inboundCount ??
              current.messages.filter(
                (message) => message.direction === 'inbound'
              ).length)
            : current.thread.unreadCount,
    },
    messages: current.messages.map((message) => ({
      ...message,
      unread:
        action === 'mark_read' || action === 'archive'
          ? false
          : action === 'mark_unread' && message.direction
            ? message.direction === 'inbound'
            : message.unread,
      starred:
        action === 'star'
          ? true
          : action === 'unstar'
            ? false
            : message.starred,
    })),
  };
}

export function applyOptimisticUpdate({
  action,
  activeFolder,
  mailboxId,
  queryClient,
  threadIds,
  unreadCount,
  markUnreadDelta = 0,
  updateInboxCounts = false,
  workspaceId,
}: {
  action: ThreadAction;
  activeFolder: MailFolder;
  mailboxId: string;
  queryClient: QueryClient;
  threadIds: Set<string>;
  unreadCount: number;
  markUnreadDelta?: number;
  updateInboxCounts?: boolean;
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
    (activeFolder === 'inbox' || updateInboxCounts) &&
    ((unreadCount > 0 && ['archive', 'mark_read', 'trash'].includes(action)) ||
      (action === 'mark_unread' && markUnreadDelta > 0))
  ) {
    const delta = action === 'mark_unread' ? -markUnreadDelta : unreadCount;
    queryClient.setQueryData<Record<string, number | null>>(
      ['mail', workspaceId, 'bootstrap-counts'],
      (current) =>
        current && current[mailboxId] != null
          ? {
              ...current,
              [mailboxId]: Math.max(0, current[mailboxId] - delta),
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
                          : Math.max(0, mailbox.unreadCount - delta),
                    }
                  : mailbox
              ),
            }
          : current
    );
  }
}

export async function snapshotMailThreads({
  queryClient,
  activeMailboxId,
  workspaceId,
  ids,
  action,
  folder,
  threads,
}: {
  queryClient: QueryClient;
  activeMailboxId: string | null;
  workspaceId: string;
  ids: Set<string>;
  action: ThreadAction;
  folder: MailFolder;
  threads: MailThreadSummary[];
}): Promise<OptimisticContext | null> {
  if (!activeMailboxId) return null;
  await Promise.all([
    queryClient.cancelQueries({
      queryKey: ['mail', workspaceId, activeMailboxId],
      predicate: (query) =>
        query.queryKey[3] !== 'thread' ||
        (ids.has(String(query.queryKey[4])) && query.state.data !== undefined),
    }),
    queryClient.cancelQueries({
      queryKey: ['mail', workspaceId, 'bootstrap-counts'],
    }),
    queryClient.cancelQueries({
      queryKey: ['mail', workspaceId, 'bootstrap'],
    }),
  ]);
  const revision = claimMailOptimisticRevision(
    queryClient,
    workspaceId,
    activeMailboxId,
    ids
  );
  const threadCaches = queryClient.getQueriesData<
    InfiniteData<MailThreadsResponse>
  >({ queryKey: ['mail', workspaceId, activeMailboxId, 'threads'] });
  const bootstrap = queryClient.getQueryData<MailBootstrapResponse>([
    'mail',
    workspaceId,
    'bootstrap',
  ]);
  const beforeCounts = queryClient.getQueryData<Record<string, number | null>>([
    'mail',
    workspaceId,
    'bootstrap-counts',
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
  const summaries = new Map(threads.map((thread) => [thread.id, thread]));
  for (const [, cache] of threadCaches) {
    for (const page of cache?.pages ?? []) {
      for (const thread of page.threads)
        if (!summaries.has(thread.id)) summaries.set(thread.id, thread);
    }
  }
  let unreadCount = 0;
  let markUnreadDelta = 0;
  for (const [id, detail] of details) {
    const summary = summaries.get(id);
    const unread =
      detail?.thread.unreadCount ??
      summary?.unreadCount ??
      detail?.messages.filter((message) => message.unread).length ??
      0;
    const inbound =
      detail?.thread.inboundCount ??
      summary?.inboundCount ??
      detail?.messages.filter((message) => message.direction === 'inbound')
        .length ??
      Math.max(1, unread);
    const inboxUnread =
      detail?.thread.inboxUnreadCount ??
      summary?.inboxUnreadCount ??
      (folder === 'inbox' ? unread : 0);
    const inboxInbound =
      detail?.thread.inboxInboundCount ??
      summary?.inboxInboundCount ??
      (folder === 'inbox' ? inbound : 0);
    unreadCount += inboxUnread;
    markUnreadDelta += Math.max(0, inboxInbound - inboxUnread);
  }
  applyOptimisticUpdate({
    action,
    activeFolder: folder,
    mailboxId: activeMailboxId,
    queryClient,
    threadIds: ids,
    unreadCount,
    markUnreadDelta,
    updateInboxCounts: true,
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
    revision,
    details,
    threadCaches,
  };
}

export function restoreMailThreads(
  queryClient: QueryClient,
  context: OptimisticContext | null | undefined
) {
  if (!context) return;
  const { mailboxId: activeMailboxId, workspaceId } = context;
  const ids = currentMailOptimisticIds(
    queryClient,
    workspaceId,
    activeMailboxId,
    context.ids,
    context.revision
  );
  // A newer action owns these rows. Reconciliation will recover their server state.
  if (!ids.size) return;
  const unreadDelta = ids.size === context.ids.size ? context.unreadDelta : 0;
  for (const [key, data] of context.threadCaches as ThreadCacheSnapshot) {
    queryClient.setQueryData<InfiniteData<MailThreadsResponse>>(
      key,
      (current) => restoreThreadPages(current, data, ids)
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
                        : mailbox.unreadCount + unreadDelta,
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
            [activeMailboxId]: current[activeMailboxId] + unreadDelta,
          }
        : current
  );
  for (const [id, detail] of context.details) {
    if (!ids.has(id)) continue;
    queryClient.setQueryData(
      ['mail', workspaceId, activeMailboxId, 'thread', id],
      detail
    );
  }
}

function updateInboxMetadata(
  thread: { inboxInboundCount?: number; inboxUnreadCount?: number },
  action: ThreadAction
) {
  if (action === 'archive' || action === 'trash')
    return { inboxInboundCount: 0, inboxUnreadCount: 0 };
  if (action === 'mark_read') return { inboxUnreadCount: 0 };
  if (action === 'mark_unread' && thread.inboxInboundCount != null)
    return { inboxUnreadCount: thread.inboxInboundCount };
  return {};
}
