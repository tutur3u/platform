import { getMailboxOrganization } from '@tuturuuu/internal-api';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import { MAIL_READ_TIMEOUT_CODE } from '@/lib/mail/read-timeout-contract';

export function isMailboxForbidden(error: unknown) {
  return error instanceof InternalApiError && error.status === 403;
}

/**
 * A mailbox-scoped write that is refused (403) or not found (404) usually means
 * the tab still targets a mailbox owned by a previous account after a switch.
 * Callers should reload the mail caches under the current session, not surface
 * a generic update failure.
 */
export function isStaleMailboxAccessError(error: unknown) {
  return (
    error instanceof InternalApiError &&
    (error.status === 403 || error.status === 404)
  );
}

export function isMailReadTimeout(error: unknown) {
  return (
    error instanceof InternalApiError && error.code === MAIL_READ_TIMEOUT_CODE
  );
}

export function retryMailRead(failureCount: number, error: unknown) {
  return (
    !isMailboxForbidden(error) && !isMailReadTimeout(error) && failureCount < 3
  );
}

export function mailOrganizationQuery(workspaceId: string, mailboxId: string) {
  return {
    queryFn: () => getMailboxOrganization(workspaceId, mailboxId),
    queryKey: ['mail', workspaceId, mailboxId, 'organization'] as const,
    retry: retryMailRead,
    retryOnMount: false,
  };
}
