import 'server-only';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { MeetAiError } from './access';

/**
 * A stream whose lease lapsed while it was otherwise live. The client opens
 * a new stream; every other capture refusal is terminal.
 */
export const leaseExpired = () =>
  new MeetAiError(
    409,
    'Your capture stream expired; open a new one',
    'MEET_SELF_LEASE_EXPIRED'
  );

export type UploaderStream = {
  created_at: string;
  state: string;
  lease_expires_at: string;
};

/** The caller's own stream in this session, or null when it is not theirs. */
export async function loadUploaderStream(
  db: TypedSupabaseClient,
  input: { sessionId: string; streamId: string; accountId: string }
): Promise<UploaderStream | null> {
  const { data, error } = await db
    .schema('private')
    .from('meet_ai_capture_streams')
    .select('created_at, state, lease_expires_at')
    .eq('id', input.streamId)
    .eq('session_id', input.sessionId)
    .eq('account_id', input.accountId)
    .maybeSingle();
  if (error) throw new MeetAiError(503, 'Capture stream lookup failed');
  return data;
}

/** A live stream (not closed or revoked) whose lease has run out. */
export function leaseLapsed(stream: UploaderStream | null, now = Date.now()) {
  return (
    !!stream &&
    (stream.state === 'active' || stream.state === 'draining') &&
    !(Date.parse(stream.lease_expires_at) > now)
  );
}
