import type { MailThreadsResponse } from '@tuturuuu/internal-api';
import type { MailFolder } from './mail-folders';

export const MAIL_THREAD_PAGE_SIZE = 40;

export interface MailThreadQueryScope {
  folder: MailFolder;
  folderId?: string | null;
  label?: string | null;
  mailboxId: string;
  query?: string | null;
  workspaceId: string;
}

export function getMailThreadsQueryKey(scope: MailThreadQueryScope) {
  return [
    'mail',
    scope.workspaceId,
    scope.mailboxId,
    'threads',
    scope.folder,
    scope.folderId ?? null,
    scope.label ?? null,
    scope.query ?? '',
  ] as const;
}

export function getNextMailThreadPage(lastPage: MailThreadsResponse) {
  if (lastPage.pagination.hasMore) return lastPage.pagination.page + 1;
  if (lastPage.pagination.total === null) return undefined;
  const loadedThrough = lastPage.pagination.page * lastPage.pagination.pageSize;
  return loadedThrough < lastPage.pagination.total
    ? lastPage.pagination.page + 1
    : undefined;
}
