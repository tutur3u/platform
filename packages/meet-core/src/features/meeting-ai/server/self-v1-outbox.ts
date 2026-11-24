import 'server-only';
import { MEET_TRANSCRIPT_NOTICE_VERSION } from '@tuturuuu/realtime/meet';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { z } from 'zod';
import { MeetAiError } from './access';
import { endSessionForRoom } from './self-v1-room-end';
import { MeetSelfRpcError, selfRpc } from './self-v1-rpc';
import {
  type MeetSelfOutboxEntry,
  type MeetSelfRoom,
  selfRoomCommands,
} from './self-v1-room';

export const selfOutboxEntrySchema = z.object({
  sessionId: z.uuid(),
  accountId: z.uuid(),
  seq: z.number().int().positive(),
  kind: z.enum(['withdraw', 'revoke', 'close', 'end']),
  noticeVersion: z.string().min(1).max(100).optional(),
});

/**
 * An entry is settled when the Meet Worker wrote it now, it was an exact
 * duplicate, the account is gone (the database answers recorded=false or
 * false), a newer room sequence already landed for a withdraw or close
 * (40001), or its session no longer exists (P0002). Anything else is retried.
 */
async function writeEntry(db: TypedSupabaseClient, entry: MeetSelfOutboxEntry) {
  const input = {
    sessionId: entry.sessionId,
    accountId: entry.accountId,
    roomSeq: entry.seq,
  };
  try {
    if (entry.kind === 'withdraw')
      await selfRpc.recordDecision(db, {
        ...input,
        decision: 'withdraw',
        noticeVersion: entry.noticeVersion ?? MEET_TRANSCRIPT_NOTICE_VERSION,
      });
    else if (entry.kind === 'revoke') await selfRpc.revokeUpload(db, input);
    else if (entry.kind === 'close') await selfRpc.closeStream(db, input);
    // The room ended the session: stop the database session too.
    else await endSessionForRoom(db, entry.sessionId);
  } catch (error) {
    if (!(error instanceof MeetSelfRpcError)) throw error;
    if (error.pgCode === '40001' && entry.kind !== 'revoke') {
      console.warn('[meet-ai] self_v1 outbox entry superseded');
      return;
    }
    if (error.pgCode === 'P0002') {
      console.warn('[meet-ai] self_v1 outbox entry for a missing session');
      return;
    }
    throw error;
  }
}

/** Entries from an untrusted list, keeping only well-formed ones. */
export function parseSelfOutboxEntries(pending: unknown[]) {
  return pending.flatMap((value) => {
    const parsed = selfOutboxEntrySchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Writes legal entries in room sequence order per session and account. A
 * failed entry stops that account's later entries in its session so order is
 * never broken. Returns the entries that landed and whether any stayed pending.
 */
export async function writeSelfOutboxEntries(
  db: TypedSupabaseClient,
  entries: MeetSelfOutboxEntry[]
) {
  const groups = new Map<string, MeetSelfOutboxEntry[]>();
  for (const entry of entries) {
    const key = `${entry.sessionId}:${entry.accountId}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const settled: MeetSelfOutboxEntry[] = [];
  let failed = false;
  await Promise.all(
    [...groups.values()].map(async (list) => {
      for (const entry of list.sort((a, b) => a.seq - b.seq)) {
        try {
          await writeEntry(db, entry);
          settled.push(entry);
        } catch {
          failed = true;
          return;
        }
      }
    })
  );
  return { settled, failed };
}

/**
 * Writes the room's pending legal entries for one session, then acknowledges
 * the ones that landed; the room keeps the rest for the next drain point.
 * Throws 503 when any entry stayed pending.
 */
export async function drainSelfOutbox(
  db: TypedSupabaseClient,
  room: MeetSelfRoom,
  sessionId: string,
  pending: unknown[]
) {
  const entries = parseSelfOutboxEntries(pending).filter(
    (entry) => entry.sessionId === sessionId
  );
  if (!entries.length) return;
  const written = await writeSelfOutboxEntries(db, entries);
  const settled = written.settled;
  const failed = written.failed;
  try {
    await selfRoomCommands.ack(
      room,
      sessionId,
      settled.map(({ accountId, seq }) => ({ accountId, seq }))
    );
  } catch {
    // The room redelivers unacknowledged entries; writes are idempotent.
    console.warn('[meet-ai] self_v1 outbox acknowledgement pending');
  }
  if (failed)
    throw new MeetAiError(
      503,
      'Transcription consent could not be recorded',
      'MEET_SELF_UNAVAILABLE'
    );
}
