'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type MailThreadDetail,
  updateMailThreadState,
} from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

/** Reading follows the loaded reader, including restored URLs and archive navigation. */
export function useMailViewedThreadRead({
  workspaceId,
  mailboxId,
  threadId,
  detail,
  blocked,
}: {
  workspaceId: string;
  mailboxId: string | null;
  threadId: string | null;
  detail: MailThreadDetail | undefined;
  blocked: boolean;
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
          .join(',')
      : '';
  const { mutate, isPending } = useMutation({
    mutationKey: ['mail', workspaceId, mailboxId, 'viewed-read'],
    mutationFn: (target: { mailboxId: string; threadId: string }) =>
      updateMailThreadState(workspaceId, target.mailboxId, target.threadId, {
        action: 'mark_read',
      }),
    onError: () => toast.error(t('update_failed')),
    onSettled: async (_data, _error, target) => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: ['mail', workspaceId, target.mailboxId],
        }),
        client.invalidateQueries({
          queryKey: ['mail', workspaceId, 'bootstrap'],
        }),
      ]);
    },
  });

  useEffect(() => {
    if (previousSelection.current !== selection) {
      previousSelection.current = selection;
      attempted.current = null;
    }
    if (!unreadIds) attempted.current = null;
    // Wait for optimistic archive/trash to settle, avoiding nested rollback snapshots.
    if (blocked || isPending || !mailboxId || !threadId || !unreadIds) return;
    const signature = `${selection}/${unreadIds}`;
    if (attempted.current === signature) return;
    attempted.current = signature;
    mutate({ mailboxId, threadId });
  }, [blocked, isPending, mailboxId, mutate, selection, threadId, unreadIds]);
}
