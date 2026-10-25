import { type QueryClient, queryOptions } from '@tanstack/react-query';
import {
  getMailThread,
  type UpdateMailMessageStatePayload,
} from '@tuturuuu/internal-api';
import { updateDetail } from './mail-thread-optimistic';

export function mailThreadDetailQuery(
  client: QueryClient,
  workspaceId: string,
  mailboxId: string,
  threadId: string
) {
  return queryOptions({
    queryKey: ['mail', workspaceId, mailboxId, 'thread', threadId],
    staleTime: 30_000,
    queryFn: async () => {
      const cache = client.getMutationCache();
      const startedAfter = cache.getAll().at(-1)?.mutationId ?? 0;
      const pendingAtStart = new Set(
        cache
          .getAll()
          .filter((mutation) => mutation.state.status === 'pending')
          .map((mutation) => mutation.mutationId)
      );
      let detail = await getMailThread(workspaceId, mailboxId, threadId);
      // Initial loads stay alive. Replay newer changes so a slow response cannot undo them.
      for (const mutation of cache.findAll({
        mutationKey: ['mail', workspaceId, mailboxId, 'actions'],
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
              threadId?: string;
              targetThreadId?: string;
              threadIds?: string[];
              action?: UpdateMailMessageStatePayload['action'];
            }
          | undefined;
        if (
          !target ||
          !(
            target.threadId === threadId ||
            target.targetThreadId === threadId ||
            target.threadIds?.includes(threadId)
          )
        )
          continue;
        const action =
          mutation.options.mutationKey?.at(-1) === 'viewed-read'
            ? 'mark_read'
            : target.action;
        if (action) detail = updateDetail(detail, action)!;
      }
      return detail;
    },
  });
}
