'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addMailSenderBlock,
  listMailSenderBlocks,
  type MailSenderBlock,
  removeMailSenderBlock,
} from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import type { SenderBlockRule } from '@/lib/mail/sender-blocks/match';
import { senderBlockTarget } from './mail-sender-block-model';
import { useMailBootstrap } from './use-mail-bootstrap';

export function mailSenderBlocksQueryKey(wsId: string, mailboxId: string) {
  return ['mail', wsId, mailboxId, 'sender-blocks'] as const;
}

export function useMailSenderBlocks(
  wsId: string | undefined,
  mailboxId: string | undefined
) {
  return useQuery({
    enabled: Boolean(wsId && mailboxId),
    queryFn: () => listMailSenderBlocks(wsId!, mailboxId!),
    queryKey: mailSenderBlocksQueryKey(wsId ?? '', mailboxId ?? ''),
    select: (data) => data.blocks,
    staleTime: 30_000,
  });
}

/** Owners and admins of the mailbox may block and unblock senders. */
export function useCanManageSenderBlocks(
  wsId: string | undefined,
  mailboxId: string | undefined
) {
  const bootstrap = useMailBootstrap(wsId ?? '');
  const role = bootstrap.data?.mailboxes.find(
    (mailbox) => mailbox.id === mailboxId
  )?.role;
  return role === 'owner' || role === 'admin';
}

/**
 * Block-list mutations. Both refresh the block list and the mailbox's thread
 * lists, since blocking and restoring move mail between Inbox and Blocked.
 */
export function useMailSenderBlockMutations(wsId: string, mailboxId: string) {
  const t = useTranslations('mail.blocked_senders');
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['mail', wsId, mailboxId] }),
      queryClient.invalidateQueries({
        queryKey: ['mail', wsId, 'bootstrap-counts'],
      }),
    ]);

  const add = useMutation({
    mutationFn: (
      rule: SenderBlockRule
    ): Promise<{ block: MailSenderBlock; moved: number }> =>
      addMailSenderBlock(wsId, mailboxId, { ...rule, moveExisting: true }),
    onSuccess: async ({ block }) => {
      toast.success(t('blocked_toast', { target: senderBlockTarget(block) }));
      await refresh();
    },
    onError: () => toast.error(t('save_failed')),
  });

  const remove = useMutation({
    mutationFn: ({
      block,
      restoreToInbox,
    }: {
      block: MailSenderBlock;
      restoreToInbox: boolean;
    }): Promise<{ moved: number }> =>
      removeMailSenderBlock(wsId, mailboxId, block.id, { restoreToInbox }),
    onSuccess: async ({ moved }, { block, restoreToInbox }) => {
      const target = senderBlockTarget(block);
      toast.success(
        restoreToInbox
          ? t('unblocked_moved_toast', { count: moved, target })
          : t('unblocked_toast', { target })
      );
      await refresh();
    },
    onError: () => toast.error(t('save_failed')),
  });

  return { add, remove };
}
