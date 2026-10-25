import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import {
  listMailThreads,
  type MailThreadsResponse,
  type UpdateMailMessageStatePayload,
} from '@tuturuuu/internal-api';
import { updateThreadPages } from './mail-thread-optimistic';
import {
  MAIL_THREAD_PAGE_SIZE,
  type MailThreadQueryScope,
} from './mail-thread-query';

import {
  type MailThreadRevision,
  sameThreadRevision,
} from './mail-thread-revision';

/** Apply actions overlapping a list request before its response enters the cache. */
export async function loadMailThreadPage(
  client: QueryClient,
  scope: MailThreadQueryScope,
  page: number
) {
  const cache = client.getMutationCache();
  const startedAfter = cache.getAll().at(-1)?.mutationId ?? 0;
  const pendingAtStart = new Set(
    cache
      .getAll()
      .filter((mutation) => mutation.state.status === 'pending')
      .map((mutation) => mutation.mutationId)
  );
  const result = await listMailThreads(scope.workspaceId, scope.mailboxId, {
    folder: scope.folder,
    folderId: scope.folderId ?? undefined,
    label: scope.label ?? undefined,
    page,
    pageSize: MAIL_THREAD_PAGE_SIZE,
    query: scope.query || undefined,
  });
  let data: InfiniteData<MailThreadsResponse> = {
    pages: [result],
    pageParams: [page],
  };
  for (const mutation of cache.findAll({
    mutationKey: ['mail', scope.workspaceId, scope.mailboxId, 'actions'],
  })) {
    if (
      mutation.state.status !== 'pending' &&
      mutation.state.status !== 'success'
    )
      continue;
    if (
      mutation.mutationId <= startedAfter &&
      !pendingAtStart.has(mutation.mutationId)
    )
      continue;
    const target = mutation.state.variables as
      | {
          action?: UpdateMailMessageStatePayload['action'];
          targetThreadId?: string;
          threadId?: string;
          threadIds?: string[];
          threadRevisions?: Record<string, MailThreadRevision>;
          targetWorkspaceId?: string;
          mailboxId?: string;
        }
      | undefined;
    if (
      !target ||
      (target.targetWorkspaceId &&
        target.targetWorkspaceId !== scope.workspaceId) ||
      (target.mailboxId && target.mailboxId !== scope.mailboxId)
    )
      continue;
    const action =
      mutation.options.mutationKey?.at(-1) === 'viewed-read'
        ? 'mark_read'
        : target.action;
    const ids = new Set(
      target.threadIds ?? [target.targetThreadId ?? target.threadId ?? '']
    );
    ids.delete('');
    // The server archives messages up to its action watermark. A newer inbound
    // message in the same conversation is authoritative and must reappear.
    for (const thread of result.threads) {
      if (
        (action === 'archive' || action === 'trash') &&
        !sameThreadRevision(thread, target.threadRevisions?.[thread.id])
      )
        ids.delete(thread.id);
    }
    if (action && ids.size)
      data = updateThreadPages(
        data,
        ids,
        action,
        scope.folder,
        scope.query ?? ''
      )!;
  }
  return data.pages[0]!;
}
