/**
 * Email Service Types
 *
 * Centralized type definitions for the email service package.
 */

// =============================================================================
// Email Recipients & Content
// =============================================================================

export interface EmailRecipients {
  to: string[];
  cc?: string[];
  bcc?: string[];
}

export interface EmailContent {
  subject: string;
  html: string;
  text?: string;
  replyTo?: string[];
}

// =============================================================================
// Email Metadata (for tracking, audit, rate limiting)
// =============================================================================

export interface EmailMetadata {
  /** Workspace ID (required for rate limiting and audit) */
  wsId: string;
  /** Platform user ID if sender is authenticated */
  userId?: string;
  /** Email template type (e.g., 'workspace-invite', 'notification-digest') */
  templateType?: string;
  /** Entity type being notified about (e.g., 'notification', 'post', 'lead') */
  entityType?: string;
  /** Entity ID for reference */
  entityId?: string;
  /** Client IP address for rate limiting */
  ipAddress?: string;
  /** User agent for audit logging */
  userAgent?: string;
  /** Email priority for potential queue ordering */
  priority?: 'high' | 'normal' | 'low';
  /** Whether this is an invite email (stricter rate limits apply) */
  isInvite?: boolean;
}

// =============================================================================
// Send Email Parameters
// =============================================================================

export interface SendEmailParams {
  recipients: EmailRecipients;
  content: EmailContent;
  metadata: EmailMetadata;
  /** Custom source override (defaults to workspace credentials) */
  source?: EmailSource;
}

export interface EmailSource {
  name: string;
  email: string;
}

// =============================================================================
// Result Types
// =============================================================================

export interface SendEmailResult {
  success: boolean;
  /** Provider message ID (for tracking) */
  messageId?: string;
  /** Audit record ID */
  auditId?: string;
  /** Error message if failed */
  error?: string;
  /** Recipients that were blocked (blacklist or rate limit) */
  blockedRecipients?: BlockedRecipient[];
  /** Rate limit information */
  rateLimitInfo?: RateLimitInfo;
}

export interface BlockedRecipient {
  email: string;
  reason: 'blacklist' | 'rate_limit' | 'bounce' | 'complaint';
  details?: string;
}

export interface RateLimitInfo {
  allowed: boolean;
  remaining: number;
  // Added for better feedback
  limit?: number;
  usage?: number;
  retryAfter?: number;
  reason?: string;
  limitType?: RateLimitType;
}

export type RateLimitType =
  | 'workspace_minute'
  | 'workspace_hour'
  | 'workspace_day'
  | 'user_minute'
  | 'user_hour'
  | 'recipient_hour'
  | 'recipient_day'
  | 'ip_minute'
  | 'ip_hour'
  | 'invite_minute'
  | 'invite_hour'
  | 'invite_day';

// =============================================================================
// Provider Types
// =============================================================================

export interface EmailProvider {
  /** Provider name identifier */
  name: string;
  /** Send an email via this provider */
  send(params: ProviderSendParams): Promise<ProviderSendResult>;
  /** Validate provider credentials */
  validateCredentials(): Promise<boolean>;
}

export interface ProviderSendParams {
  /** Formatted source (e.g., "Display Name <email@domain.com>") */
  source: string;
  recipients: EmailRecipients;
  content: EmailContent;
}

export interface ProviderSendResult {
  success: boolean;
  /** Provider-specific message ID */
  messageId?: string;
  /** HTTP status code from provider */
  httpStatus?: number;
  /** Error message if failed */
  error?: string;
  /** Raw provider response (for debugging) */
  rawResponse?: unknown;
}

// =============================================================================
// Credential Types
// =============================================================================

export type ProviderCredentials =
  | SESCredentials
  | SendGridCredentials
  | PostmarkCredentials;

export interface SESCredentials {
  type: 'ses';
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface SendGridCredentials {
  type: 'sendgrid';
  apiKey: string;
}

export interface PostmarkCredentials {
  type: 'postmark';
  serverToken: string;
}

// =============================================================================
// Service Configuration
// =============================================================================

export interface EmailServiceConfig {
  /** Email provider to use */
  provider: 'ses' | 'sendgrid' | 'postmark';
  /** Provider credentials */
  credentials: ProviderCredentials;
  /** Default sender information */
  defaultSource: EmailSource;
  /** Custom rate limit overrides */
  rateLimits?: Partial<RateLimitConfig>;
  /** Skip actual sending (for development) */
  devMode?: boolean;
}

export interface RateLimitConfig {
  workspacePerMinute: number;
  workspacePerHour: number;
  workspacePerDay: number;
  userPerMinute: number;
  userPerHour: number;
  recipientPerHour: number;
  recipientPerDay: number;
  ipPerMinute: number;
  ipPerHour: number;
  invitePerMinute: number;
  invitePerHour: number;
  invitePerDay: number;
}

// =============================================================================
// Audit Types
// =============================================================================

export type EmailStatus =
  | 'pending'
  | 'sent'
  | 'failed'
  | 'bounced'
  | 'complained';

export interface EmailAuditRecord {
  id: string;
  ws_id: string;
  user_id?: string;
  provider: string;
  source_name: string;
  source_email: string;
  to_addresses: string[];
  cc_addresses: string[];
  bcc_addresses: string[];
  subject: string;
  template_type?: string;
  entity_type?: string;
  entity_id?: string;
  status: EmailStatus;
  message_id?: string;
  error_message?: string;
  ip_address?: string;
  created_at: string;
  sent_at?: string;
}

export interface CreateAuditRecordParams {
  wsId: string;
  userId?: string;
  provider: string;
  sourceName: string;
  sourceEmail: string;
  toAddresses: string[];
  ccAddresses: string[];
  bccAddresses: string[];
  subject: string;
  templateType?: string;
  entityType?: string;
  entityId?: string;
  ipAddress?: string;
  /** HTML content of the email body */
  htmlContent?: string;
  /** Plain text content of the email body */
  textContent?: string;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

// =============================================================================
// Bounce & Complaint Types
// =============================================================================

export type BounceEventType = 'bounce' | 'complaint';

export type BounceType = 'hard' | 'soft' | 'transient';

export interface BounceRecord {
  id: string;
  email_hash: string;
  event_type: BounceEventType;
  bounce_type?: BounceType;
  bounce_subtype?: string;
  complaint_type?: string;
  original_email_id?: string;
  raw_notification?: unknown;
  created_at: string;
}

// =============================================================================
// Blacklist Types
// =============================================================================

export interface BlacklistCheckResult {
  allowed: string[];
  blocked: BlacklistedEmail[];
}

export interface BlacklistedEmail {
  email: string;
  reason: string | null;
  entryType: 'email' | 'domain';
}

// =============================================================================
// Abuse Event Types
// =============================================================================

export type EmailAbuseEventType =
  | 'email_rate_limit_exceeded'
  | 'email_blacklist_blocked'
  | 'email_ip_blocked'
  | 'email_bounce'
  | 'email_complaint'
  | 'email_spam_detected';
