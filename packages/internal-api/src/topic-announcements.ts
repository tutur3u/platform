import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  type InternalApiQuery,
} from './client';

export type TopicAnnouncementVerificationStatus =
  | 'linked_confirmed_account'
  | 'needs_verification'
  | 'pending'
  | 'verified';

export type TopicAnnouncementStatus =
  | 'cancelled'
  | 'draft'
  | 'failed'
  | 'queued'
  | 'sent'
  | 'skipped';

export type TopicAnnouncementAttachmentContentType =
  | 'application/pdf'
  | 'image/gif'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp';

export type TopicAnnouncementAttachmentStorageProvider = 'r2' | 'supabase';

export interface TopicAnnouncementAttachmentDraft {
  contentType: TopicAnnouncementAttachmentContentType;
  fileName: string;
  sizeBytes: number;
  storagePath: string;
  storageProvider: TopicAnnouncementAttachmentStorageProvider;
}

export interface TopicAnnouncementAttachment
  extends TopicAnnouncementAttachmentDraft {
  createdAt: string;
  id: string;
}

export interface TopicAnnouncementContact {
  archived: boolean;
  createdAt: string;
  email: string;
  id: string;
  metadata: unknown;
  name: string;
  tags: string[];
  verificationStatus: TopicAnnouncementVerificationStatus;
  workspaceUserId: string | null;
}

export interface TopicAnnouncementGroupSummary {
  id: string;
  name: string;
}

export interface TopicAnnouncementRecord {
  attachments: TopicAnnouncementAttachment[];
  batch_id: string | null;
  body: string;
  class_label: string | null;
  contacts: TopicAnnouncementContact[];
  created_at: string;
  day_label: string | null;
  end_time: string | null;
  group: TopicAnnouncementGroupSummary | null;
  group_id: string | null;
  id: string;
  last_error: string | null;
  place: string | null;
  room: string | null;
  scheduled_send_at: string | null;
  sent_email_audit_id: string | null;
  sent_at: string | null;
  session_date: string | null;
  source_type: string;
  start_time: string | null;
  status: TopicAnnouncementStatus;
  title: string;
  topic: string;
}

export interface TopicAnnouncementTemplateRecord {
  class_label: string | null;
  created_at: string;
  day_label: string | null;
  default_contact_ids: string[];
  end_time: string | null;
  group: TopicAnnouncementGroupSummary | null;
  group_id: string | null;
  id: string;
  name: string;
  place: string | null;
  room: string | null;
  session_date: string | null;
  start_time: string | null;
  title: string;
  topic: string;
  updated_at: string;
}

export interface TopicAnnouncementTemplatePayload {
  classLabel?: string | null;
  dayLabel?: string | null;
  defaultContactIds?: string[];
  endTime?: string | null;
  groupId?: string | null;
  name: string;
  place?: string | null;
  room?: string | null;
  sessionDate?: string | null;
  startTime?: string | null;
  title: string;
  topic?: string;
}

export interface TopicAnnouncementPayload {
  attachmentDrafts?: TopicAnnouncementAttachmentDraft[];
  body?: string;
  classLabel?: string | null;
  contactIds: string[];
  dayLabel?: string | null;
  endTime?: string | null;
  groupId?: string | null;
  place?: string | null;
  room?: string | null;
  sessionDate?: string | null;
  sourceType?: string;
  startTime?: string | null;
  status?: TopicAnnouncementStatus;
  title: string;
  topic: string;
}

export interface TopicAnnouncementContactPayload {
  archived?: boolean;
  email: string;
  metadata?: Record<string, unknown>;
  name: string;
  tags?: string[];
  workspaceUserId?: string | null;
}

export interface TopicAnnouncementImportRow {
  classLabel?: string;
  contactEmail?: string;
  contactName?: string;
  dayLabel?: string;
  endTime?: string;
  place?: string;
  room?: string;
  sessionDate?: string;
  startTime?: string;
  title?: string;
  topic?: string;
}

export interface TopicAnnouncementImportPayload {
  rows: TopicAnnouncementImportRow[];
  sourceName?: string;
  sourceType?: string;
}

function basePath(workspaceId: string) {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/topic-announcements`;
}

export async function listTopicAnnouncementContacts(
  workspaceId: string,
  params: InternalApiQuery = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ data: TopicAnnouncementContact[] }>(
    `${basePath(workspaceId)}/contacts`,
    { cache: 'no-store', query: params }
  );
}

export async function createTopicAnnouncementContact(
  workspaceId: string,
  payload: TopicAnnouncementContactPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ data: TopicAnnouncementContact }>(
    `${basePath(workspaceId)}/contacts`,
    {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export async function updateTopicAnnouncementContact(
  workspaceId: string,
  contactId: string,
  payload: Partial<TopicAnnouncementContactPayload>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ data: TopicAnnouncementContact }>(
    `${basePath(workspaceId)}/contacts/${encodePathSegment(contactId)}`,
    {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }
  );
}

export async function deleteTopicAnnouncementContact(
  workspaceId: string,
  contactId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<void>(
    `${basePath(workspaceId)}/contacts/${encodePathSegment(contactId)}`,
    { method: 'DELETE' }
  );
}

export async function requestTopicAnnouncementContactVerification(
  workspaceId: string,
  contactId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ alreadyPending?: boolean; expiresAt: string }>(
    `${basePath(workspaceId)}/contacts/${encodePathSegment(contactId)}/verify`,
    { method: 'POST' }
  );
}

export async function listTopicAnnouncements(
  workspaceId: string,
  params: InternalApiQuery = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    count: number;
    data: TopicAnnouncementRecord[];
    page: number;
    pageSize: number;
    totalPages: number;
  }>(basePath(workspaceId), { cache: 'no-store', query: params });
}

export async function createTopicAnnouncement(
  workspaceId: string,
  payload: TopicAnnouncementPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ data: TopicAnnouncementRecord }>(basePath(workspaceId), {
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}

export async function updateTopicAnnouncement(
  workspaceId: string,
  announcementId: string,
  payload: Partial<TopicAnnouncementPayload>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ data: TopicAnnouncementRecord }>(
    `${basePath(workspaceId)}/announcements/${encodePathSegment(announcementId)}`,
    {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }
  );
}

export async function deleteTopicAnnouncement(
  workspaceId: string,
  announcementId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<void>(
    `${basePath(workspaceId)}/announcements/${encodePathSegment(announcementId)}`,
    { method: 'DELETE' }
  );
}

export async function uploadTopicAnnouncementAttachment(
  workspaceId: string,
  file: File,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const formData = new FormData();
  formData.append('file', file);

  return client.json<{ data: TopicAnnouncementAttachmentDraft }>(
    `${basePath(workspaceId)}/attachments/upload`,
    {
      body: formData,
      method: 'POST',
    }
  );
}

export async function deleteTopicAnnouncementAttachment(
  workspaceId: string,
  announcementId: string,
  attachmentId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<void>(
    `${basePath(workspaceId)}/announcements/${encodePathSegment(
      announcementId
    )}/attachments/${encodePathSegment(attachmentId)}`,
    { method: 'DELETE' }
  );
}

export async function importTopicAnnouncements(
  workspaceId: string,
  payload: TopicAnnouncementImportPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    batchId?: string;
    createdAnnouncements: number;
    createdContacts: number;
    rowErrors: { message: string; rowNumber: number }[];
  }>(`${basePath(workspaceId)}/import`, {
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}

export async function sendTopicAnnouncement(
  workspaceId: string,
  announcementId: string,
  payload: { resend?: boolean } = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ auditId: string | null; messageId: string | null }>(
    `${basePath(workspaceId)}/announcements/${encodePathSegment(announcementId)}/send`,
    {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export async function listTopicAnnouncementTemplates(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ data: TopicAnnouncementTemplateRecord[] }>(
    `${basePath(workspaceId)}/templates`,
    { cache: 'no-store' }
  );
}

export async function createTopicAnnouncementTemplate(
  workspaceId: string,
  payload: TopicAnnouncementTemplatePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ data: TopicAnnouncementTemplateRecord }>(
    `${basePath(workspaceId)}/templates`,
    {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export async function updateTopicAnnouncementTemplate(
  workspaceId: string,
  templateId: string,
  payload: Partial<TopicAnnouncementTemplatePayload>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ data: TopicAnnouncementTemplateRecord }>(
    `${basePath(workspaceId)}/templates/${encodePathSegment(templateId)}`,
    {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }
  );
}

export async function deleteTopicAnnouncementTemplate(
  workspaceId: string,
  templateId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<void>(
    `${basePath(workspaceId)}/templates/${encodePathSegment(templateId)}`,
    { method: 'DELETE' }
  );
}

export async function scheduleTopicAnnouncement(
  workspaceId: string,
  announcementId: string,
  payload: { scheduledSendAt: string },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    data: {
      id: string;
      scheduledSendAt: string;
      status: TopicAnnouncementStatus;
    };
    timezone: string;
  }>(
    `${basePath(workspaceId)}/announcements/${encodePathSegment(announcementId)}/schedule`,
    {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export async function cancelTopicAnnouncementSchedule(
  workspaceId: string,
  announcementId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ data: { id: string; status: TopicAnnouncementStatus } }>(
    `${basePath(workspaceId)}/announcements/${encodePathSegment(announcementId)}/cancel-schedule`,
    { method: 'POST' }
  );
}

export async function sendTopicAnnouncementsBulk(
  workspaceId: string,
  payload: { announcementIds: string[]; resend?: boolean },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    results: Array<{
      announcementId: string;
      auditId?: string | null;
      error?: string;
      messageId?: string | null;
      status?: number;
    }>;
  }>(`${basePath(workspaceId)}/send-bulk`, {
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}
