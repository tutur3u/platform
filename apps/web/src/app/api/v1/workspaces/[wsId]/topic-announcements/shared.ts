import { NextResponse } from 'next/server';
import { z } from 'zod';

export {
  buildTopicAnnouncementVerificationUrl,
  generateTopicAnnouncementVerificationToken as generateVerificationToken,
  getTopicAnnouncementVerificationOrigin,
  hashTopicAnnouncementVerificationToken as hashVerificationToken,
} from '@/lib/topic-announcements-verification';
export type {
  SerializedTopicAnnouncementAttachment,
  SerializedTopicAnnouncementContact,
  TopicAnnouncementAttachmentRow,
  TopicAnnouncementContactRow,
  TopicAnnouncementsAccessContext,
  TopicAnnouncementsSupabaseClient,
} from './server-helpers';
export {
  insertTopicAnnouncementAttachmentDrafts,
  mapTopicAnnouncementRow,
  resolveTopicAnnouncementsAccess,
  serializeTopicAnnouncementAttachment,
  serializeTopicAnnouncementContact,
  serializeTopicAnnouncementContacts,
} from './server-helpers';

import type { TopicAnnouncementsSupabaseClient } from './server-helpers';

const EMAIL_SCHEMA = z.string().trim().email().transform(normalizeEmail);
export const TOPIC_ANNOUNCEMENT_MAX_ATTACHMENTS = 5;
export const TOPIC_ANNOUNCEMENT_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const TOPIC_ANNOUNCEMENT_ATTACHMENT_CONTENT_TYPES = [
  'application/pdf',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export const TOPIC_ANNOUNCEMENT_ATTACHMENT_STORAGE_PROVIDERS = [
  'r2',
  'supabase',
] as const;

const OPTIONAL_TEXT_SCHEMA = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .optional()
  .transform((value) => value || null);

export const TopicAnnouncementStatusSchema = z.enum([
  'draft',
  'queued',
  'sent',
  'failed',
  'skipped',
  'cancelled',
]);

export const TopicAnnouncementListQuerySchema = z.object({
  contactId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).default(''),
  status: z
    .union([
      TopicAnnouncementStatusSchema,
      z.literal('active'),
      z.literal('all'),
    ])
    .default('active'),
});

export const TopicAnnouncementContactSchema = z.object({
  archived: z.boolean().optional(),
  email: EMAIL_SCHEMA,
  metadata: z.record(z.string(), z.unknown()).default({}),
  name: z.string().trim().min(1).max(200),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  workspaceUserId: z.string().uuid().nullable().optional(),
});

export const TopicAnnouncementAttachmentDraftSchema = z.object({
  contentType: z.enum(TOPIC_ANNOUNCEMENT_ATTACHMENT_CONTENT_TYPES),
  fileName: z.string().trim().min(1).max(255),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(TOPIC_ANNOUNCEMENT_MAX_ATTACHMENT_BYTES),
  storagePath: z
    .string()
    .trim()
    .min(1)
    .max(1024)
    .refine(
      (value) => !value.startsWith('/') && !/(^|\/)\.\.(\/|$)/u.test(value),
      'Invalid storage path'
    ),
  storageProvider: z.enum(TOPIC_ANNOUNCEMENT_ATTACHMENT_STORAGE_PROVIDERS),
});

export const TopicAnnouncementPayloadSchema = z
  .object({
    attachmentDrafts: z
      .array(TopicAnnouncementAttachmentDraftSchema)
      .max(TOPIC_ANNOUNCEMENT_MAX_ATTACHMENTS)
      .default([]),
    body: z.string().trim().max(20_000).default(''),
    classLabel: OPTIONAL_TEXT_SCHEMA,
    contactIds: z.array(z.string().uuid()).min(1).max(50),
    dayLabel: OPTIONAL_TEXT_SCHEMA,
    endTime: z
      .string()
      .trim()
      .regex(/^\d{1,2}:\d{2}(?::\d{2})?$/u)
      .nullable()
      .optional(),
    groupId: z.string().uuid().nullable().optional(),
    place: OPTIONAL_TEXT_SCHEMA,
    room: OPTIONAL_TEXT_SCHEMA,
    sessionDate: z.string().date().nullable().optional(),
    sourceType: z.string().trim().min(1).max(80).default('manual'),
    startTime: z
      .string()
      .trim()
      .regex(/^\d{1,2}:\d{2}(?::\d{2})?$/u)
      .nullable()
      .optional(),
    status: TopicAnnouncementStatusSchema.optional(),
    title: z.string().trim().min(1).max(300),
    topic: z.string().trim().min(1).max(20_000),
  })
  .refine(
    (payload) =>
      payload.attachmentDrafts.reduce(
        (total, attachment) => total + attachment.sizeBytes,
        0
      ) <= TOPIC_ANNOUNCEMENT_MAX_ATTACHMENT_BYTES,
    {
      message: 'Attachments cannot exceed 10 MB total',
      path: ['attachmentDrafts'],
    }
  );

export const TopicAnnouncementImportSchema = z.object({
  rows: z
    .array(
      z.object({
        classLabel: z.string().trim().optional(),
        contactEmail: EMAIL_SCHEMA.optional(),
        contactName: z.string().trim().optional(),
        dayLabel: z.string().trim().optional(),
        endTime: z.string().trim().optional(),
        place: z.string().trim().optional(),
        room: z.string().trim().optional(),
        sessionDate: z.string().date().optional(),
        startTime: z.string().trim().optional(),
        title: z.string().trim().optional(),
        topic: z.string().trim().optional(),
      })
    )
    .min(1)
    .max(500),
  sourceName: z.string().trim().max(200).optional(),
  sourceType: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .default('foreign_teacher_schedule'),
});

export const TopicAnnouncementSendSchema = z.object({
  resend: z.boolean().default(false),
});

export const TopicAnnouncementBulkSendSchema = z.object({
  announcementIds: z.array(z.string().uuid()).min(1).max(50),
  resend: z.boolean().default(false),
});

export const TopicAnnouncementScheduleSchema = z.object({
  scheduledSendAt: z.string().datetime(),
});

export const TopicAnnouncementTemplateSchema = z.object({
  classLabel: OPTIONAL_TEXT_SCHEMA,
  dayLabel: OPTIONAL_TEXT_SCHEMA,
  defaultContactIds: z.array(z.string().uuid()).max(50).default([]),
  endTime: z
    .string()
    .trim()
    .regex(/^\d{1,2}:\d{2}(?::\d{2})?$/u)
    .nullable()
    .optional(),
  groupId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(120),
  place: OPTIONAL_TEXT_SCHEMA,
  room: OPTIONAL_TEXT_SCHEMA,
  sessionDate: z.string().date().nullable().optional(),
  startTime: z
    .string()
    .trim()
    .regex(/^\d{1,2}:\d{2}(?::\d{2})?$/u)
    .nullable()
    .optional(),
  title: z.string().trim().min(1).max(300),
  topic: z.string().trim().max(20_000).default(''),
});

export function mapTopicAnnouncementTemplateRow(template: {
  group?: { id: string; name: string } | { id: string; name: string }[] | null;
  [key: string]: unknown;
}) {
  const { group: rawGroup, default_contact_ids, ...rest } = template;
  const group = Array.isArray(rawGroup) ? (rawGroup[0] ?? null) : rawGroup;

  return {
    ...rest,
    default_contact_ids: default_contact_ids ?? [],
    group:
      group && typeof group === 'object' && 'id' in group
        ? { id: group.id, name: group.name }
        : null,
  };
}

export async function getWorkspaceSchedulingTimezone(
  sbAdmin: TopicAnnouncementsSupabaseClient,
  normalizedWsId: string
) {
  const { data, error } = await sbAdmin
    .from('workspaces')
    .select('timezone')
    .eq('id', normalizedWsId)
    .maybeSingle();
  if (error) throw error;
  const timezone = data?.timezone?.trim();
  if (!timezone || timezone === 'auto') {
    return null;
  }
  return timezone;
}

export async function validateTopicAnnouncementTemplateContactIds({
  contactIds,
  normalizedWsId,
  sbAdmin,
}: {
  contactIds: string[];
  normalizedWsId: string;
  sbAdmin: TopicAnnouncementsSupabaseClient;
}) {
  const uniqueIds = [...new Set(contactIds)];
  if (uniqueIds.length === 0) return null;

  const { data, error } = await sbAdmin
    .from('topic_announcement_contacts')
    .select('id')
    .eq('ws_id', normalizedWsId)
    .eq('archived', false)
    .in('id', uniqueIds);
  if (error) throw error;
  if ((data ?? []).length !== uniqueIds.length) {
    return NextResponse.json(
      { message: 'One or more template contacts are invalid' },
      { status: 400 }
    );
  }
  return null;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function validateTopicAnnouncementGroupId({
  groupId,
  normalizedWsId,
  sbAdmin,
}: {
  groupId: string | null | undefined;
  normalizedWsId: string;
  sbAdmin: TopicAnnouncementsSupabaseClient;
}) {
  if (!groupId) return null;

  const { data, error } = await sbAdmin
    .from('workspace_user_groups')
    .select('id')
    .eq('ws_id', normalizedWsId)
    .eq('id', groupId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return NextResponse.json(
      { message: 'Invalid user group' },
      { status: 400 }
    );
  }

  return null;
}

export async function validateTopicAnnouncementWorkspaceUserId({
  normalizedWsId,
  sbAdmin,
  workspaceUserId,
}: {
  normalizedWsId: string;
  sbAdmin: TopicAnnouncementsSupabaseClient;
  workspaceUserId: string | null | undefined;
}) {
  if (!workspaceUserId) return null;

  const { data, error } = await sbAdmin
    .from('workspace_users')
    .select('id')
    .eq('ws_id', normalizedWsId)
    .eq('id', workspaceUserId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return NextResponse.json(
      { message: 'Invalid workspace user' },
      { status: 400 }
    );
  }

  return null;
}
