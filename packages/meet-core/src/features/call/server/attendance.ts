import 'server-only';
import type { AttendanceInterval } from '@tuturuuu/realtime/meet';
import {
  ATTENDANCE_RETENTION_MS,
  aggregateAttendance,
  meetClassAttendanceEnabled,
} from '@tuturuuu/realtime/meet';
import {
  MEET_SERVICE_TTL_SECONDS,
  signMeetServiceCredential,
} from '@tuturuuu/realtime/meet/service-credential';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MeetCallAccessError } from '../lib/call-access';
import {
  getMeetRealtimeTokenSecret,
  getMeetRealtimeUrl,
} from '../lib/call-session';
import {
  planAttendanceUpsert,
  readAttendancePages,
  type AttendanceStoredRow,
} from './attendance-scope';

type SessionRow = {
  source_key: string;
  ws_id?: string;
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
  list(
    meetingId: string,
    wsId: string,
    now: string
  ): Promise<AttendanceInterval[]>;
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

type QueryError = { code?: string; message?: string } | null;
type QueryResult<T> = Promise<{ data: T; error: QueryError }>;
interface AttendanceQuery<T> extends QueryResult<T> {
  select(columns: string): AttendanceQuery<T>;
  insert(rows: unknown[]): QueryResult<null>;
  update(row: unknown): AttendanceQuery<T>;
  delete(): AttendanceQuery<T>;
  eq(column: string, value: string): AttendanceQuery<T>;
  in(column: string, values: string[]): AttendanceQuery<T>;
  lt(column: string, value: string): AttendanceQuery<T>;
  gte(column: string, value: string): AttendanceQuery<T>;
  order(column: string): AttendanceQuery<T>;
  range(from: number, to: number): QueryResult<T>;
}

function attendanceTable(db: {
  schema(name: 'private'): {
    from(
      name: 'meet_attendance_sessions'
    ): AttendanceQuery<SessionRow[] | null>;
  };
}) {
  return db.schema('private').from('meet_attendance_sessions');
}

function rowPayload(meetingId: string, wsId: string, row: AttendanceInterval) {
  return {
    meeting_id: meetingId,
    ws_id: wsId,
    source_key: row.sourceKey,
    participant_kind: row.kind,
    user_id: row.kind === 'member' ? (row.userId ?? null) : null,
    guest_id: row.kind === 'guest' ? (row.guestId ?? null) : null,
    display_name: row.displayName,
    joined_at: row.joinedAt,
    left_at: row.leftAt ?? null,
  };
}

export async function createAttendanceStore(): Promise<AttendanceStore> {
  const db = await createAdminClient({ noCookie: true });
  const table = () =>
    attendanceTable(
      db as unknown as {
        schema(name: 'private'): {
          from(
            name: 'meet_attendance_sessions'
          ): AttendanceQuery<SessionRow[] | null>;
        };
      }
    );
  return {
    async upsert(meetingId, wsId, rows) {
      if (!rows.length) return;
      const existing: AttendanceStoredRow[] = [];
      for (let index = 0; index < rows.length; index += 100) {
        const keys = rows.slice(index, index + 100).map((row) => row.sourceKey);
        existing.push(
          ...(await readAttendancePages(async (from, to) => {
            const { data, error } = await table()
              .select(
                'source_key, ws_id, participant_kind, user_id, guest_id, display_name, joined_at, left_at'
              )
              .eq('meeting_id', meetingId)
              .in('source_key', keys)
              .order('source_key')
              .range(from, to);
            if (error) throw error;
            return (data ?? []).map((row): AttendanceStoredRow => ({
              sourceKey: row.source_key,
              wsId: row.ws_id ?? '',
              kind: row.participant_kind,
              userId: row.user_id,
              guestId: row.guest_id,
              displayName: row.display_name,
              joinedAt: row.joined_at,
              leftAt: row.left_at,
            }));
          }))
        );
      }
      const plan = planAttendanceUpsert(existing, rows, wsId);
      if (plan.insert.length) {
        const { error } = await table().insert(
          plan.insert.map((row) => rowPayload(meetingId, wsId, row))
        );
        if (error) throw error;
      }
      for (const row of plan.update) {
        const { error } = await table()
          .update({
            participant_kind: row.kind,
            user_id: row.kind === 'member' ? (row.userId ?? null) : null,
            guest_id: row.kind === 'guest' ? (row.guestId ?? null) : null,
            display_name: row.displayName,
            joined_at: row.joinedAt,
            left_at: row.leftAt ?? null,
          })
          .eq('meeting_id', meetingId)
          .eq('ws_id', wsId)
          .eq('source_key', row.sourceKey);
        if (error) throw error;
      }
    },
    async list(meetingId, wsId, now) {
      const cutoff = new Date(
        Date.parse(now) - ATTENDANCE_RETENTION_MS
      ).toISOString();
      const removed = await table()
        .delete()
        .eq('meeting_id', meetingId)
        .eq('ws_id', wsId)
        .lt('joined_at', cutoff);
      if (removed.error) throw removed.error;
      const pages = await readAttendancePages(async (from, to) => {
        const { data, error } = await table()
          .select(
            'source_key, participant_kind, user_id, guest_id, display_name, joined_at, left_at'
          )
          .eq('meeting_id', meetingId)
          .eq('ws_id', wsId)
          .gte('joined_at', cutoff)
          .order('joined_at')
          .order('source_key')
          .range(from, to);
        if (error) throw error;
        return data ?? [];
      });
      return pages.map(toInterval);
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
  const roomId = `${input.wsId}:${input.meetingId}`;
  const credential = signMeetServiceCredential(
    {
      aud: 'meet-service',
      purpose: 'attendance-ledger',
      roomId,
      exp: Math.floor(Date.now() / 1000) + MEET_SERVICE_TTL_SECONDS,
    },
    getMeetRealtimeTokenSecret()
  );
  const endpoint = new URL(getMeetRealtimeUrl());
  endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:';
  endpoint.pathname = '/class-service';
  endpoint.search = '';
  const response = await fetch(endpoint, {
    method: 'POST',
    cache: 'no-store',
    headers: { Authorization: `Bearer ${credential}` },
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
  if (!meetClassAttendanceEnabled())
    throw new MeetCallAccessError(404, 'Attendance is unavailable');
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
    const stored = await store.list(input.meetingId, input.wsId, input.now);
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
