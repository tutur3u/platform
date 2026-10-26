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

const TIME_SCHEMA = z
  .string()
  .trim()
  .regex(/^\d{1,2}:\d{2}(?::\d{2})?$/u)
  .nullable()
  .optional();

/** Optional text that keeps `undefined` (field omitted) apart from `null`. */
function optionalNullableText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value || null));
}

export const TOPIC_ANNOUNCEMENT_COURSE_BOOK_MAX_LENGTH = 200;
export const TOPIC_ANNOUNCEMENT_VIDEO_URL_MAX_LENGTH = 2000;
export const TOPIC_ANNOUNCEMENT_VIDEO_URL_PATTERN = /^https:\/\/\S+$/u;

const VIDEO_URL_SCHEMA = optionalNullableText(
  TOPIC_ANNOUNCEMENT_VIDEO_URL_MAX_LENGTH
).refine(
  (value) => !value || TOPIC_ANNOUNCEMENT_VIDEO_URL_PATTERN.test(value),
  'Video link must be an https:// URL without spaces'
);

const TOPIC_ANNOUNCEMENT_ATTACHMENT_DRAFTS_SCHEMA = z
  .array(TopicAnnouncementAttachmentDraftSchema)
  .max(TOPIC_ANNOUNCEMENT_MAX_ATTACHMENTS);

/**
 * Shared field shape with no defaults so the update schema can tell an
 * omitted field from an explicit value (zod 4 applies defaults and transforms
 * inside `.partial()`).
 */
const topicAnnouncementFieldShape = {
  attachmentDrafts: TOPIC_ANNOUNCEMENT_ATTACHMENT_DRAFTS_SCHEMA,
  body: z.string().trim().max(20_000),
  classLabel: optionalNullableText(500),
  contactIds: z.array(z.string().uuid()).min(1).max(50),
  courseBook: optionalNullableText(TOPIC_ANNOUNCEMENT_COURSE_BOOK_MAX_LENGTH),
  dayLabel: optionalNullableText(500),
  endTime: TIME_SCHEMA,
  groupId: z.string().uuid().nullable().optional(),
  place: optionalNullableText(500),
  room: optionalNullableText(500),
  sessionDate: z.string().date().nullable().optional(),
  sourceType: z.string().trim().min(1).max(80),
  startTime: TIME_SCHEMA,
  status: TopicAnnouncementWritableStatusSchema.optional(),
  teacherWorkspaceUserId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(300),
  topic: z.string().trim().max(20_000),
  videoUrl: VIDEO_URL_SCHEMA,
};

function attachmentTotalWithinLimit(
  attachmentDrafts: { sizeBytes: number }[] | undefined
) {
  return (
    (attachmentDrafts ?? []).reduce(
      (total, attachment) => total + attachment.sizeBytes,
      0
    ) <= TOPIC_ANNOUNCEMENT_MAX_ATTACHMENT_BYTES
  );
}

const ATTACHMENT_TOTAL_ISSUE = {
  message: 'Attachments cannot exceed 10 MB total',
  path: ['attachmentDrafts'],
};

/**
 * A topic may be blank only while the announcement stays a draft (the
 * database enforces the same rule with topic_announcements_topic_ready_check).
 */
export function isTopicAnnouncementTopicReady({
  status,
  topic,
}: {
  status?: string | null;
  topic?: string | null;
}) {
  return status === 'draft' || Boolean(topic?.trim());
}

const TOPIC_REQUIRED_ISSUE = {
  message: 'Topic is required unless the announcement is saved as a draft',
  path: ['topic'],
};

export const TopicAnnouncementPayloadSchema = z
  .object({
    ...topicAnnouncementFieldShape,
    attachmentDrafts: TOPIC_ANNOUNCEMENT_ATTACHMENT_DRAFTS_SCHEMA.default([]),
    body: topicAnnouncementFieldShape.body.default(''),
    sourceType: topicAnnouncementFieldShape.sourceType.default('manual'),
    topic: topicAnnouncementFieldShape.topic.default(''),
  })
  .refine(
    (payload) => attachmentTotalWithinLimit(payload.attachmentDrafts),
    ATTACHMENT_TOTAL_ISSUE
  )
  .refine(
    (payload) =>
      isTopicAnnouncementTopicReady({
        status: payload.status ?? 'draft',
        topic: payload.topic,
      }),
    TOPIC_REQUIRED_ISSUE
  );

/** PATCH body: every field optional, omitted fields stay `undefined`. */
export const TopicAnnouncementUpdateSchema = z
  .object(topicAnnouncementFieldShape)
  .partial()
  .refine(
    (payload) => attachmentTotalWithinLimit(payload.attachmentDrafts),
    ATTACHMENT_TOTAL_ISSUE
  )
  .refine(
    (payload) =>
      payload.status === undefined ||
      payload.topic === undefined ||
      isTopicAnnouncementTopicReady(payload),
    TOPIC_REQUIRED_ISSUE
  );

export type TopicAnnouncementPayload = z.infer<
  typeof TopicAnnouncementPayloadSchema
>;
export type TopicAnnouncementUpdatePayload = z.infer<
  typeof TopicAnnouncementUpdateSchema
>;
