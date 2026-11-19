import 'server-only';
import type { AttendanceInterval } from '@tuturuuu/realtime/meet';
import { aggregateAttendance } from '@tuturuuu/realtime/meet';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MeetCallAccessError } from '../lib/call-access';
import { getMeetCallSession } from '../lib/call-session';

type SessionRow = {
  source_key: string;
  participant_kind: 'member' | 'guest';
  user_id: string | null;
  guest_id: string | null;
  display_name: string;
  joined_at: string;
  left_at: string | null;
};

export type AttendanceStore = {
  upsert(
    meetingId: string,
    wsId: string,
    rows: AttendanceInterval[]
  ): Promise<void>;
  list(meetingId: string): Promise<AttendanceInterval[]>;
};

function isMissingTable(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: string }).code)
      : '';
  return code === '42P01' || code === 'PGRST205';
}

function toInterval(row: SessionRow): AttendanceInterval {
  const deviceUserId =
    row.source_key.length > 37 && row.source_key[36] === ':'
      ? row.source_key.slice(0, 36)
      : row.source_key;
  return {
    sourceKey: row.source_key,
    deviceUserId,
    kind: row.participant_kind,
    displayName: row.display_name,
    joinedAt: row.joined_at,
    ...(row.left_at ? { leftAt: row.left_at } : {}),
    ...(row.participant_kind === 'member'
      ? { userId: row.user_id ?? undefined }
      : { guestId: row.guest_id ?? undefined }),
  };
}

export async function createAttendanceStore(): Promise<AttendanceStore> {
  const db = await createAdminClient({ noCookie: true });
  const table = db.schema('private') as unknown as {
    from(name: 'meet_attendance_sessions'): {
      upsert(
        rows: unknown[],
        options: { onConflict: string }
      ): Promise<{ error: { code?: string; message?: string } | null }>;
      select(columns: string): {
        eq(
          column: string,
          value: string
        ): {
          order(column: string): Promise<{
            data: SessionRow[] | null;
            error: { code?: string; message?: string } | null;
          }>;
        };
      };
    };
  };
  return {
    async upsert(meetingId, wsId, rows) {
      if (!rows.length) return;
      const { error } = await table.from('meet_attendance_sessions').upsert(
        rows.map((row) => ({
          meeting_id: meetingId,
          ws_id: wsId,
          source_key: row.sourceKey,
          participant_kind: row.kind,
          user_id: row.kind === 'member' ? (row.userId ?? null) : null,
          guest_id: row.kind === 'guest' ? (row.guestId ?? null) : null,
          display_name: row.displayName,
          joined_at: row.joinedAt,
          left_at: row.leftAt ?? null,
        })),
        { onConflict: 'meeting_id,source_key' }
      );
      if (error) throw error;
    },
    async list(meetingId) {
      const { data, error } = await table
        .from('meet_attendance_sessions')
        .select(
          'source_key, participant_kind, user_id, guest_id, display_name, joined_at, left_at'
        )
        .eq('meeting_id', meetingId)
        .order('joined_at');
      if (error) throw error;
      return (data ?? []).map(toInterval);
    },
  };
}

async function readRoomLedger(input: {
  meetingId: string;
  wsId: string;
  userId: string;
  isHost: boolean;
  displayName: string;
  canReadWorkspace: boolean;
  coHost: boolean;
}) {
  const session = await getMeetCallSession({
    meetingId: input.meetingId,
    wsId: input.wsId,
    userId: input.userId,
    isHost: input.isHost,
    displayName: input.displayName,
    service: true,
    workspaceMember: input.canReadWorkspace,
    coHost: input.coHost,
    participantKind:
      input.isHost || input.canReadWorkspace ? 'member' : 'guest',
  });
  const endpoint = new URL(session.realtimeUrl);
  endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:';
  endpoint.pathname = '/room-state';
  endpoint.search = '';
  const response = await fetch(endpoint, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${session.token}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { attendance?: unknown };
  return Array.isArray(body.attendance)
    ? (body.attendance as AttendanceInterval[])
    : null;
}

export async function syncMeetAttendance(
  input: {
    meetingId: string;
    wsId: string;
    userId: string;
    isHost: boolean;
    displayName: string;
    canReadWorkspace: boolean;
    coHost: boolean;
    now: string;
  },
  deps?: {
    readLedger: () => Promise<AttendanceInterval[] | null>;
    store: AttendanceStore;
  }
) {
  const readLedger = deps?.readLedger ?? (() => readRoomLedger(input));
  const store = deps?.store ?? (await createAttendanceStore());
  const ledger = await readLedger().catch(() => null);
  if (ledger?.length) {
    try {
      await store.upsert(input.meetingId, input.wsId, ledger);
    } catch (error) {
      if (isMissingTable(error))
        throw new MeetCallAccessError(503, 'Attendance is unavailable');
      throw error;
    }
  }
  try {
    const stored = await store.list(input.meetingId);
    return aggregateAttendance(
      stored.length ? stored : (ledger ?? []),
      input.now
    );
  } catch (error) {
    if (isMissingTable(error))
      throw new MeetCallAccessError(503, 'Attendance is unavailable');
    if (ledger) return aggregateAttendance(ledger, input.now);
    throw error;
  }
}
