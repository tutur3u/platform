'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, Loader2 } from '@tuturuuu/icons';
import { markMailFolderRead } from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { MailIconButton } from './mail-icon-button';

export function MailMarkFolderRead({
  workspaceId,
  mailboxId,
  folder,
  disabled,
}: {
  workspaceId: string;
  mailboxId: string;
  folder: 'inbox' | 'archive';
  disabled: boolean;
}) {
  const t = useTranslations('mail');
  const client = useQueryClient();
  const mutation = useMutation({
    mutationKey: ['mail', workspaceId, mailboxId, 'actions', 'folder-read'],
    mutationFn: async (target: {
      workspaceId: string;
      mailboxId: string;
      folder: 'inbox' | 'archive';
    }) => {
      let cursor: string | undefined;
      let before: string | undefined;
      do {
        const result = await markMailFolderRead(
          target.workspaceId,
          target.mailboxId,
          {
            folder: target.folder,
            cursor,
            before,
          }
        );
        cursor = result.nextCursor ?? undefined;
        before = result.before;
      } while (cursor);
    },
    // Earlier batches may have succeeded. Reconcile with the server even on failure.
    onError: () => toast.error(t('update_failed')),
    onSuccess: () => toast.success(t('all_marked_read')),
    onSettled: async (_data, _error, target) => {
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
  return (
    <MailIconButton
      aria-label={t(
        folder === 'inbox' ? 'mark_inbox_read' : 'mark_archive_read'
      )}
      disabled={disabled || mutation.isPending}
      onClick={() => mutation.mutate({ workspaceId, mailboxId, folder })}
    >
      {mutation.isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <CheckCheck className="size-4" />
      )}
    </MailIconButton>
  );
}
