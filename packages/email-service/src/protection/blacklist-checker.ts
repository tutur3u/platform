/**
 * Email Blacklist Checker
 *
 * Validates emails against the blacklist database.
 * Uses existing RPC functions for batch checking.
 */

import type { SupabaseClient } from '@tuturuuu/supabase';
import type { Database } from '@tuturuuu/types';

import { EMAIL_REGEX } from '../constants';
import type { BlacklistCheckResult, BlacklistedEmail } from '../types';

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
      // Use existing RPC function for batch checking
      const { data: blockStatuses, error } = await supabase.rpc(
        'get_email_block_statuses',
        { p_emails: validEmails }
      );

      if (error) {
        console.error('[BlacklistChecker] RPC error:', error);
        // Fail open - allow emails but log the issue
        console.warn(
          '[BlacklistChecker] Failing open due to DB error - allowing all valid emails'
        );
        return { allowed: validEmails, blocked: invalidEmails };
      }

      const result: BlacklistCheckResult = {
        allowed: [],
        blocked: [...invalidEmails],
      };

      // Process RPC results
      if (blockStatuses && Array.isArray(blockStatuses)) {
        for (const status of blockStatuses) {
          // Skip entries with null email (shouldn't happen but be safe)
          if (!status.email) continue;

          if (status.is_blocked) {
            // Determine entry type from reason (if it contains 'domain' it's a domain block)
            const isDomainBlock =
              status.reason?.toLowerCase().includes('domain') ?? false;
            result.blocked.push({
              email: status.email,
              reason: status.reason || 'Blacklisted',
              entryType: isDomainBlock ? 'domain' : 'email',
            });
          } else {
            result.allowed.push(status.email);
          }
        }
      } else {
        // If no results returned, assume all valid emails are allowed
        result.allowed = validEmails;
      }

      return result;
    } catch (error) {
      console.error('[BlacklistChecker] Error checking blacklist:', error);
      // Fail open - allow emails but log the issue
      console.warn(
        '[BlacklistChecker] Failing open due to exception - allowing all valid emails'
      );
      return { allowed: validEmails, blocked: invalidEmails };
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

      if (error) {
        console.error('[BlacklistChecker] RPC error:', error);
        // Fail open
        return { allowed: true };
      }

      return {
        allowed: !isBlocked,
        reason: isBlocked ? 'Email is blacklisted' : undefined,
      };
    } catch (error) {
      console.error('[BlacklistChecker] Error checking email:', error);
      // Fail open
      return { allowed: true };
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
