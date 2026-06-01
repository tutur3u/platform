import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  downloadWorkspaceStorageObjectForProvider,
  getWorkspaceStorageObjectMetadataForProvider,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';
import type { TopicAnnouncementsSupabaseClient } from './server-helpers';
import { getPublicSchemaClient } from './server-helpers';

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
  attachTopicAnnouncementGroups,
  getPrivateSchemaClient,
  getPublicSchemaClient,
  insertTopicAnnouncementAttachmentDrafts,
  mapTopicAnnouncementRow,
  resolveTopicAnnouncementsAccess,
  serializeTopicAnnouncementAttachment,
  serializeTopicAnnouncementContact,
  serializeTopicAnnouncementContacts,
} from './server-helpers';

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
export const TOPIC_ANNOUNCEMENT_ATTACHMENT_UPLOAD_PATH =
  'topic-announcements/attachments';
const TOPIC_ANNOUNCEMENT_ATTACHMENT_UPLOAD_PREFIX = `${TOPIC_ANNOUNCEMENT_ATTACHMENT_UPLOAD_PATH}/`;

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

type TopicAnnouncementAttachmentDraft = z.infer<
  typeof TopicAnnouncementAttachmentDraftSchema
>;

export type TopicAnnouncementAttachmentValidationResult =
  | { ok: true }
  | { ok: false; message: string; status: number };

function normalizeAttachmentContentType(contentType?: string | null) {
  return contentType?.split(';', 1)[0]?.trim().toLowerCase() || null;
}

function matchesTopicAnnouncementAttachmentSignature(
  contentType: (typeof TOPIC_ANNOUNCEMENT_ATTACHMENT_CONTENT_TYPES)[number],
  buffer: Uint8Array
) {
  if (contentType === 'application/pdf') {
    return (
      buffer.length >= 5 &&
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46 &&
      buffer[4] === 0x2d
    );
  }

  if (contentType === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return (
      buffer.length >= signature.length &&
      signature.every((byte, index) => buffer[index] === byte)
    );
  }

  if (contentType === 'image/gif') {
    return (
      buffer.length >= 6 &&
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38 &&
      (buffer[4] === 0x37 || buffer[4] === 0x39) &&
      buffer[5] === 0x61
    );
  }

  if (contentType === 'image/jpeg') {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }

  if (contentType === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    );
  }

  return false;
}

function attachmentValidationError(
  message: string,
  status: number
): TopicAnnouncementAttachmentValidationResult {
  return { ok: false, message, status };
}

export function topicAnnouncementAttachmentValidationResponse(
  result: Exclude<TopicAnnouncementAttachmentValidationResult, { ok: true }>
) {
  return NextResponse.json(
    { message: result.message },
    { status: result.status }
  );
}

export async function validateTopicAnnouncementAttachmentDraftObjects({
  attachmentDrafts,
  normalizedWsId,
}: {
  attachmentDrafts: TopicAnnouncementAttachmentDraft[];
  normalizedWsId: string;
}): Promise<TopicAnnouncementAttachmentValidationResult> {
  if (attachmentDrafts.length === 0) {
    return { ok: true };
  }

  const seenStoragePaths = new Set<string>();
  let totalActualSize = 0;

  for (const attachment of attachmentDrafts) {
    if (
      !attachment.storagePath.startsWith(
        TOPIC_ANNOUNCEMENT_ATTACHMENT_UPLOAD_PREFIX
      ) ||
      attachment.storagePath.length <=
        TOPIC_ANNOUNCEMENT_ATTACHMENT_UPLOAD_PREFIX.length
    ) {
      return attachmentValidationError(
        'Invalid Topic Announcement attachment path',
        400
      );
    }

    const storageKey = `${attachment.storageProvider}:${attachment.storagePath}`;
    if (seenStoragePaths.has(storageKey)) {
      return attachmentValidationError(
        'Duplicate Topic Announcement attachment path',
        400
      );
    }
    seenStoragePaths.add(storageKey);

    let metadata: Awaited<
      ReturnType<typeof getWorkspaceStorageObjectMetadataForProvider>
    >;
    try {
      metadata = await getWorkspaceStorageObjectMetadataForProvider(
        normalizedWsId,
        attachment.storageProvider,
        attachment.storagePath
      );
    } catch (error) {
      if (error instanceof WorkspaceStorageError) {
        return attachmentValidationError(
          error.status === 404
            ? 'Topic Announcement attachment file was not found'
            : 'Failed to validate Topic Announcement attachment upload',
          error.status === 404 ? 400 : error.status
        );
      }

      throw error;
    }

    if (!Number.isSafeInteger(metadata.size) || metadata.size <= 0) {
      return attachmentValidationError('File is empty', 400);
    }

    if (metadata.size > TOPIC_ANNOUNCEMENT_MAX_ATTACHMENT_BYTES) {
      return attachmentValidationError('Attachment exceeds 10 MB limit', 413);
    }

    totalActualSize += metadata.size;
    if (totalActualSize > TOPIC_ANNOUNCEMENT_MAX_ATTACHMENT_BYTES) {
      return attachmentValidationError(
        'Attachments cannot exceed 10 MB total',
        413
      );
    }

    if (metadata.size !== attachment.sizeBytes) {
      return attachmentValidationError(
        'Topic Announcement attachment metadata does not match the uploaded file',
        400
      );
    }

    const actualContentType = normalizeAttachmentContentType(
      metadata.contentType
    );
    if (
      actualContentType !== attachment.contentType ||
      !TOPIC_ANNOUNCEMENT_ATTACHMENT_CONTENT_TYPES.includes(
        actualContentType as (typeof TOPIC_ANNOUNCEMENT_ATTACHMENT_CONTENT_TYPES)[number]
      )
    ) {
      return attachmentValidationError(
        'Topic Announcement attachment content type does not match the uploaded file',
        415
      );
    }

    const downloaded = await downloadWorkspaceStorageObjectForProvider(
      normalizedWsId,
      attachment.storageProvider,
      attachment.storagePath
    );
    if (downloaded.buffer.byteLength !== attachment.sizeBytes) {
      return attachmentValidationError(
        'Topic Announcement attachment metadata does not match the uploaded file',
        400
      );
    }

    if (
      !matchesTopicAnnouncementAttachmentSignature(
        attachment.contentType,
        downloaded.buffer
      )
    ) {
      return attachmentValidationError(
        'Topic Announcement attachment content does not match the declared type',
        415
      );
    }
  }

  return { ok: true };
}

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
  const publicAdmin = getPublicSchemaClient(sbAdmin);
  const { data, error } = await publicAdmin
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

  const publicAdmin = getPublicSchemaClient(sbAdmin);
  const { data, error } = await publicAdmin
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

  const publicAdmin = getPublicSchemaClient(sbAdmin);
  const { data, error } = await publicAdmin
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
