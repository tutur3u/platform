'use client';

import { useTranslations } from 'next-intl';
import { type MailFolder, mailFolderIcons } from './mail-folders';
import { MailMarkFolderRead } from './mail-mark-folder-read';
import { MailSyncStatus } from './mail-sync-status';
import type { MailSyncState } from './use-mail-thread-actions';

export function MailListHeader({
  actionsPending,
  address,
  folder,
  mailboxId,
  onRefresh,
  refreshing,
  syncState,
  workspaceId,
}: {
  actionsPending: boolean;
  address?: string;
  folder: MailFolder;
  mailboxId: string | null;
  onRefresh: () => unknown;
  refreshing: boolean;
  syncState: MailSyncState;
  workspaceId: string;
}) {
  const t = useTranslations('mail');
  const FolderIcon = mailFolderIcons[folder];

  return (
    <div className="flex min-h-16 items-center gap-3 border-dynamic border-b px-5">
      <div className="flex size-8 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
        <FolderIcon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-semibold text-base tracking-tight">
          {t(folder)}
        </h1>
        <p className="truncate text-muted-foreground text-xs">{address}</p>
      </div>
      {mailboxId && (folder === 'inbox' || folder === 'archive') ? (
        <MailMarkFolderRead
          workspaceId={workspaceId}
          mailboxId={mailboxId}
          folder={folder}
          disabled={actionsPending}
        />
      ) : null}
      <MailSyncStatus
        state={syncState}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
    </div>
  );
}
