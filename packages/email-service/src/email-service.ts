/**
 * Email Service
 *
 * Main entry point for centralized email sending with rate limiting,
 * blacklist checking, and comprehensive audit logging.
 *
 * In DEV_MODE (when NODE_ENV === 'development'):
 * - Emails are NOT actually sent to recipients
 * - All emails are logged to the audit table with status 'sent' and messageId 'dev-mode-skip'
 * - Rate limiting and blacklist checks still apply
 * - This allows testing the full email flow without sending real emails
 */

import type { SupabaseClient } from '@tuturuuu/supabase';
import type { Database } from '@tuturuuu/types';
import { DEV_MODE } from '@tuturuuu/utils/constants';

import {
  createAuditRecord,
  logEmailAbuseEvent,
  updateAuditRecord,
} from './email-audit';
import { BlacklistChecker, EmailRateLimiter } from './protection/index';
import { SESEmailProvider } from './providers/ses';
import type {
  BlacklistedEmail,
  BlockedRecipient,
  EmailProvider,
  EmailServiceConfig,
  EmailSource,
  ProviderCredentials,
  RateLimitConfig,
  SESCredentials,
  SendEmailParams,
  SendEmailResult,
} from './types';

// =============================================================================
// Email Service Class
// =============================================================================

export class EmailService {
  private provider: EmailProvider;
  private rateLimiter: EmailRateLimiter;
  private blacklistChecker: BlacklistChecker;
  private config: EmailServiceConfig;
  private supabase: SupabaseClient<Database> | null = null;

  constructor(config: EmailServiceConfig) {
    this.config = config;
    this.rateLimiter = new EmailRateLimiter(config.rateLimits);
    this.blacklistChecker = new BlacklistChecker();

    // Initialize provider based on config
    switch (config.provider) {
      case 'ses':
        if (config.credentials.type !== 'ses') {
          throw new Error('Invalid credentials type for SES provider');
        }
        this.provider = new SESEmailProvider(config.credentials);
        break;
      // Future providers can be added here
      // case 'sendgrid':
      // case 'postmark':
      default:
        throw new Error(`Unknown email provider: ${config.provider}`);
    }
  }

  /**
   * Set the Supabase client for database operations.
   * Must be called before sending emails.
   */
  setSupabaseClient(supabase: SupabaseClient<Database>): void {
    this.supabase = supabase;
  }

  /**
   * Send an email with full protection (rate limiting, blacklist, audit).
   */
  async send(params: SendEmailParams): Promise<SendEmailResult> {
    if (!this.supabase) {
      // Try to get admin client
      try {
        const { createAdminClient } = await import(
          '@tuturuuu/supabase/next/server'
        );
        this.supabase = (await createAdminClient()) as SupabaseClient<Database>;
      } catch {
        return {
          success: false,
          error:
            'Supabase client not initialized. Call setSupabaseClient() first.',
        };
      }
    }

    const allRecipients = [
      ...params.recipients.to,
      ...(params.recipients.cc || []),
      ...(params.recipients.bcc || []),
    ];

    if (allRecipients.length === 0) {
      return {
        success: false,
        error: 'No recipients specified',
      };
    }

    // Determine source early for auditing
    const source = params.source || this.config.defaultSource;

    // Create audit record immediately
    const auditId = await createAuditRecord(this.supabase, {
      wsId: params.metadata.wsId,
      userId: params.metadata.userId,
      provider: this.provider.name,
      sourceName: source.name,
      sourceEmail: source.email,
      toAddresses: params.recipients.to,
      ccAddresses: params.recipients.cc || [],
      bccAddresses: params.recipients.bcc || [],
      subject: params.content.subject,
      templateType: params.metadata.templateType,
      entityType: params.metadata.entityType,
      entityId: params.metadata.entityId,
      ipAddress: params.metadata.ipAddress,
      htmlContent: params.content.html,
      textContent: params.content.text,
    });

    // 1. Check sender rate limits
    const rateLimitResult = await this.rateLimiter.checkRateLimits(
      params.metadata
    );

    if (!rateLimitResult.allowed) {
      await logEmailAbuseEvent(
        this.supabase,
        'email_rate_limit_exceeded',
        params.metadata,
        {
          additionalMetadata: {
            limitType: rateLimitResult.limitType,
            reason: rateLimitResult.reason,
          },
        }
      );

      if (auditId) {
        await updateAuditRecord(
          this.supabase,
          auditId,
          'failed',
          undefined,
          rateLimitResult.reason || 'Rate limit exceeded'
        );
      }

      return {
        success: false,
        error: rateLimitResult.reason || 'Rate limit exceeded',
        rateLimitInfo: rateLimitResult,
        auditId: auditId || undefined,
      };
    }

    // 2. Check recipient rate limits
    const recipientLimits =
      await this.rateLimiter.checkRecipientLimits(allRecipients);

    // 3. Check blacklist
    const blacklistResult = await this.blacklistChecker.checkEmails(
      allRecipients,
      this.supabase
    );

    // Combine blocked recipients
    const blockedRecipients: BlockedRecipient[] = [];

    for (const blocked of blacklistResult.blocked as BlacklistedEmail[]) {
      blockedRecipients.push({
        email: blocked.email,
        reason: 'blacklist',
        details: blocked.reason || undefined,
      });
    }

    for (const [email, limitInfo] of recipientLimits.entries()) {
      blockedRecipients.push({
        email,
        reason: 'rate_limit',
        details: limitInfo.reason,
      });
    }

    // Log blacklist blocks
    if (blacklistResult.blocked.length > 0) {
      await logEmailAbuseEvent(
        this.supabase,
        'email_blacklist_blocked',
        params.metadata,
        {
          additionalMetadata: {
            blockedCount: blacklistResult.blocked.length,
            blockedEmails: blacklistResult.blocked.map((b) => b.email),
          },
        }
      );
    }

    // Filter to allowed recipients only
    const blockedSet = new Set(
      blockedRecipients.map((b: BlockedRecipient) => b.email)
    );
    const allowedTo = params.recipients.to.filter(
      (e: string) => !blockedSet.has(e)
    );
    const allowedCc =
      params.recipients.cc?.filter((e: string) => !blockedSet.has(e)) || [];
    const allowedBcc =
      params.recipients.bcc?.filter((e: string) => !blockedSet.has(e)) || [];

    if (
      allowedTo.length === 0 &&
      allowedCc.length === 0 &&
      allowedBcc.length === 0
    ) {
      if (auditId) {
        await updateAuditRecord(
          this.supabase,
          auditId,
          'failed',
          undefined,
          'All recipients blocked or rate limited'
        );
      }

      return {
        success: false,
        error: 'All recipients blocked or rate limited',
        blockedRecipients,
        auditId: auditId || undefined,
      };
    }

    // 6. Check dev mode - skip actual sending but log as sent
    const isDevMode = DEV_MODE || this.config.devMode;

    if (isDevMode) {
      console.log('[EmailService] DEV_MODE - email logged but NOT sent:', {
        to: allowedTo,
        cc: allowedCc,
        bcc: allowedBcc,
        subject: params.content.subject,
        templateType: params.metadata.templateType,
      });

      if (auditId) {
        await updateAuditRecord(
          this.supabase,
          auditId,
          'sent',
          'dev-mode-skip'
        );
      }

      return {
        success: true,
        messageId: 'dev-mode-skip',
        auditId: auditId || undefined,
        blockedRecipients:
          blockedRecipients.length > 0 ? blockedRecipients : undefined,
      };
    }

    // Format source for provider
    const formattedSource = `"${source.name}" <${source.email}>`;

    const providerResult = await this.provider.send({
      source: formattedSource,
      recipients: {
        to: allowedTo,
        cc: allowedCc,
        bcc: allowedBcc,
      },
      content: params.content,
    });

    // 7. Update audit record and counters
    if (providerResult.success) {
      if (auditId) {
        await updateAuditRecord(
          this.supabase,
          auditId,
          'sent',
          providerResult.messageId
        );
      }

      // Increment rate limit counters AFTER successful send
      await this.rateLimiter.incrementCounters(params.metadata, [
        ...allowedTo,
        ...allowedCc,
        ...allowedBcc,
      ]);
    } else {
      if (auditId) {
        await updateAuditRecord(
          this.supabase,
          auditId,
          'failed',
          undefined,
          providerResult.error
        );
      }
    }

    return {
      success: providerResult.success,
      messageId: providerResult.messageId,
      auditId: auditId || undefined,
      error: providerResult.error,
      blockedRecipients:
        blockedRecipients.length > 0 ? blockedRecipients : undefined,
    };
  }

  /**
   * Send without rate limiting (for internal/system emails).
   * Still checks blacklist and creates audit records.
   */
  async sendInternal(params: SendEmailParams): Promise<SendEmailResult> {
    if (!this.supabase) {
      try {
        const { createAdminClient } = await import(
          '@tuturuuu/supabase/next/server'
        );
        this.supabase = (await createAdminClient()) as SupabaseClient<Database>;
      } catch {
        return {
          success: false,
          error: 'Supabase client not initialized',
        };
      }
    }

    const allRecipients = [
      ...params.recipients.to,
      ...(params.recipients.cc || []),
      ...(params.recipients.bcc || []),
    ];

    if (allRecipients.length === 0) {
      return {
        success: false,
        error: 'No recipients specified',
      };
    }

    // Check blacklist only (skip rate limiting)
    const blacklistResult = await this.blacklistChecker.checkEmails(
      allRecipients,
      this.supabase
    );

    const blockedRecipients: BlockedRecipient[] = blacklistResult.blocked.map(
      (b: BlacklistedEmail) => ({
        email: b.email,
        reason: 'blacklist' as const,
        details: b.reason || undefined,
      })
    );

    // Filter to allowed recipients
    const blockedSet = new Set(
      blockedRecipients.map((b: BlockedRecipient) => b.email)
    );
    const allowedTo = params.recipients.to.filter(
      (e: string) => !blockedSet.has(e)
    );
    const allowedCc =
      params.recipients.cc?.filter((e: string) => !blockedSet.has(e)) || [];
    const allowedBcc =
      params.recipients.bcc?.filter((e: string) => !blockedSet.has(e)) || [];

    if (
      allowedTo.length === 0 &&
      allowedCc.length === 0 &&
      allowedBcc.length === 0
    ) {
      return {
        success: false,
        error: 'All recipients blocked',
        blockedRecipients,
      };
    }

    const source = params.source || this.config.defaultSource;

    // Create audit record
    const auditId = await createAuditRecord(this.supabase, {
      wsId: params.metadata.wsId,
      userId: params.metadata.userId,
      provider: this.provider.name,
      sourceName: source.name,
      sourceEmail: source.email,
      toAddresses: allowedTo,
      ccAddresses: allowedCc,
      bccAddresses: allowedBcc,
      subject: params.content.subject,
      templateType: params.metadata.templateType,
      entityType: params.metadata.entityType,
      entityId: params.metadata.entityId,
      ipAddress: params.metadata.ipAddress,
      htmlContent: params.content.html,
      textContent: params.content.text,
    });

    // Check dev mode - skip actual sending but log as sent
    const isDevMode = DEV_MODE || this.config.devMode;

    if (isDevMode) {
      console.log(
        '[EmailService] DEV_MODE (internal) - email logged but NOT sent:',
        {
          to: allowedTo,
          cc: allowedCc,
          bcc: allowedBcc,
          subject: params.content.subject,
          templateType: params.metadata.templateType,
        }
      );

      if (auditId) {
        await updateAuditRecord(
          this.supabase,
          auditId,
          'sent',
          'dev-mode-skip'
        );
      }

      return {
        success: true,
        messageId: 'dev-mode-skip',
        auditId: auditId || undefined,
        blockedRecipients:
          blockedRecipients.length > 0 ? blockedRecipients : undefined,
      };
    }

    // Send via provider
    const formattedSource = `"${source.name}" <${source.email}>`;

    const providerResult = await this.provider.send({
      source: formattedSource,
      recipients: { to: allowedTo, cc: allowedCc, bcc: allowedBcc },
      content: params.content,
    });

    // Update audit record
    if (auditId) {
      if (providerResult.success) {
        await updateAuditRecord(
          this.supabase,
          auditId,
          'sent',
          providerResult.messageId
        );
      } else {
        await updateAuditRecord(
          this.supabase,
          auditId,
          'failed',
          undefined,
          providerResult.error
        );
      }
    }

    return {
      success: providerResult.success,
      messageId: providerResult.messageId,
      auditId: auditId || undefined,
      error: providerResult.error,
      blockedRecipients:
        blockedRecipients.length > 0 ? blockedRecipients : undefined,
    };
  }

  /**
   * Validate provider credentials.
   */
  async validateCredentials(): Promise<boolean> {
    return this.provider.validateCredentials();
  }

  /**
   * Get the provider name.
   */
  getProviderName(): string {
    return this.provider.name;
  }

  // ===========================================================================
  // Static Factory Methods
  // ===========================================================================

  /**
   * Create EmailService from workspace credentials stored in database.
   */
  static async fromWorkspace(
    wsId: string,
    options?: {
      rateLimits?: Partial<RateLimitConfig>;
      devMode?: boolean;
    }
  ): Promise<EmailService> {
    const { createAdminClient } = await import(
      '@tuturuuu/supabase/next/server'
    );
    const sbAdmin = (await createAdminClient()) as SupabaseClient<Database>;

    const { data: credentials, error } = await sbAdmin
      .from('workspace_email_credentials')
      .select('*')
      .eq('ws_id', wsId)
      .maybeSingle();

    if (error) {
      throw new Error(`Error fetching email credentials: ${error.message}`);
    }

    if (!credentials) {
      throw new Error(`No email credentials found for workspace ${wsId}`);
    }

    // DEV_MODE is handled globally via the imported constant
    // No need to set devMode in config - it's checked in send() and sendInternal()
    const service = new EmailService({
      provider: 'ses',
      credentials: {
        type: 'ses',
        region: credentials.region,
        accessKeyId: credentials.access_id,
        secretAccessKey: credentials.access_key,
      } as SESCredentials,
      defaultSource: {
        name: credentials.source_name,
        email: credentials.source_email,
      },
      rateLimits: options?.rateLimits,
      devMode: options?.devMode,
    });

    service.setSupabaseClient(sbAdmin);

    return service;
  }

  /**
   * Create EmailService from root workspace credentials.
   * Useful for system-wide emails like notifications.
   */
  static async fromRootWorkspace(): Promise<EmailService> {
    const { ROOT_WORKSPACE_ID } = await import('@tuturuuu/utils/constants');
    return EmailService.fromWorkspace(ROOT_WORKSPACE_ID);
  }

  /**
   * Create EmailService from explicit config.
   * Useful when credentials are passed directly.
   */
  static create(
    credentials: ProviderCredentials,
    source: EmailSource,
    options?: {
      rateLimits?: Partial<RateLimitConfig>;
      devMode?: boolean;
    }
  ): EmailService {
    let provider: 'ses' | 'sendgrid' | 'postmark';

    switch (credentials.type) {
      case 'ses':
        provider = 'ses';
        break;
      case 'sendgrid':
        provider = 'sendgrid';
        break;
      case 'postmark':
        provider = 'postmark';
        break;
      default:
        throw new Error('Unknown credentials type');
    }

    return new EmailService({
      provider,
      credentials,
      defaultSource: source,
      rateLimits: options?.rateLimits,
      devMode: options?.devMode,
    });
  }
}
