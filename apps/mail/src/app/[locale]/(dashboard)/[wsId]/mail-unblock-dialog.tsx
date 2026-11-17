'use client';

import type { MailSenderBlock } from '@tuturuuu/internal-api';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { senderBlockTarget } from './mail-sender-block-model';
import { useMailSenderBlockMutations } from './use-mail-sender-blocks';

/**
 * Confirms an unblock. Mail already in Blocked stays there unless the person
 * chooses to move it back to the Inbox in the same step.
 */
export function MailUnblockDialog({
  block,
  mailboxId,
  onOpenChange,
  workspaceId,
}: {
  block: MailSenderBlock | null;
  mailboxId: string;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}) {
  const t = useTranslations('mail.blocked_senders');
  const { remove } = useMailSenderBlockMutations(workspaceId, mailboxId);
  const unblock = (restoreToInbox: boolean) => {
    if (!block) return;
    remove.mutate(
      { block, restoreToInbox },
      { onSuccess: () => onOpenChange(false) }
    );
  };
  return (
    <AlertDialog open={Boolean(block)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('unblock_title', {
              target: block ? senderBlockTarget(block) : '',
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('unblock_description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>
            {t('cancel')}
          </AlertDialogCancel>
          <Button
            disabled={remove.isPending}
            onClick={() => unblock(false)}
            variant="outline"
          >
            {t('unblock')}
          </Button>
          <Button disabled={remove.isPending} onClick={() => unblock(true)}>
            {t('unblock_and_restore')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
