import type { InternalEmail } from '@tuturuuu/types';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  type InternalApiQueryValue,
} from './client';

export type MailMailboxRole = 'admin' | 'owner' | 'sender' | 'viewer';
export type MailMailboxType = 'personal' | 'shared';
export type MailMailboxStatus =
  | 'active'
  | 'archived'
  | 'disabled'
  | 'quarantined';

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
  const client = getInternalApiClient(options);
  const payload = await client.json<{ emails: InternalEmail[] }>(
    workspaceMailPath(workspaceId),
    {
      query,
      cache: 'no-store',
    }
  );

  return payload.emails ?? [];
}

export async function getMailBootstrap(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<MailBootstrapResponse>(
    workspaceMailPath(workspaceId, '/bootstrap'),
    {
      cache: 'no-store',
    }
  );
}

export async function listMailMessages(
  workspaceId: string,
  mailboxId: string,
  params?: ListMailMessagesParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<MailMessagesResponse>(
    mailboxPath(workspaceId, mailboxId, '/messages'),
    {
      cache: 'no-store',
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
  const client = getInternalApiClient(options);
  return client.json<MailMessageDetail>(
    mailboxPath(
      workspaceId,
      mailboxId,
      `/messages/${encodePathSegment(messageId)}`
    ),
    {
      cache: 'no-store',
    }
  );
}

export async function createMailDraft(
  workspaceId: string,
  mailboxId: string,
  payload: CreateMailDraftPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<MailMutationResponse>(
    mailboxPath(workspaceId, mailboxId, '/drafts'),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
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
  const client = getInternalApiClient(options);
  return client.json<MailMutationResponse>(
    mailboxPath(
      workspaceId,
      mailboxId,
      `/drafts/${encodePathSegment(draftId)}`
    ),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
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
  const client = getInternalApiClient(options);
  return client.json<void>(
    mailboxPath(
      workspaceId,
      mailboxId,
      `/drafts/${encodePathSegment(draftId)}`
    ),
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}

export async function sendMailMessage(
  workspaceId: string,
  mailboxId: string,
  payload: SendMailMessagePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<MailMutationResponse>(
    mailboxPath(workspaceId, mailboxId, '/messages'),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
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
  const client = getInternalApiClient(options);
  return client.json<MailMutationResponse>(
    mailboxPath(
      workspaceId,
      mailboxId,
      `/messages/${encodePathSegment(messageId)}/state`
    ),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: jsonHeaders(),
      method: 'PATCH',
    }
  );
}

export async function listMailMailboxMembers(
  workspaceId: string,
  mailboxId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ members: MailMailboxMember[] }>(
    mailboxPath(workspaceId, mailboxId, '/members'),
    {
      cache: 'no-store',
    }
  );
}

export async function upsertMailMailboxMember(
  workspaceId: string,
  mailboxId: string,
  payload: UpsertMailMailboxMemberPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ member: MailMailboxMember }>(
    mailboxPath(workspaceId, mailboxId, '/members'),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
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
  const client = getInternalApiClient(options);
  return client.json<void>(
    mailboxPath(
      workspaceId,
      mailboxId,
      `/members/${encodePathSegment(userId)}`
    ),
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}
