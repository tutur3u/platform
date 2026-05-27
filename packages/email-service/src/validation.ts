/**
 * Email Service Validation
 *
 * Zod schemas for type-safe email validation with helpful error messages.
 */

import { z } from 'zod';

import { MAX_RECIPIENTS_PER_EMAIL, MAX_SUBJECT_LENGTH } from './constants';

export const MAX_EMAIL_ATTACHMENTS = 5;
export const MAX_EMAIL_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const EMAIL_ATTACHMENT_CONTENT_TYPES = [
  'application/pdf',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

// =============================================================================
// Email Address Validation
// =============================================================================

/**
 * RFC 5322 compliant email regex (simplified but robust).
 */
const EMAIL_PATTERN =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Email address schema with validation.
 */
export const emailAddressSchema = z
  .string()
  .min(1, 'Email address cannot be empty')
  .max(254, 'Email address too long')
  .regex(EMAIL_PATTERN, 'Invalid email address format')
  .transform((email) => email.toLowerCase().trim());

/**
 * Array of email addresses with deduplication.
 */
export const emailArraySchema = z
  .array(emailAddressSchema)
  .max(
    MAX_RECIPIENTS_PER_EMAIL,
    `Maximum ${MAX_RECIPIENTS_PER_EMAIL} recipients allowed`
  )
  .transform((emails) => [...new Set(emails)]); // Dedupe

/**
 * Array of email addresses with at least one required.
 */
const emailArrayRequiredSchema = z
  .array(emailAddressSchema)
  .min(1, 'At least one recipient required in "to" field')
  .max(
    MAX_RECIPIENTS_PER_EMAIL,
    `Maximum ${MAX_RECIPIENTS_PER_EMAIL} recipients allowed`
  )
  .transform((emails) => [...new Set(emails)]); // Dedupe

// =============================================================================
// Email Recipients Schema
// =============================================================================

export const emailRecipientsSchema = z
  .object({
    to: emailArrayRequiredSchema,
    cc: emailArraySchema.optional(),
    bcc: emailArraySchema.optional(),
  })
  .refine(
    (data) => {
      const total =
        data.to.length + (data.cc?.length || 0) + (data.bcc?.length || 0);
      return total <= MAX_RECIPIENTS_PER_EMAIL;
    },
    {
      message: `Total recipients cannot exceed ${MAX_RECIPIENTS_PER_EMAIL}`,
    }
  );

// =============================================================================
// Email Content Schema
// =============================================================================

export const emailAttachmentSchema = z.object({
  filename: z
    .string()
    .min(1, 'Attachment filename cannot be empty')
    .max(255, 'Attachment filename too long')
    .transform((filename) => filename.trim()),
  contentType: z.enum(EMAIL_ATTACHMENT_CONTENT_TYPES),
  data: z.instanceof(Uint8Array),
});

export const emailContentSchema = z
  .object({
    subject: z
      .string()
      .min(1, 'Subject cannot be empty')
      .max(
        MAX_SUBJECT_LENGTH,
        `Subject cannot exceed ${MAX_SUBJECT_LENGTH} characters`
      )
      .transform((s) => s.trim()),
    html: z
      .string()
      .min(1, 'HTML content cannot be empty')
      .max(10 * 1024 * 1024, 'HTML content too large (max 10MB)'),
    text: z
      .string()
      .max(10 * 1024 * 1024, 'Text content too large (max 10MB)')
      .optional(),
    replyTo: emailArraySchema.optional(),
    headers: z
      .record(
        z.string().regex(/^[A-Za-z0-9-]+$/, 'Invalid email header name'),
        z
          .string()
          .max(4096, 'Email header value too long')
          .refine((value) => !/[\r\n]/u.test(value), {
            message: 'Email header values cannot contain newlines',
          })
      )
      .optional(),
    attachments: z
      .array(emailAttachmentSchema)
      .max(
        MAX_EMAIL_ATTACHMENTS,
        `Maximum ${MAX_EMAIL_ATTACHMENTS} attachments allowed`
      )
      .optional(),
  })
  .refine(
    (content) =>
      (content.attachments ?? []).reduce(
        (total, attachment) => total + attachment.data.byteLength,
        0
      ) <= MAX_EMAIL_ATTACHMENT_BYTES,
    {
      message: 'Attachments cannot exceed 10 MB total',
      path: ['attachments'],
    }
  );

// =============================================================================
// Email Source Schema
// =============================================================================

export const emailSourceSchema = z.object({
  name: z
    .string()
    .min(1, 'Source name cannot be empty')
    .max(128, 'Source name too long')
    .transform((s) => s.trim()),
  email: emailAddressSchema,
});

// =============================================================================
// Email Metadata Schema
// =============================================================================

export const emailMetadataSchema = z.object({
  wsId: z.guid('Invalid workspace ID'),
  userId: z.guid('Invalid user ID').optional(),
  templateType: z.string().max(64).optional(),
  entityType: z.string().max(64).optional(),
  entityId: z.guid('Invalid entity ID').optional(),
  ipAddress: z.string().max(45).optional(), // IPv6 max length
  userAgent: z.string().max(512).optional(),
  priority: z.enum(['high', 'normal', 'low']).optional(),
  isInvite: z.boolean().optional(),
  attachments: z
    .array(
      z.object({
        contentType: z.enum(EMAIL_ATTACHMENT_CONTENT_TYPES),
        fileName: z.string().min(1).max(255),
        sizeBytes: z.number().int().positive().max(MAX_EMAIL_ATTACHMENT_BYTES),
      })
    )
    .max(MAX_EMAIL_ATTACHMENTS)
    .optional(),
});

// =============================================================================
// Full Send Email Params Schema
// =============================================================================

export const sendEmailParamsSchema = z.object({
  recipients: emailRecipientsSchema,
  content: emailContentSchema,
  metadata: emailMetadataSchema,
  source: emailSourceSchema.optional(),
});

// =============================================================================
// Type Exports (inferred from schemas)
// =============================================================================

export type ValidatedEmailRecipients = z.infer<typeof emailRecipientsSchema>;
export type ValidatedEmailContent = z.infer<typeof emailContentSchema>;
export type ValidatedEmailSource = z.infer<typeof emailSourceSchema>;
export type ValidatedEmailMetadata = z.infer<typeof emailMetadataSchema>;
export type ValidatedSendEmailParams = z.infer<typeof sendEmailParamsSchema>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate email parameters and return sanitized data.
 * Throws ZodError if validation fails.
 */
export function validateEmailParams(params: unknown): ValidatedSendEmailParams {
  return sendEmailParamsSchema.parse(params);
}

/**
 * Safely validate email parameters without throwing.
 * Returns result object with success flag and data/error.
 */
export function safeValidateEmailParams(
  params: unknown
): ReturnType<typeof sendEmailParamsSchema.safeParse> {
  return sendEmailParamsSchema.safeParse(params);
}

/**
 * Validate a single email address.
 */
export function isValidEmail(email: string): boolean {
  return emailAddressSchema.safeParse(email).success;
}

/**
 * Validate and normalize an email address.
 * Returns null if invalid.
 */
export function normalizeEmail(email: string): string | null {
  const result = emailAddressSchema.safeParse(email);
  return result.success ? result.data : null;
}

/**
 * Validate and deduplicate an array of emails.
 * Returns only valid, unique emails.
 */
export function normalizeEmailArray(emails: string[]): string[] {
  const valid: string[] = [];
  const seen = new Set<string>();

  for (const email of emails) {
    const normalized = normalizeEmail(email);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      valid.push(normalized);
    }
  }

  return valid;
}

// =============================================================================
// Error Formatting
// =============================================================================

/**
 * Format Zod validation errors into user-friendly messages.
 */
export function formatValidationErrors(error: z.ZodError): string[] {
  return error.issues.map((e) => {
    const path = e.path.join('.');
    return path ? `${path}: ${e.message}` : e.message;
  });
}
