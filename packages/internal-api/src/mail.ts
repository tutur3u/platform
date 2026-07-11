import type { InternalEmail } from '@tuturuuu/types';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  type InternalApiQueryValue,
  withMailApiBaseUrl,
} from './client';
import type {
  BulkUpdateMailPayload,
  BulkUpdateMailThreadsPayload,
  CreateMailDraftPayload,
  CreateMailOrganizationPayload,
  GenerateMailAiDraftPayload,
  GenerateMailAiDraftResponse,
  ListMailMessagesParams,
  ListMailThreadsParams,
  MailAttachment,
  MailBootstrapResponse,
  MailCatchAllConfiguration,
  MailDomain,
  MailFolderDefinition,
  MailLabel,
  MailMailboxMember,
  MailMailboxSettings,
  MailMessageDetail,
  MailMessagesResponse,
  MailMutationResponse,
  MailThreadDetail,
  MailThreadsResponse,
  SendMailMessagePayload,
  SuggestMailLabelsPayload,
  SuggestMailLabelsResponse,
  UpdateMailCatchAllPayload,
  UpdateMailDraftPayload,
  UpdateMailMailboxSettingsPayload,
  UpdateMailMessageStatePayload,
  UpdateMailOrganizationPayload,
  UpsertMailDomainPayload,
  UpsertMailMailboxMemberPayload,
} from './mail-types';

export * from './mail-types';

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

export async function listMailThreads(
  workspaceId: string,
  mailboxId: string,
  params?: ListMailThreadsParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<MailThreadsResponse>(
    mailboxPath(workspaceId, mailboxId, '/threads'),
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

export async function bulkUpdateMailThreads(
  workspaceId: string,
  mailboxId: string,
  payload: BulkUpdateMailThreadsPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<{ updated: number }>(
    mailboxPath(workspaceId, mailboxId, '/threads/bulk'),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'include',
      headers: jsonHeaders(),
      method: 'POST',
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

export async function generateMailAiDraft(
  workspaceId: string,
  mailboxId: string,
  payload: GenerateMailAiDraftPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<GenerateMailAiDraftResponse>(
    mailboxPath(workspaceId, mailboxId, '/ai/draft'),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'include',
      headers: jsonHeaders(),
      method: 'POST',
    }
  );
}

export async function suggestMailLabels(
  workspaceId: string,
  mailboxId: string,
  payload: SuggestMailLabelsPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<SuggestMailLabelsResponse>(
    mailboxPath(workspaceId, mailboxId, '/ai/labels'),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'include',
      headers: jsonHeaders(),
      method: 'POST',
    }
  );
}

export async function uploadMailDraftAttachment(
  workspaceId: string,
  mailboxId: string,
  draftId: string,
  file: Blob,
  filename: string,
  metadata?: {
    contentId?: string | null;
    disposition?: 'attachment' | 'inline';
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  const body = new FormData();
  body.append('file', file, filename);
  if (metadata?.contentId) body.append('contentId', metadata.contentId);
  if (metadata?.disposition) body.append('disposition', metadata.disposition);
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

export async function copyMailDraftAttachments(
  workspaceId: string,
  mailboxId: string,
  draftId: string,
  payload: { attachmentIds: string[]; sourceMessageId: string },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<{ attachments: MailAttachment[] }>(
    mailboxPath(
      workspaceId,
      mailboxId,
      `/drafts/${encodePathSegment(draftId)}/attachments`
    ),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'include',
      headers: jsonHeaders(),
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

export async function getMailMailboxSettings(
  workspaceId: string,
  mailboxId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<{ settings: MailMailboxSettings }>(
    mailboxPath(workspaceId, mailboxId, '/settings'),
    { cache: 'no-store', credentials: 'include' }
  );
}

export async function updateMailMailboxSettings(
  workspaceId: string,
  mailboxId: string,
  payload: UpdateMailMailboxSettingsPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<{ settings: MailMailboxSettings }>(
    mailboxPath(workspaceId, mailboxId, '/settings'),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'include',
      headers: jsonHeaders(),
      method: 'PATCH',
    }
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

export async function getMailCatchAllConfiguration(
  domainId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<MailCatchAllConfiguration>(
    mailPlatformPath(`/domains/${encodePathSegment(domainId)}/catch-all`),
    { cache: 'no-store', credentials: 'include' }
  );
}

export async function updateMailCatchAllConfiguration(
  domainId: string,
  payload: UpdateMailCatchAllPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withMailApiBaseUrl(options));
  return client.json<MailCatchAllConfiguration>(
    mailPlatformPath(`/domains/${encodePathSegment(domainId)}/catch-all`),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'include',
      headers: jsonHeaders(),
      method: 'PATCH',
    }
  );
}
