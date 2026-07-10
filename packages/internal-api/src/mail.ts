import type { InternalEmail } from '@tuturuuu/types';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  type InternalApiQueryValue,
  withMailApiBaseUrl,
} from './client';

export type MailMailboxRole = 'admin' | 'owner' | 'sender' | 'viewer';
export type MailMailboxType = 'personal' | 'shared';
export type MailMailboxStatus =
  | 'active'
  | 'archived'
  | 'disabled'
  | 'quarantined';
export type MailProvider = 'cloudflare' | 'ses';

export interface MailDomain {
  cloudflareAccountId: string | null;
  cloudflareRoutingRuleId: string | null;
  cloudflareZoneId: string | null;
  domain: string;
  id: string;
  inboundProvider: MailProvider;
  outboundProvider: MailProvider;
  status: 'active' | 'disabled' | 'pending' | 'quarantined' | 'verifying';
  verificationState: Record<string, unknown>;
  verifiedAt: string | null;
}

export type UpsertMailDomainPayload = Omit<MailDomain, 'id' | 'verifiedAt'>;

export interface MailMailbox {
  address: string;
  displayName: string;
  id: string;
  role: MailMailboxRole;
  status: MailMailboxStatus;
  type: MailMailboxType;
}

export interface MailLabel {
  color: string | null;
  id: string;
  kind: 'custom' | 'system';
  mailboxId: string;
  name: string;
  slug: string;
}

export interface MailFolderDefinition {
  id: string;
  kind: 'custom' | 'system';
  mailboxId: string;
  name: string;
  slug: string;
}

export interface MailRecipient {
  address: string;
  displayName: string | null;
  kind: 'bcc' | 'cc' | 'from' | 'reply_to' | 'to';
}

export interface MailAttachment {
  contentId: string | null;
  contentType: string;
  disposition: 'attachment' | 'inline';
  filename: string;
  id: string;
  protectedUrl: string | null;
  sizeBytes: number;
}

export interface MailMessageSummary {
  bodyText: string | null;
  createdAt: string;
  fromAddress: string;
  fromName: string | null;
  hasAttachments: boolean;
  id: string;
  labels: MailLabel[];
  mailboxId: string;
  receivedAt: string | null;
  sentAt: string | null;
  snippet: string | null;
  starred: boolean;
  status: string;
  subject: string;
  threadId: string | null;
  unread: boolean;
}

export interface MailMessageDetail extends MailMessageSummary {
  bodyHtml: string | null;
  sanitizedHtml: string | null;
  attachments: MailAttachment[];
  recipients: MailRecipient[];
}

export interface MailThread {
  id: string;
  lastMessageAt: string | null;
  mailboxId: string;
  messageCount: number;
  status: 'active' | 'archived' | 'spam' | 'trash';
  subject: string;
  unreadCount: number;
}

export interface MailThreadDetail {
  messages: MailMessageDetail[];
  thread: MailThread;
}

export interface MailBootstrapResponse {
  mailboxes: MailMailbox[];
  labels: MailLabel[];
  user: {
    email: string;
    id: string;
  };
}

export interface ListMailMessagesParams {
  folder?:
    | 'archive'
    | 'drafts'
    | 'inbox'
    | 'sent'
    | 'spam'
    | 'starred'
    | 'trash';
  label?: string;
  folderId?: string;
  page?: number;
  pageSize?: number;
  query?: string;
}

export interface MailMessagesResponse {
  messages: MailMessageSummary[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export interface CreateMailDraftPayload {
  bodyHtml?: string | null;
  bodyText?: string | null;
  bcc?: string[];
  cc?: string[];
  inReplyTo?: string | null;
  references?: string[];
  subject: string;
  to: string[];
}

export type UpdateMailDraftPayload = Partial<CreateMailDraftPayload>;

export interface SendMailMessagePayload extends CreateMailDraftPayload {
  draftId?: string | null;
}

export interface MailMutationResponse {
  message: MailMessageDetail;
}

export interface UpdateMailMessageStatePayload {
  action:
    | 'archive'
    | 'mark_read'
    | 'mark_unread'
    | 'restore'
    | 'star'
    | 'trash'
    | 'unstar';
}

export type MailBulkAction =
  | UpdateMailMessageStatePayload['action']
  | 'add_label'
  | 'clear_folder'
  | 'move_to_folder'
  | 'remove_label';

export interface BulkUpdateMailPayload {
  action: MailBulkAction;
  folderId?: string;
  labelId?: string;
  messageIds: string[];
}

export interface CreateMailOrganizationPayload {
  color?: string | null;
  name: string;
}

export interface UpdateMailOrganizationPayload {
  color?: string | null;
  name?: string;
}

export interface MailMailboxMember {
  createdAt: string;
  email: string | null;
  fullName: string | null;
  role: MailMailboxRole;
  userId: string;
}

export interface UpsertMailMailboxMemberPayload {
  role: MailMailboxRole;
  userId: string;
}

function workspaceMailPath(workspaceId: string, suffix = '') {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/mail${suffix}`;
}

function mailboxPath(workspaceId: string, mailboxId: string, suffix = '') {
  return workspaceMailPath(
    workspaceId,
    `/mailboxes/${encodePathSegment(mailboxId)}${suffix}`
  );
}

function jsonHeaders() {
  return {
    'Content-Type': 'application/json',
  };
}

function mailPlatformPath(suffix: string) {
  return `/api/v1/mail${suffix}`;
}

function normalizeMessagesQuery(params?: ListMailMessagesParams) {
  if (!params) return undefined;

  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined)
  ) as Record<string, InternalApiQueryValue>;
}

export async function listWorkspaceEmails(
  workspaceId: string,
  query?: { page?: number; pageSize?: number },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  const payload = await client.json<{ emails: InternalEmail[] }>(
    workspaceMailPath(workspaceId),
    {
      query,
      cache: 'no-store',
      credentials: 'include',
    }
  );

  return payload.emails ?? [];
}

export async function getMailBootstrap(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<MailBootstrapResponse>(
    workspaceMailPath(workspaceId, '/bootstrap'),
    {
      cache: 'no-store',
      credentials: 'include',
    }
  );
}

export async function listMailMessages(
  workspaceId: string,
  mailboxId: string,
  params?: ListMailMessagesParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<MailMessagesResponse>(
    mailboxPath(workspaceId, mailboxId, '/messages'),
    {
      cache: 'no-store',
      credentials: 'include',
      query: normalizeMessagesQuery(params),
    }
  );
}

export async function getMailMessage(
  workspaceId: string,
  mailboxId: string,
  messageId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<MailMessageDetail>(
    mailboxPath(
      workspaceId,
      mailboxId,
      `/messages/${encodePathSegment(messageId)}`
    ),
    {
      cache: 'no-store',
      credentials: 'include',
    }
  );
}

export async function getMailThread(
  workspaceId: string,
  mailboxId: string,
  threadId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<MailThreadDetail>(
    mailboxPath(
      workspaceId,
      mailboxId,
      `/threads/${encodePathSegment(threadId)}`
    ),
    { cache: 'no-store', credentials: 'include' }
  );
}

export async function updateMailThreadState(
  workspaceId: string,
  mailboxId: string,
  threadId: string,
  payload: UpdateMailMessageStatePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<MailThreadDetail>(
    mailboxPath(
      workspaceId,
      mailboxId,
      `/threads/${encodePathSegment(threadId)}`
    ),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'include',
      headers: jsonHeaders(),
      method: 'PATCH',
    }
  );
}

export async function createMailDraft(
  workspaceId: string,
  mailboxId: string,
  payload: CreateMailDraftPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<MailMutationResponse>(
    mailboxPath(workspaceId, mailboxId, '/drafts'),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'include',
      headers: jsonHeaders(),
      method: 'POST',
    }
  );
}

export async function updateMailDraft(
  workspaceId: string,
  mailboxId: string,
  draftId: string,
  payload: UpdateMailDraftPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<MailMutationResponse>(
    mailboxPath(
      workspaceId,
      mailboxId,
      `/drafts/${encodePathSegment(draftId)}`
    ),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'include',
      headers: jsonHeaders(),
      method: 'PATCH',
    }
  );
}

export async function deleteMailDraft(
  workspaceId: string,
  mailboxId: string,
  draftId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<void>(
    mailboxPath(
      workspaceId,
      mailboxId,
      `/drafts/${encodePathSegment(draftId)}`
    ),
    {
      cache: 'no-store',
      credentials: 'include',
      method: 'DELETE',
    }
  );
}

export async function uploadMailDraftAttachment(
  workspaceId: string,
  mailboxId: string,
  draftId: string,
  file: Blob,
  filename: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  const body = new FormData();
  body.append('file', file, filename);
  return client.json<{ attachment: MailAttachment }>(
    mailboxPath(
      workspaceId,
      mailboxId,
      `/drafts/${encodePathSegment(draftId)}/attachments`
    ),
    {
      body,
      cache: 'no-store',
      credentials: 'include',
      method: 'POST',
    }
  );
}

export async function deleteMailDraftAttachment(
  workspaceId: string,
  mailboxId: string,
  draftId: string,
  attachmentId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<void>(
    mailboxPath(
      workspaceId,
      mailboxId,
      `/drafts/${encodePathSegment(draftId)}/attachments/${encodePathSegment(
        attachmentId
      )}`
    ),
    { cache: 'no-store', credentials: 'include', method: 'DELETE' }
  );
}

export async function sendMailMessage(
  workspaceId: string,
  mailboxId: string,
  payload: SendMailMessagePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<MailMutationResponse>(
    mailboxPath(workspaceId, mailboxId, '/messages'),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'include',
      headers: jsonHeaders(),
      method: 'POST',
    }
  );
}

export async function updateMailMessageState(
  workspaceId: string,
  mailboxId: string,
  messageId: string,
  payload: UpdateMailMessageStatePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<MailMutationResponse>(
    mailboxPath(
      workspaceId,
      mailboxId,
      `/messages/${encodePathSegment(messageId)}/state`
    ),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'include',
      headers: jsonHeaders(),
      method: 'PATCH',
    }
  );
}

export async function bulkUpdateMailMessages(
  workspaceId: string,
  mailboxId: string,
  payload: BulkUpdateMailPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<{ updated: number }>(
    mailboxPath(workspaceId, mailboxId, '/messages/bulk'),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'include',
      headers: jsonHeaders(),
      method: 'PATCH',
    }
  );
}

export async function getMailboxOrganization(
  workspaceId: string,
  mailboxId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<{ folders: MailFolderDefinition[]; labels: MailLabel[] }>(
    mailboxPath(workspaceId, mailboxId, '/organization'),
    { cache: 'no-store', credentials: 'include' }
  );
}

export async function createMailLabel(
  workspaceId: string,
  mailboxId: string,
  payload: CreateMailOrganizationPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<{ label: MailLabel }>(
    mailboxPath(workspaceId, mailboxId, '/labels'),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'include',
      headers: jsonHeaders(),
      method: 'POST',
    }
  );
}

export async function updateMailLabel(
  workspaceId: string,
  mailboxId: string,
  labelId: string,
  payload: UpdateMailOrganizationPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<{ label: MailLabel }>(
    mailboxPath(
      workspaceId,
      mailboxId,
      `/labels/${encodePathSegment(labelId)}`
    ),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'include',
      headers: jsonHeaders(),
      method: 'PATCH',
    }
  );
}

export async function deleteMailLabel(
  workspaceId: string,
  mailboxId: string,
  labelId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<void>(
    mailboxPath(
      workspaceId,
      mailboxId,
      `/labels/${encodePathSegment(labelId)}`
    ),
    { cache: 'no-store', credentials: 'include', method: 'DELETE' }
  );
}

export async function createMailFolder(
  workspaceId: string,
  mailboxId: string,
  payload: CreateMailOrganizationPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<{ folder: MailFolderDefinition }>(
    mailboxPath(workspaceId, mailboxId, '/folders'),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'include',
      headers: jsonHeaders(),
      method: 'POST',
    }
  );
}

export async function updateMailFolder(
  workspaceId: string,
  mailboxId: string,
  folderId: string,
  payload: UpdateMailOrganizationPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<{ folder: MailFolderDefinition }>(
    mailboxPath(
      workspaceId,
      mailboxId,
      `/folders/${encodePathSegment(folderId)}`
    ),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'include',
      headers: jsonHeaders(),
      method: 'PATCH',
    }
  );
}

export async function deleteMailFolder(
  workspaceId: string,
  mailboxId: string,
  folderId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<void>(
    mailboxPath(
      workspaceId,
      mailboxId,
      `/folders/${encodePathSegment(folderId)}`
    ),
    { cache: 'no-store', credentials: 'include', method: 'DELETE' }
  );
}

export async function listMailMailboxMembers(
  workspaceId: string,
  mailboxId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<{ members: MailMailboxMember[] }>(
    mailboxPath(workspaceId, mailboxId, '/members'),
    {
      cache: 'no-store',
      credentials: 'include',
    }
  );
}

export async function upsertMailMailboxMember(
  workspaceId: string,
  mailboxId: string,
  payload: UpsertMailMailboxMemberPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<{ member: MailMailboxMember }>(
    mailboxPath(workspaceId, mailboxId, '/members'),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'include',
      headers: jsonHeaders(),
      method: 'POST',
    }
  );
}

export async function removeMailMailboxMember(
  workspaceId: string,
  mailboxId: string,
  userId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<void>(
    mailboxPath(
      workspaceId,
      mailboxId,
      `/members/${encodePathSegment(userId)}`
    ),
    {
      cache: 'no-store',
      credentials: 'include',
      method: 'DELETE',
    }
  );
}

export async function listMailDomains(options?: InternalApiClientOptions) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<{ domains: MailDomain[] }>(mailPlatformPath('/domains'), {
    cache: 'no-store',
    credentials: 'include',
  });
}

export async function upsertMailDomain(
  payload: UpsertMailDomainPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<{ domain: MailDomain }>(mailPlatformPath('/domains'), {
    body: JSON.stringify(payload),
    cache: 'no-store',
    credentials: 'include',
    headers: jsonHeaders(),
    method: 'PUT',
  });
}
