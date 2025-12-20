/**
 * @tuturuuu/email-service
 *
 * Centralized email service with rate limiting, spam protection, and audit logging.
 *
 * ## Quick Start
 *
 * @example
 * ```typescript
 * // 1. Simple email with convenience function
 * import { sendWorkspaceEmail } from '@tuturuuu/email-service';
 *
 * const result = await sendWorkspaceEmail(wsId, {
 *   recipients: { to: ['user@example.com'] },
 *   content: { subject: 'Hello', html: '<p>World</p>' },
 * });
 * ```
 *
 * @example
 * ```typescript
 * // 2. Fluent builder API (recommended for complex emails)
 * import { email } from '@tuturuuu/email-service';
 *
 * const result = await email()
 *   .to('user@example.com')
 *   .cc(['manager@example.com'])
 *   .subject('Meeting Notes')
 *   .html(renderTemplate('meeting-notes', data))
 *   .template('meeting-notes')
 *   .entity('meeting', meetingId)
 *   .priority('high')
 *   .send(wsId);
 * ```
 *
 * @example
 * ```typescript
 * // 3. Batch sending for bulk emails
 * import { createBatch, sendToMany } from '@tuturuuu/email-service';
 *
 * // Option A: Using batch builder
 * const batch = createBatch(wsId, { concurrency: 10 });
 * users.forEach(user => batch.add({
 *   to: user.email,
 *   subject: 'Newsletter',
 *   html: renderNewsletter(user),
 * }));
 * const results = await batch.send();
 *
 * // Option B: Same content to many recipients
 * const results = await sendToMany(wsId, userEmails, {
 *   subject: 'Announcement',
 *   html: announcementHtml,
 * });
 * ```
 *
 * @example
 * ```typescript
 * // 4. System emails (bypass rate limiting)
 * import { sendSystemEmail } from '@tuturuuu/email-service';
 *
 * const result = await sendSystemEmail({
 *   recipients: { to: ['admin@example.com'] },
 *   content: { subject: 'System Alert', html: '<p>Critical alert</p>' },
 * });
 * ```
 *
 * @example
 * ```typescript
 * // 5. Direct EmailService usage (advanced)
 * import { EmailService } from '@tuturuuu/email-service';
 *
 * const service = await EmailService.fromWorkspace(wsId);
 * const result = await service.send({
 *   recipients: { to: ['user@example.com'] },
 *   content: { subject: 'Hello', html: '<p>World</p>' },
 *   metadata: { wsId, templateType: 'notification' },
 * });
 * ```
 *
 * ## Features
 *
 * - **Rate Limiting**: Multi-dimensional limits (workspace, user, recipient, IP)
 * - **Blacklist Protection**: Automatic blocking of blacklisted emails/domains
 * - **Audit Logging**: Comprehensive logging of all email operations
 * - **DEV_MODE Support**: Emails logged but not sent in development
 * - **Batch Processing**: Efficient bulk sending with concurrency control
 * - **Security**: Content hashing, credential caching, input validation
 * - **Type Safety**: Full TypeScript support with Zod validation
 */

// =============================================================================
// Main Service
// =============================================================================

export { EmailService } from './email-service';

// =============================================================================
// Builder API (Recommended for DX)
// =============================================================================

export {
  EmailBuildError,
  EmailBuilder,
  email,
  isValidEmail,
  quickSend,
} from './builder';

// =============================================================================
// Batch Processing
// =============================================================================

export type {
  BatchEmailItem,
  BatchItemResult,
  BatchOptions,
  BatchProgress,
  BatchResult,
} from './batch';
export {
  createBatch,
  EmailBatch,
  sendToMany,
} from './batch';

// =============================================================================
// Providers
// =============================================================================

export { BaseEmailProvider, SESEmailProvider } from './providers/index';

// =============================================================================
// Protection Modules
// =============================================================================

export { BlacklistChecker, EmailRateLimiter } from './protection/index';

// =============================================================================
// Validation
// =============================================================================

export type {
  ValidatedEmailContent,
  ValidatedEmailMetadata,
  ValidatedEmailRecipients,
  ValidatedEmailSource,
  ValidatedSendEmailParams,
} from './validation';
export {
  emailAddressSchema,
  emailArraySchema,
  emailContentSchema,
  emailMetadataSchema,
  emailRecipientsSchema,
  emailSourceSchema,
  formatValidationErrors,
  normalizeEmail,
  normalizeEmailArray,
  safeValidateEmailParams,
  sendEmailParamsSchema,
  validateEmailParams,
} from './validation';

// =============================================================================
// Security Utilities
// =============================================================================

export {
  clearCredentialCache,
  containsSuspiciousContent,
  contentFingerprint,
  domainMatches,
  extractDomain,
  getCachedCredential,
  getWorkspaceCredentialKey,
  hashEmailContent,
  hashIpAddress,
  hashUserId,
  invalidateCachedCredential,
  isDisposableDomain,
  maskCredential,
  maskEmail,
  maskEmails,
  spamScore,
} from './security';

// =============================================================================
// Error Types
// =============================================================================

export {
  AllRecipientsBlockedError,
  BlacklistedEmailError,
  CredentialsError,
  EmailError,
  EmailValidationError,
  getUserFriendlyMessage,
  InvalidEmailError,
  isEmailError,
  isRetryable,
  NetworkError,
  NotInitializedError,
  ProviderError,
  RateLimitError,
  SESError,
  TimeoutError,
  wrapError,
} from './errors';

// =============================================================================
// Audit Utilities
// =============================================================================

export {
  createAuditRecord,
  getEmailStats,
  getRecentAuditRecords,
  logEmailAbuseEvent,
  markAsBounced,
  markAsComplained,
  updateAuditRecord,
} from './email-audit';

// =============================================================================
// Types
// =============================================================================

export type {
  BlacklistCheckResult,
  BlacklistedEmail,
  BlockedRecipient,
  BounceEventType,
  BounceRecord,
  BounceType,
  CreateAuditRecordParams,
  EmailAbuseEventType,
  EmailAuditRecord,
  EmailContent,
  EmailMetadata,
  EmailProvider,
  EmailRecipients,
  EmailServiceConfig,
  EmailSource,
  EmailStatus,
  PostmarkCredentials,
  ProviderCredentials,
  ProviderSendParams,
  ProviderSendResult,
  RateLimitConfig,
  RateLimitInfo,
  RateLimitType,
  SESCredentials,
  SendEmailParams,
  SendEmailResult,
  SendGridCredentials,
} from './types';

// =============================================================================
// Constants
// =============================================================================

// Re-export DEV_MODE for convenience
export { DEV_MODE } from '@tuturuuu/utils/constants';
export {
  AUDIT_RETENTION_DAYS,
  EMAIL_RATE_LIMITS,
  EMAIL_REDIS_KEYS,
  EMAIL_REGEX,
  EMAIL_REPUTATION_THRESHOLDS,
  EMAIL_WINDOW_MS,
  MAX_RECIPIENTS_PER_EMAIL,
  MAX_SUBJECT_LENGTH,
  SES_DEFAULT_REGION,
  STORE_EMAIL_CONTENT_DEFAULT,
  WORKSPACE_SECRET_KEYS,
} from './constants';

// =============================================================================
// Convenience Functions
// =============================================================================

import type { SupabaseClient } from '@tuturuuu/supabase';
import type { Database } from '@tuturuuu/types';

import { EmailService } from './email-service';
import type { EmailMetadata, SendEmailParams, SendEmailResult } from './types';

/**
 * Send an email using workspace credentials with full protection.
 *
 * @param wsId Workspace ID to send from
 * @param params Email parameters (recipients, content, optional metadata)
 * @returns Send result with success status and any blocked recipients
 *
 * @example
 * ```typescript
 * const result = await sendWorkspaceEmail(wsId, {
 *   recipients: { to: ['user@example.com'] },
 *   content: { subject: 'Hello', html: '<p>World</p>' },
 *   metadata: { templateType: 'notification' },
 * });
 *
 * if (!result.success) {
 *   console.error('Failed:', result.error);
 * }
 * ```
 */
export async function sendWorkspaceEmail(
  wsId: string,
  params: Omit<SendEmailParams, 'metadata'> & {
    metadata?: Partial<EmailMetadata>;
  }
): Promise<SendEmailResult> {
  const service = await EmailService.fromWorkspace(wsId);

  return service.send({
    ...params,
    metadata: {
      wsId,
      ...params.metadata,
    },
  });
}

/**
 * Send a system email using root workspace credentials.
 * Bypasses rate limiting (use for system notifications, cron jobs, etc.)
 *
 * @param params Email parameters (recipients, content, optional metadata)
 * @returns Send result with success status and any blocked recipients
 *
 * @example
 * ```typescript
 * const result = await sendSystemEmail({
 *   recipients: { to: ['admin@example.com'] },
 *   content: { subject: 'System Alert', html: '<p>Critical alert</p>' },
 *   metadata: { templateType: 'system-alert' },
 * });
 * ```
 */
export async function sendSystemEmail(
  params: Omit<SendEmailParams, 'metadata'> & {
    metadata?: Partial<EmailMetadata>;
  }
): Promise<SendEmailResult> {
  const { ROOT_WORKSPACE_ID } = await import('@tuturuuu/utils/constants');
  const service = await EmailService.fromRootWorkspace();

  return service.sendInternal({
    ...params,
    metadata: {
      wsId: ROOT_WORKSPACE_ID,
      ...params.metadata,
    },
  });
}

/**
 * Send a workspace invite email with stricter rate limits.
 *
 * @param wsId Workspace ID to send from
 * @param recipientEmail Email address to invite
 * @param content Email content (subject and html)
 * @param metadata Additional metadata
 * @returns Send result
 *
 * @example
 * ```typescript
 * const result = await sendWorkspaceInviteEmail(
 *   wsId,
 *   'newuser@example.com',
 *   {
 *     subject: 'You are invited to join our workspace',
 *     html: renderInviteTemplate(workspaceName, inviterName),
 *   },
 *   { userId: inviterId }
 * );
 * ```
 */
export async function sendWorkspaceInviteEmail(
  wsId: string,
  recipientEmail: string,
  content: { subject: string; html: string },
  metadata?: Partial<Omit<EmailMetadata, 'wsId' | 'isInvite'>>
): Promise<SendEmailResult> {
  const service = await EmailService.fromWorkspace(wsId);

  return service.send({
    recipients: { to: [recipientEmail] },
    content,
    metadata: {
      wsId,
      isInvite: true,
      templateType: 'workspace-invite',
      ...metadata,
    },
  });
}

/**
 * Create an EmailService instance from workspace credentials.
 * Useful when you need to send multiple emails.
 *
 * @param wsId Workspace ID
 * @returns Configured EmailService instance
 *
 * @example
 * ```typescript
 * const service = await createEmailServiceForWorkspace(wsId);
 *
 * // Send multiple emails efficiently
 * for (const user of users) {
 *   await service.send({
 *     recipients: { to: [user.email] },
 *     content: { subject: 'Hello', html: `<p>Hi ${user.name}</p>` },
 *     metadata: { wsId, templateType: 'greeting' },
 *   });
 * }
 * ```
 */
export async function createEmailServiceForWorkspace(
  wsId: string
): Promise<EmailService> {
  return EmailService.fromWorkspace(wsId);
}

/**
 * Create an EmailService instance with explicit credentials.
 * Useful when credentials come from a different source.
 *
 * @param credentials Provider credentials
 * @param source Default sender information
 * @param supabase Supabase client for database operations
 * @returns Configured EmailService instance
 */
export function createEmailService(
  credentials: {
    type: 'ses';
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  },
  source: { name: string; email: string },
  supabase: SupabaseClient<Database>
): EmailService {
  const service = EmailService.create(credentials, source);
  service.setSupabaseClient(supabase);
  return service;
}
