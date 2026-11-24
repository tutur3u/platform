import 'server-only';
import * as serviceCredential from '@tuturuuu/realtime/meet/service-credential';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { z } from 'zod';
import { getMeetRealtimeTokenSecret } from '../../call/lib/call-session';
import { MeetAiError } from './access';
import {
  selfOutboxEntrySchema,
  writeSelfOutboxEntries,
} from './self-v1-outbox';
import { settleRoomEnds } from './self-v1-room-end';

/** The room sends at most 64 entries per delivery. */
export const MEET_SELF_OUTBOX_MAX_ENTRIES = 64;
/** 64 entries of the documented shape fit well inside this many bytes. */
export const MEET_SELF_OUTBOX_MAX_BYTES = 32 * 1024;

type OutboxClaims = {
  aud: 'meet-service';
  purpose: string;
  roomId: string;
  exp: number;
};
type OutboxVerifier = (token: string, secret?: string) => OutboxClaims | null;

const bodySchema = z
  .object({
    roomId: z.string().min(1).max(200),
    meetingId: z.uuid(),
    entries: z
      .array(selfOutboxEntrySchema.strict())
      .max(MEET_SELF_OUTBOX_MAX_ENTRIES),
  })
  .strict();

const unauthorized = () => new MeetAiError(401, 'Unauthorized');

/**
 * Only the realtime room's own outbox credential is accepted, never a user
 * session. Verification fails closed when the shared verifier is missing.
 */
function verifyCredential(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw unauthorized();
  const verify = (
    serviceCredential as unknown as {
      verifyMeetSelfOutboxCredential?: OutboxVerifier;
    }
  ).verifyMeetSelfOutboxCredential;
  if (typeof verify !== 'function') throw unauthorized();
  let secret: string;
  try {
    secret = getMeetRealtimeTokenSecret();
  } catch {
    throw new MeetAiError(503, 'Meeting room is unavailable');
  }
  let claims: OutboxClaims | null;
  try {
    claims = verify(token, secret);
  } catch {
    claims = null;
  }
  if (
    !claims ||
    claims.aud !== 'meet-service' ||
    claims.purpose !== 'self-outbox' ||
    typeof claims.roomId !== 'string' ||
    typeof claims.exp !== 'number' ||
    claims.exp * 1000 <= Date.now()
  )
    throw unauthorized();
  return claims;
}

async function readBody(request: Request) {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MEET_SELF_OUTBOX_MAX_BYTES)
    throw new MeetAiError(413, 'Payload too large');
  const bytes = await request.arrayBuffer().catch(() => null);
  if (!bytes) throw new MeetAiError(400, 'Invalid request');
  if (bytes.byteLength > MEET_SELF_OUTBOX_MAX_BYTES)
    throw new MeetAiError(413, 'Payload too large');
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new MeetAiError(400, 'Invalid request');
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) throw new MeetAiError(400, 'Invalid request');
  return parsed.data;
}

/**
 * Writes legal outbox entries the realtime room delivers through its service
 * binding when no participant request drained them. The signed credential
 * names the room; the body must name the same room. Each entry's session is
 * resolved from its own session id and must be a per-speaker session of the
 * signed room's meeting, whatever meeting the body names. An entry whose
 * session no longer exists is acknowledged and logged. Writes are idempotent,
 * so a replayed delivery acknowledges the same entries again.
 */
export async function deliverSelfOutbox(request: Request) {
  const claims = verifyCredential(request);
  const body = await readBody(request);
  if (claims.roomId !== body.roomId) throw new MeetAiError(403, 'Forbidden');
  const [wsId, meetingId, ...rest] = claims.roomId.split(':');
  if (
    rest.length ||
    !z.uuid().safeParse(wsId).success ||
    !z.uuid().safeParse(meetingId).success
  )
    throw new MeetAiError(403, 'Forbidden');
  if (!body.entries.length) return { acked: [] };
  const db = await createAdminClient({ noCookie: true });
  const sessionIds = [...new Set(body.entries.map((entry) => entry.sessionId))];
  const { data, error } = await db
    .from('meet_ai_sessions')
    .select('id, meeting_id, protocol')
    .in('id', sessionIds);
  if (error) throw new MeetAiError(503, 'Transcription storage is unavailable');
  const found = new Map((data ?? []).map((row) => [row.id, row]));
  const gone = body.entries.filter((entry) => !found.has(entry.sessionId));
  if (gone.length)
    console.warn('[meet-ai] self_v1 outbox delivery for missing sessions');
  const entries = body.entries.filter((entry) => {
    const session = found.get(entry.sessionId);
    return session?.meeting_id === meetingId && session.protocol === 'self_v1';
  });
  if (entries.length + gone.length < body.entries.length)
    console.warn('[meet-ai] self_v1 outbox delivery skipped foreign entries');
  const written = await writeSelfOutboxEntries(db, entries);
  if (written.failed)
    console.warn('[meet-ai] self_v1 outbox delivery partly pending');
  const settled = await settleRoomEnds(db, written.settled);
  return {
    acked: [...gone, ...settled].map(({ sessionId, accountId, seq }) => ({
      sessionId,
      accountId,
      seq,
    })),
  };
}
