/**
 * Email Audit Utilities
 *
 * Functions for creating and managing email audit records.
 */

import type { SupabaseClient } from '@tuturuuu/supabase';
import type { Database } from '@tuturuuu/types';

import type {
  CreateAuditRecordParams,
  EmailAbuseEventType,
  EmailMetadata,
  EmailStatus,
} from './types';

// =============================================================================
// Audit Record Management
// =============================================================================

/**
 * Create a new email audit record.
 * Returns the audit record ID.
 */
export async function createAuditRecord(
  supabase: SupabaseClient<Database>,
  params: CreateAuditRecordParams
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('email_audit')
      .insert({
        ws_id: params.wsId,
        user_id: params.userId || null,
        provider: params.provider,
        source_name: params.sourceName,
        source_email: params.sourceEmail,
        to_addresses: params.toAddresses,
        cc_addresses: params.ccAddresses,
        bcc_addresses: params.bccAddresses,
        subject: params.subject,
        template_type: params.templateType || null,
        entity_type: params.entityType || null,
        entity_id: params.entityId || null,
        ip_address: params.ipAddress || null,
        html_content: params.htmlContent || null,
        text_content: params.textContent || null,
        status: 'pending',
        metadata: params.metadata || null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[EmailAudit] Error creating audit record:', error);
      return null;
    }

    return data.id;
  } catch (error) {
    console.error('[EmailAudit] Exception creating audit record:', error);
    return null;
  }
}

/**
 * Update an existing audit record.
 */
export async function updateAuditRecord(
  supabase: SupabaseClient<Database>,
  auditId: string,
  status: EmailStatus,
  messageId?: string,
  errorMessage?: string,
  metadata?: Record<string, any>
): Promise<boolean> {
  try {
    const updateData: {
      status: EmailStatus;
      message_id?: string;
      error_message?: string;
      sent_at?: string;
      updated_at: string;
      metadata?: Record<string, any>;
    } = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (messageId) {
      updateData.message_id = messageId;
    }

    if (errorMessage) {
      updateData.error_message = errorMessage;
    }

    if (metadata) {
      updateData.metadata = metadata;
    }

    if (status === 'sent') {
      updateData.sent_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('email_audit')
      .update(updateData)
      .eq('id', auditId);

    if (error) {
      console.error('[EmailAudit] Error updating audit record:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[EmailAudit] Exception updating audit record:', error);
    return false;
  }
}

/**
 * Mark an audit record as bounced.
 */
export async function markAsBounced(
  supabase: SupabaseClient<Database>,
  messageId: string,
  bounceType: string,
  bounceSubtype?: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('email_audit')
      .update({
        status: 'bounced' as EmailStatus,
        error_message: `Bounce: ${bounceType}${bounceSubtype ? ` - ${bounceSubtype}` : ''}`,
        updated_at: new Date().toISOString(),
      })
      .eq('message_id', messageId);

    if (error) {
      console.error('[EmailAudit] Error marking as bounced:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[EmailAudit] Exception marking as bounced:', error);
    return false;
  }
}

/**
 * Mark an audit record as complained.
 */
export async function markAsComplained(
  supabase: SupabaseClient<Database>,
  messageId: string,
  complaintType?: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('email_audit')
      .update({
        status: 'complained' as EmailStatus,
        error_message: `Complaint${complaintType ? `: ${complaintType}` : ''}`,
        updated_at: new Date().toISOString(),
      })
      .eq('message_id', messageId);

    if (error) {
      console.error('[EmailAudit] Error marking as complained:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[EmailAudit] Exception marking as complained:', error);
    return false;
  }
}

// =============================================================================
// Abuse Event Logging
// =============================================================================

/**
 * Log an email-related abuse event.
 * Uses 'manual' as the database event type and stores the specific email event
 * type in the metadata for compatibility with the existing abuse_events schema.
 */
export async function logEmailAbuseEvent(
  supabase: SupabaseClient<Database>,
  eventType: EmailAbuseEventType,
  metadata: EmailMetadata,
  options?: {
    email?: string;
    success?: boolean;
    additionalMetadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    // Hash email for privacy if provided
    let emailHash: string | null = null;
    if (options?.email) {
      const { createHash } = await import('crypto');
      emailHash = createHash('sha256')
        .update(options.email.toLowerCase())
        .digest('hex')
        .substring(0, 16);
    }

    // Use 'manual' as the DB event type since email-specific types aren't in the enum yet
    // Store the actual email event type in metadata for filtering/analysis
    await supabase.from('abuse_events').insert({
      ip_address: metadata.ipAddress || 'unknown',
      event_type: 'manual' as const,
      email_hash: emailHash,
      user_agent: metadata.userAgent?.substring(0, 500) || null,
      endpoint: 'email-service',
      success: options?.success ?? false,
      metadata: {
        emailEventType: eventType,
        wsId: metadata.wsId,
        userId: metadata.userId,
        templateType: metadata.templateType,
        entityType: metadata.entityType,
        entityId: metadata.entityId,
        ...options?.additionalMetadata,
      },
    });
  } catch (error) {
    // Log but don't throw - abuse logging should not block email operations
    console.error('[EmailAudit] Error logging abuse event:', error);
  }
}

// =============================================================================
// Statistics & Queries
// =============================================================================

/**
 * Get email statistics for a workspace.
 */
export async function getEmailStats(
  supabase: SupabaseClient<Database>,
  wsId: string,
  period: '24h' | '7d' | '30d' = '24h'
): Promise<{
  total: number;
  sent: number;
  failed: number;
  bounced: number;
  complained: number;
} | null> {
  try {
    const periodMap = {
      '24h': 1,
      '7d': 7,
      '30d': 30,
    };
    const days = periodMap[period];
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await supabase
      .from('email_audit')
      .select('status')
      .eq('ws_id', wsId)
      .gte('created_at', since.toISOString());

    if (error) {
      console.error('[EmailAudit] Error getting stats:', error);
      return null;
    }

    const stats = {
      total: data?.length || 0,
      sent: 0,
      failed: 0,
      bounced: 0,
      complained: 0,
    };

    for (const record of data || []) {
      switch (record.status) {
        case 'sent':
          stats.sent++;
          break;
        case 'failed':
          stats.failed++;
          break;
        case 'bounced':
          stats.bounced++;
          break;
        case 'complained':
          stats.complained++;
          break;
      }
    }

    return stats;
  } catch (error) {
    console.error('[EmailAudit] Exception getting stats:', error);
    return null;
  }
}

/**
 * Get recent audit records for a workspace.
 */
export async function getRecentAuditRecords(
  supabase: SupabaseClient<Database>,
  wsId: string,
  options?: {
    limit?: number;
    offset?: number;
    status?: EmailStatus;
    templateType?: string;
  }
): Promise<{
  records: Array<{
    id: string;
    source_email: string;
    to_addresses: string[];
    subject: string;
    template_type: string | null;
    status: string;
    message_id: string | null;
    error_message: string | null;
    created_at: string;
    sent_at: string | null;
  }>;
  error?: string;
}> {
  try {
    let query = supabase
      .from('email_audit')
      .select(
        'id, source_email, to_addresses, subject, template_type, status, message_id, error_message, created_at, sent_at'
      )
      .eq('ws_id', wsId)
      .order('created_at', { ascending: false });

    if (options?.status) {
      query = query.eq('status', options.status);
    }

    if (options?.templateType) {
      query = query.eq('template_type', options.templateType);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.range(
        options.offset,
        options.offset + (options.limit || 50) - 1
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error('[EmailAudit] Error getting records:', error);
      return { records: [], error: error.message };
    }

    return { records: data || [] };
  } catch (error) {
    console.error('[EmailAudit] Exception getting records:', error);
    return {
      records: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
