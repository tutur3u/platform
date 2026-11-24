import 'server-only';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { MeetSelfOutboxEntry } from './self-v1-room';
import { selfRpc } from './self-v1-rpc';

/**
 * Hard-stops a per-speaker session the room no longer runs, then closes it
 * as drained. The room is the authority that it ended, so the stop is made
 * for the session's own host. A session that is already closed is left as is.
 */
export async function closeSessionEndedByRoom(
  db: TypedSupabaseClient,
  session: { id: string; user_id: string | null; capture_state: string | null }
) {
  if (
    !session.user_id ||
    (session.capture_state !== 'active' && session.capture_state !== 'draining')
  )
    return false;
  await selfRpc.stopSession(db, {
    sessionId: session.id,
    hostId: session.user_id,
    hard: true,
  });
  try {
    await selfRpc.closeDrained(db, session.id);
  } catch {
    // The hard stop already ended capture; the drained close is bookkeeping.
    console.warn('[meet-ai] self_v1 drained close pending');
  }
  return true;
}

/**
 * The room queues `close` only when a session ends in the room: room end,
 * restore, replacement by a newer session, or an open that lost to an
 * ending. Once those entries land and no live stream is left, the database
 * session is stopped too, so it cannot keep accepting or billing audio until
 * its capture deadline. Returns the sessions whose stop did not complete;
 * their close entries stay unacknowledged so the room delivers them again.
 */
export async function endSessionsClosedByRoom(
  db: TypedSupabaseClient,
  settled: MeetSelfOutboxEntry[]
) {
  const sessionIds = [
    ...new Set(
      settled
        .filter((entry) => entry.kind === 'close')
        .map((entry) => entry.sessionId)
    ),
  ];
  const pending = new Set<string>();
  for (const sessionId of sessionIds) {
    try {
      const { data: session, error } = await db
        .from('meet_ai_sessions')
        .select('id, user_id, capture_state, protocol')
        .eq('id', sessionId)
        .eq('protocol', 'self_v1')
        .maybeSingle();
      if (error) throw error;
      if (!session) continue;
      const { count, error: streamError } = await db
        .schema('private')
        .from('meet_ai_capture_streams')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .in('state', ['active', 'draining'])
        .gt('lease_expires_at', new Date().toISOString());
      if (streamError) throw streamError;
      if ((count ?? 0) > 0) continue;
      await closeSessionEndedByRoom(db, session);
    } catch {
      pending.add(sessionId);
      console.warn('[meet-ai] self_v1 room-ended session stop pending');
    }
  }
  return pending;
}

/** Entries safe to acknowledge once room-ended sessions are handled. */
export async function settleRoomEnds(
  db: TypedSupabaseClient,
  settled: MeetSelfOutboxEntry[]
) {
  const pending = await endSessionsClosedByRoom(db, settled);
  return settled.filter(
    (entry) => !(entry.kind === 'close' && pending.has(entry.sessionId))
  );
}
