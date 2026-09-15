import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withMailApiBaseUrl,
} from './client';
export type MailBlacklistReason =
  | 'inactive'
  | 'verification_failed'
  | 'spam'
  | 'policy_violation'
  | 'fraud';
const path = (workspaceId: string, mailboxId: string, messageId: string) =>
  `/api/v1/workspaces/${encodePathSegment(workspaceId)}/mail/mailboxes/${encodePathSegment(mailboxId)}/messages/${encodePathSegment(messageId)}/blacklist`;
export function getMailBlacklistRecipients(
  workspaceId: string,
  mailboxId: string,
  messageId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(withMailApiBaseUrl(options)).json<{
    canManage: boolean;
    infrastructureOrigin?: string;
    recipients: Array<{
      email: string;
      blocked: boolean;
      reason?: string | null;
    }>;
  }>(path(workspaceId, mailboxId, messageId), {
    cache: 'no-store',
    credentials: 'include',
  });
}
export function blacklistMailFailedRecipient(
  workspaceId: string,
  mailboxId: string,
  messageId: string,
  payload: { email: string; reason: MailBlacklistReason },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(withMailApiBaseUrl(options)).json<{
    blocked: boolean;
    alreadyBlocked: boolean;
  }>(path(workspaceId, mailboxId, messageId), {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    credentials: 'include',
  });
}
