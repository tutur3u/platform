/**
 * Email Blacklist Checker
 *
 * Validates emails against the blacklist database.
 * Uses existing RPC functions for batch checking.
 */

import type { SupabaseClient } from '@tuturuuu/supabase';
import type { Database } from '@tuturuuu/types';
import { z } from 'zod';

import { EMAIL_REGEX } from '../constants';
import type { BlacklistCheckResult, BlacklistedEmail } from '../types';

const suppressionStatusSchema = z.object({
  email: z.string(),
  is_blocked: z.boolean(),
  reason: z.string().nullish(),
});

function suppressionUnavailable(): Error {
  return new Error('Email suppression lookup unavailable. Try again later.');
}

function parseSuppressionStatuses(data: unknown, requested: Set<string>) {
  const parsed = z.array(suppressionStatusSchema).safeParse(data);
  if (!parsed.success) throw suppressionUnavailable();
  const statuses = new Map<string, z.infer<typeof suppressionStatusSchema>>();
  for (const row of parsed.data) {
    const email = row.email.toLowerCase();
    if (!requested.has(email) || statuses.has(email)) {
      throw suppressionUnavailable();
    }
    statuses.set(email, row);
  }
  if (statuses.size !== requested.size) throw suppressionUnavailable();
  return statuses;
}

// =============================================================================
// Blacklist Checker Class
// =============================================================================

export class BlacklistChecker {
  /**
   * Check multiple emails against the blacklist.
   * Returns lists of allowed and blocked emails.
   *
   * @param emails Array of email addresses to check
   * @param supabase Supabase client (admin client for RLS bypass)
   * @returns Result with allowed and blocked email lists
   */
  async checkEmails(
    emails: string[],
    supabase: SupabaseClient<Database>
  ): Promise<BlacklistCheckResult> {
    if (emails.length === 0) {
      return { allowed: [], blocked: [] };
    }

    // First validate email format
    const validEmails: string[] = [];
    const invalidEmails: BlacklistedEmail[] = [];

    for (const email of emails) {
      if (this.isValidEmailFormat(email)) {
        validEmails.push(email.toLowerCase());
      } else {
        invalidEmails.push({
          email,
          reason: 'Invalid email format',
          entryType: 'email',
        });
      }
    }

    if (validEmails.length === 0) {
      return { allowed: [], blocked: invalidEmails };
    }

    try {
      const requested = new Set(validEmails);
      const { data, error } = await supabase.rpc('get_email_block_statuses', {
        p_emails: [...requested],
      });
      if (error) throw suppressionUnavailable();
      const statuses = parseSuppressionStatuses(data, requested);
      const result: BlacklistCheckResult = {
        allowed: [],
        blocked: [...invalidEmails],
      };
      // Preserve recipient spelling: the service filters the original addresses.
      for (const email of emails) {
        if (!this.isValidEmailFormat(email)) continue;
        const normalized = email.toLowerCase();
        const status = statuses.get(normalized);
        if (!status) throw suppressionUnavailable();
        if (status.is_blocked) {
          result.blocked.push({
            email,
            reason: status.reason || 'Blacklisted',
            entryType: status.reason?.toLowerCase().includes('domain')
              ? 'domain'
              : 'email',
          });
        } else {
          result.allowed.push(normalized);
        }
      }
      return result;
    } catch {
      // Lookup uncertainty is retryable, never permission to contact a recipient.
      throw suppressionUnavailable();
    }
  }

  /**
   * Check a single email against the blacklist.
   *
   * @param email Email address to check
   * @param supabase Supabase client
   * @returns True if allowed, false if blocked
   */
  async checkSingle(
    email: string,
    supabase: SupabaseClient<Database>
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Validate format first
    if (!this.isValidEmailFormat(email)) {
      return { allowed: false, reason: 'Invalid email format' };
    }

    try {
      const { data: isBlocked, error } = await supabase.rpc(
        'check_email_blocked',
        { p_email: email.toLowerCase() }
      );

      if (error || typeof isBlocked !== 'boolean') {
        throw suppressionUnavailable();
      }
      return {
        allowed: !isBlocked,
        reason: isBlocked ? 'Email is blacklisted' : undefined,
      };
    } catch {
      throw suppressionUnavailable();
    }
  }

  /**
   * Add an email or domain to the blacklist.
   *
   * @param entry Email or domain to blacklist
   * @param entryType Type of entry ('email' or 'domain')
   * @param reason Reason for blacklisting
   * @param userId User ID who added the entry
   * @param supabase Supabase client
   */
  async addToBlacklist(
    entry: string,
    entryType: 'email' | 'domain',
    reason: string,
    userId: string,
    supabase: SupabaseClient<Database>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.from('email_blacklist').insert({
        entry_type: entryType,
        value: entry.toLowerCase(),
        reason,
        added_by_user_id: userId,
      });

      if (error) {
        if (error.code === '23505') {
          return { success: false, error: 'Entry already exists in blacklist' };
        }
        console.error('[BlacklistChecker] Insert error:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('[BlacklistChecker] Error adding to blacklist:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Remove an entry from the blacklist.
   *
   * @param id Blacklist entry ID
   * @param supabase Supabase client
   */
  async removeFromBlacklist(
    id: string,
    supabase: SupabaseClient<Database>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('email_blacklist')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('[BlacklistChecker] Delete error:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('[BlacklistChecker] Error removing from blacklist:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get all blacklist entries.
   *
   * @param supabase Supabase client
   * @param options Pagination and filtering options
   */
  async getBlacklistEntries(
    supabase: SupabaseClient<Database>,
    options?: {
      entryType?: 'email' | 'domain';
      limit?: number;
      offset?: number;
    }
  ): Promise<{
    entries: Array<{
      id: string;
      entry_type: string;
      value: string;
      reason: string | null;
      created_at: string;
    }>;
    error?: string;
  }> {
    try {
      let query = supabase
        .from('email_blacklist')
        .select('id, entry_type, value, reason, created_at')
        .order('created_at', { ascending: false });

      if (options?.entryType) {
        query = query.eq('entry_type', options.entryType);
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
        console.error('[BlacklistChecker] Query error:', error);
        return { entries: [], error: error.message };
      }

      return { entries: data || [] };
    } catch (error) {
      console.error('[BlacklistChecker] Error getting blacklist:', error);
      return {
        entries: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Validate email format.
   */
  private isValidEmailFormat(email: string): boolean {
    if (!email || typeof email !== 'string') {
      return false;
    }
    return EMAIL_REGEX.test(email);
  }
}
