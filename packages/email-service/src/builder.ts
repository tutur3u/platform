/**
 * Email Builder
 *
 * Fluent API for constructing emails with type safety and validation.
 * Provides an intuitive developer experience for common email operations.
 *
 * @example
 * ```typescript
 * import { email } from '@tuturuuu/email-service';
 *
 * // Simple email
 * const result = await email()
 *   .to('user@example.com')
 *   .subject('Welcome!')
 *   .html('<h1>Hello</h1>')
 *   .from('notifications@company.com', 'Company')
 *   .send(wsId);
 *
 * // With template
 * const result = await email()
 *   .to(['alice@example.com', 'bob@example.com'])
 *   .cc('manager@example.com')
 *   .subject('Meeting Notes')
 *   .html(renderTemplate('meeting-notes', data))
 *   .template('meeting-notes')
 *   .entity('meeting', meetingId)
 *   .send(wsId);
 *
 * // System notification (bypasses rate limiting)
 * const result = await email()
 *   .to('admin@example.com')
 *   .subject('System Alert')
 *   .html('<p>Critical alert</p>')
 *   .priority('high')
 *   .sendSystem();
 * ```
 */

import type {
  EmailContent,
  EmailMetadata,
  EmailRecipients,
  EmailSource,
  SendEmailParams,
  SendEmailResult,
} from './types';
import {
  formatValidationErrors,
  isValidEmail,
  normalizeEmail,
  normalizeEmailArray,
  safeValidateEmailParams,
} from './validation';

// =============================================================================
// Email Builder Class
// =============================================================================

export class EmailBuilder {
  private _recipients: Partial<EmailRecipients> = { to: [] };
  private _content: Partial<EmailContent> = {};
  private _metadata: Partial<EmailMetadata> = {};
  private _source?: EmailSource;

  // ---------------------------------------------------------------------------
  // Recipients
  // ---------------------------------------------------------------------------

  /**
   * Set the primary recipient(s).
   */
  to(emails: string | string[]): this {
    const normalized = normalizeEmailArray(
      Array.isArray(emails) ? emails : [emails]
    );
    this._recipients.to = normalized;
    return this;
  }

  /**
   * Add CC recipient(s).
   */
  cc(emails: string | string[]): this {
    const normalized = normalizeEmailArray(
      Array.isArray(emails) ? emails : [emails]
    );
    this._recipients.cc = [...(this._recipients.cc || []), ...normalized];
    return this;
  }

  /**
   * Add BCC recipient(s).
   */
  bcc(emails: string | string[]): this {
    const normalized = normalizeEmailArray(
      Array.isArray(emails) ? emails : [emails]
    );
    this._recipients.bcc = [...(this._recipients.bcc || []), ...normalized];
    return this;
  }

  /**
   * Set reply-to address(es).
   */
  replyTo(emails: string | string[]): this {
    const normalized = normalizeEmailArray(
      Array.isArray(emails) ? emails : [emails]
    );
    this._content.replyTo = normalized;
    return this;
  }

  // ---------------------------------------------------------------------------
  // Content
  // ---------------------------------------------------------------------------

  /**
   * Set the email subject.
   */
  subject(subject: string): this {
    this._content.subject = subject.trim();
    return this;
  }

  /**
   * Set the HTML body.
   */
  html(html: string): this {
    this._content.html = html;
    return this;
  }

  /**
   * Set the plain text body (optional, auto-generated from HTML if not set).
   */
  text(text: string): this {
    this._content.text = text;
    return this;
  }

  // ---------------------------------------------------------------------------
  // Source / From
  // ---------------------------------------------------------------------------

  /**
   * Set custom sender information.
   * If not set, workspace default credentials will be used.
   */
  from(email: string, name?: string): this {
    const normalized = normalizeEmail(email);
    if (normalized) {
      this._source = {
        email: normalized,
        name: name || normalized.split('@')[0] || 'Notification',
      };
    }
    return this;
  }

  // ---------------------------------------------------------------------------
  // Metadata
  // ---------------------------------------------------------------------------

  /**
   * Set the template type for tracking.
   */
  template(type: string): this {
    this._metadata.templateType = type;
    return this;
  }

  /**
   * Set the entity reference for tracking.
   */
  entity(type: string, id?: string): this {
    this._metadata.entityType = type;
    if (id) {
      this._metadata.entityId = id;
    }
    return this;
  }

  /**
   * Set email priority.
   */
  priority(level: 'high' | 'normal' | 'low'): this {
    this._metadata.priority = level;
    return this;
  }

  /**
   * Mark as an invite email (stricter rate limits apply).
   */
  asInvite(): this {
    this._metadata.isInvite = true;
    this._metadata.templateType =
      this._metadata.templateType || 'workspace-invite';
    return this;
  }

  /**
   * Set the user ID for rate limiting.
   */
  userId(id: string): this {
    this._metadata.userId = id;
    return this;
  }

  /**
   * Set the client IP for rate limiting.
   */
  ip(address: string): this {
    this._metadata.ipAddress = address;
    return this;
  }

  /**
   * Set user agent for audit logging.
   */
  userAgent(ua: string): this {
    this._metadata.userAgent = ua;
    return this;
  }

  // ---------------------------------------------------------------------------
  // Build & Send
  // ---------------------------------------------------------------------------

  /**
   * Build the email parameters without sending.
   * Throws if validation fails.
   */
  build(wsId: string): SendEmailParams {
    const params = {
      recipients: this._recipients as EmailRecipients,
      content: this._content as EmailContent,
      metadata: {
        wsId,
        ...this._metadata,
      },
      source: this._source,
    };

    const result = safeValidateEmailParams(params);
    if (!result.success) {
      const errors = formatValidationErrors(result.error);
      throw new EmailBuildError(
        `Email validation failed: ${errors.join('; ')}`,
        errors
      );
    }

    return params as SendEmailParams;
  }

  /**
   * Validate the current builder state without building.
   * Returns validation errors if any.
   */
  validate(wsId: string): string[] {
    const params = {
      recipients: this._recipients,
      content: this._content,
      metadata: { wsId, ...this._metadata },
      source: this._source,
    };

    const result = safeValidateEmailParams(params);
    return result.success ? [] : formatValidationErrors(result.error);
  }

  /**
   * Send the email using workspace credentials.
   */
  async send(wsId: string): Promise<SendEmailResult> {
    const params = this.build(wsId);

    // Dynamic import to avoid circular dependency
    const { sendWorkspaceEmail } = await import('./index');
    return sendWorkspaceEmail(wsId, params);
  }

  /**
   * Send as a system email (bypasses rate limiting).
   */
  async sendSystem(): Promise<SendEmailResult> {
    const { ROOT_WORKSPACE_ID } = await import('@tuturuuu/utils/constants');
    const params = this.build(ROOT_WORKSPACE_ID);

    const { sendSystemEmail } = await import('./index');
    return sendSystemEmail(params);
  }

  /**
   * Send as an invite email (stricter rate limits).
   */
  async sendInvite(wsId: string): Promise<SendEmailResult> {
    this.asInvite();
    return this.send(wsId);
  }

  // ---------------------------------------------------------------------------
  // Utility Methods
  // ---------------------------------------------------------------------------

  /**
   * Clone this builder for modification.
   */
  clone(): EmailBuilder {
    const builder = new EmailBuilder();
    builder._recipients = { ...this._recipients };
    builder._content = { ...this._content };
    builder._metadata = { ...this._metadata };
    builder._source = this._source ? { ...this._source } : undefined;
    return builder;
  }

  /**
   * Reset the builder to initial state.
   */
  reset(): this {
    this._recipients = { to: [] };
    this._content = {};
    this._metadata = {};
    this._source = undefined;
    return this;
  }

  /**
   * Get recipient count.
   */
  get recipientCount(): number {
    return (
      (this._recipients.to?.length || 0) +
      (this._recipients.cc?.length || 0) +
      (this._recipients.bcc?.length || 0)
    );
  }

  /**
   * Check if the builder has minimum required fields.
   */
  get isValid(): boolean {
    return (
      (this._recipients.to?.length || 0) > 0 &&
      !!this._content.subject &&
      !!this._content.html
    );
  }
}

// =============================================================================
// Error Types
// =============================================================================

export class EmailBuildError extends Error {
  constructor(
    message: string,
    public readonly validationErrors: string[]
  ) {
    super(message);
    this.name = 'EmailBuildError';
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new email builder instance.
 *
 * @example
 * ```typescript
 * const result = await email()
 *   .to('user@example.com')
 *   .subject('Hello!')
 *   .html('<p>World</p>')
 *   .send(wsId);
 * ```
 */
export function email(): EmailBuilder {
  return new EmailBuilder();
}

// =============================================================================
// Quick Send Functions
// =============================================================================

/**
 * Quickly send a simple email.
 * For more options, use the email() builder.
 */
export async function quickSend(
  wsId: string,
  to: string | string[],
  subject: string,
  html: string,
  options?: {
    from?: { email: string; name: string };
    template?: string;
    userId?: string;
    ip?: string;
  }
): Promise<SendEmailResult> {
  const builder = email().to(to).subject(subject).html(html);

  if (options?.from) {
    builder.from(options.from.email, options.from.name);
  }
  if (options?.template) {
    builder.template(options.template);
  }
  if (options?.userId) {
    builder.userId(options.userId);
  }
  if (options?.ip) {
    builder.ip(options.ip);
  }

  return builder.send(wsId);
}

/**
 * Check if an email address is valid.
 */
export { isValidEmail };
