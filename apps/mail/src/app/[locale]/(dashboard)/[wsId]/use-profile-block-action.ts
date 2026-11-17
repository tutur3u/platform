'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  addMailSenderBlock,
  type MailSenderBlock,
  removeMailSenderBlock,
} from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import type { SenderBlockRule } from '@/lib/mail/sender-blocks/match';
import { mailPersonQueryKey } from './mail-people-resolver';
import { senderBlockTarget } from './mail-sender-block-model';

const UNDO_WINDOW_MS = 6000;

/**
 * Blocks a sender from the profile card. The toast offers Undo, which
 * removes the block and moves the sender's mail back to the Inbox.
 * Sender blocks, thread lists, counts and the person refresh either way.
 */
export function useProfileBlockAction(
  workspaceId: string,
  mailboxId: string,
  address: string
) {
  const t = useTranslations('mail.profile_actions');
  const queryClient = useQueryClient();

  function refresh() {
    return Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['mail', workspaceId, mailboxId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['mail', workspaceId, 'bootstrap-counts'],
      }),
      queryClient.invalidateQueries({
        queryKey: mailPersonQueryKey(workspaceId, address),
      }),
    ]);
  }

  async function undo(block: MailSenderBlock) {
    try {
      await removeMailSenderBlock(workspaceId, mailboxId, block.id, {
        restoreToInbox: true,
      });
      toast.success(t('unblocked_toast', { target: senderBlockTarget(block) }));
    } catch {
      toast.error(t('undo_failed'));
    } finally {
      await refresh();
    }
  }

  return useMutation({
    mutationFn: (
      input: SenderBlockRule & { moveExisting: boolean }
    ): Promise<{ block: MailSenderBlock; moved: number }> =>
      addMailSenderBlock(workspaceId, mailboxId, input),
    onSuccess: ({ block }) => {
      toast.success(t('blocked_toast', { target: senderBlockTarget(block) }), {
        duration: UNDO_WINDOW_MS,
        action: { label: t('undo'), onClick: () => void undo(block) },
      });
    },
    onError: () => toast.error(t('block_failed')),
    onSettled: refresh,
  });
}
