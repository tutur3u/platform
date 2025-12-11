/**
 * Email Service Errors
 *
 * Typed error classes for better error handling and debugging.
 */

import type { BlockedRecipient, RateLimitInfo } from './types';

// =============================================================================
// Base Email Error
// =============================================================================

/**
 * Base class for all email service errors.
 */
export class EmailError extends Error {
  /** Error code for programmatic handling */
  readonly code: string;
  /** Whether the operation can be retried */
  readonly retryable: boolean;
  /** HTTP status code equivalent */
  readonly statusCode: number;

  constructor(
    message: string,
    options: {
      code: string;
      retryable?: boolean;
      statusCode?: number;
      cause?: Error;
    }
  ) {
    super(message, { cause: options.cause });
    this.name = 'EmailError';
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.statusCode = options.statusCode ?? 500;
  }

  /**
   * Convert to a safe object for logging/serialization.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      statusCode: this.statusCode,
    };
  }
}

// =============================================================================
// Validation Errors
// =============================================================================

/**
 * Email validation failed.
 */
export class EmailValidationError extends EmailError {
  readonly validationErrors: string[];

  constructor(errors: string[], cause?: Error) {
    super(`Email validation failed: ${errors.join('; ')}`, {
      code: 'EMAIL_VALIDATION_FAILED',
      retryable: false,
      statusCode: 400,
      cause,
    });
    this.name = 'EmailValidationError';
    this.validationErrors = errors;
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      validationErrors: this.validationErrors,
    };
  }
}

/**
 * Invalid email address format.
 */
export class InvalidEmailError extends EmailError {
  readonly email: string;

  constructor(email: string) {
    super(`Invalid email address: ${email}`, {
      code: 'INVALID_EMAIL_ADDRESS',
      retryable: false,
      statusCode: 400,
    });
    this.name = 'InvalidEmailError';
    this.email = email;
  }
}

// =============================================================================
// Rate Limit Errors
// =============================================================================

/**
 * Rate limit exceeded.
 */
export class RateLimitError extends EmailError {
  readonly rateLimitInfo: RateLimitInfo;
  readonly retryAfterSeconds?: number;

  constructor(rateLimitInfo: RateLimitInfo) {
    super(rateLimitInfo.reason || 'Rate limit exceeded', {
      code: 'RATE_LIMIT_EXCEEDED',
      retryable: true,
      statusCode: 429,
    });
    this.name = 'RateLimitError';
    this.rateLimitInfo = rateLimitInfo;
    this.retryAfterSeconds = rateLimitInfo.retryAfter;
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      rateLimitInfo: this.rateLimitInfo,
      retryAfterSeconds: this.retryAfterSeconds,
    };
  }
}

// =============================================================================
// Recipient Errors
// =============================================================================

/**
 * All recipients were blocked.
 */
export class AllRecipientsBlockedError extends EmailError {
  readonly blockedRecipients: BlockedRecipient[];

  constructor(blockedRecipients: BlockedRecipient[]) {
    const reasons = blockedRecipients.map((r) => `${r.email}: ${r.reason}`);
    super(`All recipients blocked: ${reasons.join(', ')}`, {
      code: 'ALL_RECIPIENTS_BLOCKED',
      retryable: false,
      statusCode: 400,
    });
    this.name = 'AllRecipientsBlockedError';
    this.blockedRecipients = blockedRecipients;
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      blockedRecipients: this.blockedRecipients,
    };
  }
}

/**
 * Email address is blacklisted.
 */
export class BlacklistedEmailError extends EmailError {
  readonly email: string;
  readonly reason?: string;

  constructor(email: string, reason?: string) {
    super(
      `Email address is blacklisted: ${email}${reason ? ` (${reason})` : ''}`,
      {
        code: 'EMAIL_BLACKLISTED',
        retryable: false,
        statusCode: 400,
      }
    );
    this.name = 'BlacklistedEmailError';
    this.email = email;
    this.reason = reason;
  }
}

// =============================================================================
// Provider Errors
// =============================================================================

/**
 * Email provider error (SES, SendGrid, etc.).
 */
export class ProviderError extends EmailError {
  readonly provider: string;
  readonly providerCode?: string;

  constructor(
    provider: string,
    message: string,
    options?: {
      providerCode?: string;
      retryable?: boolean;
      cause?: Error;
    }
  ) {
    super(`${provider} error: ${message}`, {
      code: 'PROVIDER_ERROR',
      retryable: options?.retryable ?? false,
      statusCode: 502,
      cause: options?.cause,
    });
    this.name = 'ProviderError';
    this.provider = provider;
    this.providerCode = options?.providerCode;
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      provider: this.provider,
      providerCode: this.providerCode,
    };
  }
}

/**
 * SES-specific errors.
 */
export class SESError extends ProviderError {
  constructor(
    message: string,
    options?: { providerCode?: string; retryable?: boolean; cause?: Error }
  ) {
    super('SES', message, options);
    this.name = 'SESError';
  }
}

// =============================================================================
// Configuration Errors
// =============================================================================

/**
 * Email credentials not found or invalid.
 */
export class CredentialsError extends EmailError {
  readonly wsId?: string;

  constructor(message: string, wsId?: string) {
    super(message, {
      code: 'CREDENTIALS_ERROR',
      retryable: false,
      statusCode: 500,
    });
    this.name = 'CredentialsError';
    this.wsId = wsId;
  }
}

/**
 * Email service not initialized.
 */
export class NotInitializedError extends EmailError {
  constructor(message = 'Email service not initialized') {
    super(message, {
      code: 'NOT_INITIALIZED',
      retryable: false,
      statusCode: 500,
    });
    this.name = 'NotInitializedError';
  }
}

// =============================================================================
// Network Errors
// =============================================================================

/**
 * Network or connectivity error.
 */
export class NetworkError extends EmailError {
  constructor(message: string, cause?: Error) {
    super(message, {
      code: 'NETWORK_ERROR',
      retryable: true,
      statusCode: 503,
      cause,
    });
    this.name = 'NetworkError';
  }
}

/**
 * Request timed out.
 */
export class TimeoutError extends EmailError {
  readonly timeoutMs: number;

  constructor(timeoutMs: number, operation?: string) {
    super(`${operation || 'Operation'} timed out after ${timeoutMs}ms`, {
      code: 'TIMEOUT',
      retryable: true,
      statusCode: 504,
    });
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if an error is an EmailError.
 */
export function isEmailError(error: unknown): error is EmailError {
  return error instanceof EmailError;
}

/**
 * Check if an error is retryable.
 */
export function isRetryable(error: unknown): boolean {
  if (isEmailError(error)) {
    return error.retryable;
  }
  // Network errors are generally retryable
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('econnreset')
    );
  }
  return false;
}

/**
 * Get a user-friendly error message.
 */
export function getUserFriendlyMessage(error: unknown): string {
  if (error instanceof EmailValidationError) {
    return 'Please check the email addresses and try again.';
  }
  if (error instanceof RateLimitError) {
    const seconds = error.retryAfterSeconds || 60;
    return `Too many emails sent. Please wait ${seconds} seconds and try again.`;
  }
  if (error instanceof AllRecipientsBlockedError) {
    return 'The email address(es) cannot receive emails at this time.';
  }
  if (error instanceof BlacklistedEmailError) {
    return 'This email address has been blocked from receiving emails.';
  }
  if (error instanceof ProviderError) {
    return 'There was a problem sending the email. Please try again later.';
  }
  if (error instanceof CredentialsError) {
    return 'Email service is not configured properly. Please contact support.';
  }
  if (error instanceof NetworkError || error instanceof TimeoutError) {
    return 'Network error. Please check your connection and try again.';
  }
  if (error instanceof Error) {
    return 'An unexpected error occurred while sending the email.';
  }
  return 'An unknown error occurred.';
}

/**
 * Wrap an unknown error in an appropriate EmailError.
 */
export function wrapError(error: unknown, context?: string): EmailError {
  if (isEmailError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const fullMessage = context ? `${context}: ${message}` : message;

  return new EmailError(fullMessage, {
    code: 'UNKNOWN_ERROR',
    retryable: isRetryable(error),
    statusCode: 500,
    cause: error instanceof Error ? error : undefined,
  });
}
