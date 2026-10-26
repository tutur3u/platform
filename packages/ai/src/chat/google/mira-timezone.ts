import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { isValidTimezone } from '@tuturuuu/utils/timezone';

export type MiraTimezoneSource = 'request' | 'user' | 'workspace' | 'none';

const MAX_TIMEZONE_LENGTH = 64;

function explicitTimezone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const timezone = value.trim();
  if (
    !timezone ||
    timezone === 'auto' ||
    timezone.length > MAX_TIMEZONE_LENGTH ||
    !isValidTimezone(timezone)
  ) {
    return null;
  }
  return timezone;
}

/**
 * Resolves the timezone Mira tools use for relative dates.
 *
 * A valid client timezone wins because `auto` preferences follow the device.
 * Otherwise the saved personal preference, then the workspace preference, is
 * used. `auto`, invalid, or unreadable values fall through; `none` keeps the
 * executors' existing UTC fallback.
 */
export async function resolveMiraTimezone({
  requestTimezone,
  supabase,
  userId,
  wsId,
}: {
  requestTimezone?: string | null;
  supabase: TypedSupabaseClient;
  userId: string;
  wsId?: string | null;
}): Promise<{ source: MiraTimezoneSource; timezone?: string }> {
  const requested = explicitTimezone(requestTimezone);
  if (requested) return { source: 'request', timezone: requested };

  try {
    const { data, error } = await supabase
      .from('user_private_details')
      .select('timezone')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    const personal = explicitTimezone(data?.timezone);
    if (personal) return { source: 'user', timezone: personal };
  } catch (error) {
    console.warn('Failed to read personal timezone for Mira', error);
  }

  if (wsId) {
    try {
      const { data, error } = await supabase
        .from('workspaces')
        .select('timezone')
        .eq('id', wsId)
        .maybeSingle();
      if (error) throw error;
      const workspace = explicitTimezone(data?.timezone);
      if (workspace) return { source: 'workspace', timezone: workspace };
    } catch (error) {
      console.warn('Failed to read workspace timezone for Mira', error);
    }
  }

  return { source: 'none' };
}
