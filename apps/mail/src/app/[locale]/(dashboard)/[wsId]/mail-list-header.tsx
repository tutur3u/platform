'use client';

import { useTranslations } from 'next-intl';
import type { MailFolder } from './mail-folders';
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

  return (
    <div className="flex min-h-14 items-center gap-1 border-dynamic border-b py-2 pr-2 pl-4">
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-semibold text-base leading-6 tracking-tight">
          {t(folder)}
        </h1>
        {address ? (
          <p className="truncate text-muted-foreground text-xs">{address}</p>
        ) : null}
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
