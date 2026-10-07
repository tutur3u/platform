import { z } from 'zod';

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
export const TOPIC_ANNOUNCEMENT_ATTACHMENT_UPLOAD_PREFIX = `${TOPIC_ANNOUNCEMENT_ATTACHMENT_UPLOAD_PATH}/`;

export const OPTIONAL_TEXT_SCHEMA = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .optional()
  .transform((value) => value || null);

export const TopicAnnouncementStatusSchema = z.enum([
  'draft',
  'queued',
  'processing',
  'sent',
  'failed',
  'skipped',
  'cancelled',
]);

const TopicAnnouncementWritableStatusSchema = z.enum([
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
    status: TopicAnnouncementWritableStatusSchema.optional(),
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
