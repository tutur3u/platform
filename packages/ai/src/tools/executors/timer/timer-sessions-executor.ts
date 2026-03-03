import type { MiraToolContext } from '../../mira-tools';
import { coerceOptionalString, normalizeCursor } from './timer-helpers';

export async function executeListTimeTrackingSessions(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const includePending = Boolean(args.includePending);
  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
  const cursor = args.cursor;

  let query = ctx.supabase
    .from('time_tracking_sessions')
    .select(
      `
      id, title, description, start_time, end_time, duration_seconds,
      is_running, category_id, task_id, pending_approval, ws_id,
      category:time_tracking_categories(id, name, color),
      task:tasks(id, name)
    `
    )
    .eq('ws_id', ctx.wsId)
    .eq('user_id', ctx.userId)
    .order('start_time', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (!includePending) {
    query = query.eq('pending_approval', false);
  }

  if (cursor !== undefined) {
    const normalized = normalizeCursor(cursor);
    if (!normalized.ok) return { error: normalized.error };

    const esc = (value: string) =>
      value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    query = query.or(
      `start_time.lt."${esc(normalized.lastStartTime)}",and(start_time.eq."${esc(normalized.lastStartTime)}",id.lt."${esc(normalized.lastId)}")`
    );
  }

  const { data, error } = await query;
  if (error) return { error: error.message };

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const sessions = hasMore ? rows.slice(0, limit) : rows;
  const last = sessions[sessions.length - 1];

  return {
    success: true,
    count: sessions.length,
    sessions,
    hasMore,
    nextCursor: last ? `${last.start_time}|${last.id}` : null,
  };
}

export async function executeGetTimeTrackingSession(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const sessionIdNormalized = coerceOptionalString(args.sessionId);
  const idNormalized = coerceOptionalString(args.id);
  const sessionId = sessionIdNormalized ?? idNormalized;
  if (!sessionId) return { error: 'sessionId is required' };

  const { data, error } = await ctx.supabase
    .from('time_tracking_sessions')
    .select(
      `
      *,
      category:time_tracking_categories(*),
      task:tasks(*)
    `
    )
    .eq('id', sessionId)
    .eq('ws_id', ctx.wsId)
    .eq('user_id', ctx.userId)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: 'Session not found' };

  return { success: true, session: data };
}
