import 'server-only';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
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
  if (!session.user_id) return false;
  if (
    session.capture_state !== 'active' &&
    session.capture_state !== 'draining'
  ) {
    // Already stopped: make sure it is also closed once drained.
    if (session.capture_state !== 'closed')
      await selfRpc.closeDrained(db, session.id).catch(() => undefined);
    return false;
  }
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
 * The room's `end` entry: the room ended this per-speaker session (room end,
 * restore, replacement or its deadline). The database session is stopped
 * hard for its own host and closed as drained. Idempotent: a missing or
 * already closed session is settled as is. A participant's `close` entry
 * never ends a session; leave, heartbeat expiry and a lost open all emit it.
 */
export async function endSessionForRoom(
  db: TypedSupabaseClient,
  sessionId: string
) {
  const { data: session, error } = await db
    .from('meet_ai_sessions')
    .select('id, user_id, capture_state, protocol')
    .eq('id', sessionId)
    .eq('protocol', 'self_v1')
    .maybeSingle();
  if (error) throw error;
  if (!session) return false;
  return closeSessionEndedByRoom(db, session);
}
