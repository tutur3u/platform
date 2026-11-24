import 'server-only';
import { MEET_TRANSCRIPT_NOTICE_VERSION } from '@tuturuuu/realtime/meet';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { z } from 'zod';
import { MeetAiError } from './access';
import { MeetSelfRpcError, selfRpc } from './self-v1-rpc';
import {
  type MeetSelfOutboxEntry,
  type MeetSelfRoom,
  selfRoomCommands,
} from './self-v1-room';

const entrySchema = z.object({
  sessionId: z.uuid(),
  accountId: z.uuid(),
  seq: z.number().int().positive(),
  kind: z.enum(['withdraw', 'revoke', 'close']),
  noticeVersion: z.string().min(1).max(100).optional(),
});

/**
 * An entry is settled when it was written now, was an exact duplicate, or a
 * newer room sequence already landed for that account (40001), which means
 * this older entry can never take effect.
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
    else await selfRpc.closeStream(db, input);
  } catch (error) {
    if (error instanceof MeetSelfRpcError && error.pgCode === '40001') {
      console.warn('[meet-ai] self_v1 outbox entry superseded');
      return;
    }
    throw error;
  }
}

/**
 * Writes the room's pending legal entries for one session, in room sequence
 * order per account, then acknowledges the ones that landed. A failed entry
 * stops that account's later entries so order is never broken; the room keeps
 * the rest for the next drain point. Throws 503 when any entry stayed pending.
 */
export async function drainSelfOutbox(
  db: TypedSupabaseClient,
  room: MeetSelfRoom,
  sessionId: string,
  pending: unknown[]
) {
  const entries = pending.flatMap((value) => {
    const parsed = entrySchema.safeParse(value);
    return parsed.success && parsed.data.sessionId === sessionId
      ? [parsed.data]
      : [];
  });
  if (!entries.length) return;
  const byAccount = new Map<string, MeetSelfOutboxEntry[]>();
  for (const entry of entries)
    byAccount.set(entry.accountId, [
      ...(byAccount.get(entry.accountId) ?? []),
      entry,
    ]);
  const settled: Array<{ accountId: string; seq: number }> = [];
  let failed = false;
  await Promise.all(
    [...byAccount.values()].map(async (list) => {
      for (const entry of list.sort((a, b) => a.seq - b.seq)) {
        try {
          await writeEntry(db, entry);
          settled.push({ accountId: entry.accountId, seq: entry.seq });
        } catch {
          failed = true;
          return;
        }
      }
    })
  );
  try {
    await selfRoomCommands.ack(room, sessionId, settled);
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
