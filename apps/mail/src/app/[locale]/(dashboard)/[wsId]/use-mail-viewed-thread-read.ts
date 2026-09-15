'use client';

import {
  useMutation,
  useMutationState,
  useQueryClient,
} from '@tanstack/react-query';
import type { MailThreadSummary } from '@tuturuuu/internal-api';
import {
  type MailThreadDetail,
  updateMailThreadState,
} from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import type { MailFolder } from './mail-folders';
import {
  restoreMailThreads,
  snapshotMailThreads,
} from './mail-thread-optimistic';

/** Reading follows the loaded reader, including restored URLs and archive navigation. */
export function useMailViewedThreadRead({
  workspaceId,
  mailboxId,
  threadId,
  detail,
  blocked,
  folder = 'inbox',
  threads = [],
}: {
  workspaceId: string;
  mailboxId: string | null;
  threadId: string | null;
  detail: MailThreadDetail | undefined;
  blocked: boolean;
  folder?: MailFolder;
  threads?: MailThreadSummary[];
}) {
  const client = useQueryClient();
  const t = useTranslations('mail');
  const attempted = useRef<string | null>(null);
  const selection = `${workspaceId}/${mailboxId}/${threadId}`;
  const previousSelection = useRef(selection);
  const unreadIds =
    detail?.thread.id === threadId
      ? detail.messages
          .filter((message) => message.unread)
          .map((message) => message.id)
          .sort()
          .join(',') ||
        (detail.thread.unreadCount > 0
          ? `count:${detail.thread.unreadCount}:${detail.thread.messageCount}:${detail.thread.lastMessageAt}`
          : '')
      : '';
  const pending = useMutationState({
    filters: {
      mutationKey: ['mail', workspaceId, mailboxId, 'actions'],
      status: 'pending',
    },
    select: (mutation) => ({
      kind: mutation.options.mutationKey?.at(-1),
      threadId: (mutation.state.variables as { threadId?: string } | undefined)
        ?.threadId,
    }),
  });
  const actionBlocked = pending.some(
    (mutation) => mutation.kind !== 'viewed-read'
  );
  const readPending = pending.some(
    (mutation) =>
      mutation.kind === 'viewed-read' && mutation.threadId === threadId
  );
  const { mutate } = useMutation({
    mutationKey: ['mail', workspaceId, mailboxId, 'actions', 'viewed-read'],
    mutationFn: (target: {
      workspaceId: string;
      mailboxId: string;
      threadId: string;
    }) =>
      updateMailThreadState(
        target.workspaceId,
        target.mailboxId,
        target.threadId,
        {
          action: 'mark_read',
        }
      ),
    onMutate: (target) =>
      snapshotMailThreads({
        queryClient: client,
        activeMailboxId: target.mailboxId,
        workspaceId: target.workspaceId,
        ids: new Set([target.threadId]),
        action: 'mark_read',
        folder,
        threads,
      }),
    onError: (_error, _target, context) => {
      restoreMailThreads(client, context);
      toast.error(t('update_failed'));
    },
    onSettled: async (_data, _error, target) => {
      if (
        client.isMutating({
          mutationKey: [
            'mail',
            target.workspaceId,
            target.mailboxId,
            'actions',
          ],
        }) > 1
      )
        return;
      await Promise.all([
        client.invalidateQueries({
          queryKey: ['mail', target.workspaceId, target.mailboxId],
        }),
        client.invalidateQueries({
          queryKey: ['mail', target.workspaceId, 'bootstrap'],
        }),
        client.invalidateQueries({
          queryKey: ['mail', target.workspaceId, 'bootstrap-counts'],
        }),
      ]);
    },
  });

  useEffect(() => {
    if (previousSelection.current !== selection) {
      previousSelection.current = selection;
      attempted.current = null;
    }
    // Wait for optimistic archive/trash to settle, avoiding nested rollback snapshots.
    if (
      blocked ||
      actionBlocked ||
      readPending ||
      !mailboxId ||
      !threadId ||
      !unreadIds
    )
      return;
    const signature = `${selection}/${unreadIds}`;
    if (attempted.current === signature) return;
    attempted.current = signature;
    mutate({ workspaceId, mailboxId, threadId });
  }, [
    blocked,
    actionBlocked,
    readPending,
    mailboxId,
    mutate,
    selection,
    threadId,
    unreadIds,
    workspaceId,
  ]);
}
