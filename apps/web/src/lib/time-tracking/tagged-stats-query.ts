import type { TypedSupabaseClient } from '@tuturuuu/supabase';
import {
  computeTaggedTimeStats,
  type TaggedSession,
  type TaggedTimeStats,
  taggedStatsLookbackDays,
} from './tagged-stats';

const PAGE_SIZE = 1000;
/** A year of four-a-day Pomodoro sessions fits well inside this bound. */
export const MAX_TAGGED_STATS_PAGES = 10;

/** Whether `timezone` is an IANA zone this runtime can format in. */
export function isSupportedTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads the user's finished sessions carrying `tag` in the lookback window,
 * page by page and bounded, then computes their stats.
 */
export async function loadTaggedTimeStats(
  sbAdmin: TypedSupabaseClient,
  options: {
    userId: string;
    wsId: string;
    isPersonal: boolean;
    timezone: string;
    tag: string;
    daysBack: number;
    now?: Date;
  }
): Promise<TaggedTimeStats & { truncated: boolean }> {
  const now = options.now ?? new Date();
  const since = new Date(
    now.getTime() - taggedStatsLookbackDays(options.daysBack) * 86_400_000
  ).toISOString();
  const sessions: TaggedSession[] = [];
  // Set when every page came back full: older sessions may be missing.
  let truncated = false;
  for (let page = 0; page < MAX_TAGGED_STATS_PAGES; page++) {
    let query = sbAdmin
      .from('time_tracking_sessions')
      .select('start_time, duration_seconds')
      .eq('user_id', options.userId)
      .contains('tags', [options.tag])
      .not('duration_seconds', 'is', null)
      .gte('start_time', since);
    if (!options.isPersonal) query = query.eq('ws_id', options.wsId);
    const { data, error } = await query
      .order('start_time', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw error;
    sessions.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) break;
    truncated = page === MAX_TAGGED_STATS_PAGES - 1;
  }
  return {
    ...computeTaggedTimeStats(sessions, {
      timezone: options.timezone,
      now,
      daysBack: options.daysBack,
    }),
    truncated,
  };
}
