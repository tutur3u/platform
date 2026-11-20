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
import { readAttendancePages } from './attendance-scope';

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
    rows: AttendanceInterval[],
    epoch?: number
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

interface PrivateAttendanceDb {
  schema(name: 'private'): {
    from(
      name: 'meet_attendance_sessions'
    ): AttendanceQuery<SessionRow[] | null>;
    rpc(
      fn: 'commit_meet_attendance_upsert',
      args: {
        p_meeting_id: string;
        p_ws_id: string;
        p_epoch: number;
        p_rows: unknown[];
      }
    ): Promise<{ data: null; error: QueryError }>;
  };
}

function attendanceTable(db: PrivateAttendanceDb) {
  return db.schema('private').from('meet_attendance_sessions');
}

function isFenced(error: QueryError) {
  return (
    error?.code === '40001' ||
    (error?.message ?? '').includes('Meet attendance sync was fenced')
  );
}

function upsertPayload(row: AttendanceInterval) {
  return {
    sourceKey: row.sourceKey,
    kind: row.kind,
    userId: row.kind === 'member' ? (row.userId ?? null) : null,
    guestId: row.kind === 'guest' ? (row.guestId ?? null) : null,
    displayName: row.displayName,
    joinedAt: row.joinedAt,
    leftAt: row.leftAt ?? null,
  };
}

export async function createAttendanceStore(): Promise<AttendanceStore> {
  const db = await createAdminClient({ noCookie: true });
  const typed = db as unknown as PrivateAttendanceDb;
  const table = () => attendanceTable(typed);
  return {
    async upsert(meetingId, wsId, rows, epoch = 0) {
      if (!rows.length) return;
      const written = await typed
        .schema('private')
        .rpc('commit_meet_attendance_upsert', {
          p_meeting_id: meetingId,
          p_ws_id: wsId,
          p_epoch: epoch,
          p_rows: rows.map(upsertPayload),
        });
      if (isFenced(written.error))
        throw new Error('Meet attendance sync was fenced');
      if (written.error) throw written.error;
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
      actorUserId: input.userId,
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
  if (response.status === 429)
    throw new MeetCallAccessError(429, 'Too many requests');
  if (!response.ok) return null;
  const body = (await response.json()) as {
    attendance?: unknown;
    epoch?: unknown;
    endedAt?: unknown;
  };
  if (!Array.isArray(body.attendance)) return null;
  return {
    intervals: body.attendance as AttendanceInterval[],
    epoch: typeof body.epoch === 'number' ? body.epoch : 0,
    endedAt: typeof body.endedAt === 'string' ? body.endedAt : undefined,
  };
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
    readLedger: () => Promise<
      | AttendanceInterval[]
      | {
          intervals: AttendanceInterval[];
          epoch?: number;
          endedAt?: string;
        }
      | null
    >;
    store: AttendanceStore;
  }
) {
  if (!meetClassAttendanceEnabled())
    throw new MeetCallAccessError(404, 'Attendance is unavailable');
  const readLedger = deps?.readLedger ?? (() => readRoomLedger(input));
  const store = deps?.store ?? (await createAttendanceStore());
  const read = await readLedger().catch((error: unknown) => {
    if (error instanceof MeetCallAccessError && error.status === 429)
      throw error;
    return null;
  });
  const ledger = Array.isArray(read)
    ? { intervals: read, epoch: 0, endedAt: undefined }
    : read;
  if (ledger?.intervals.length) {
    try {
      await store.upsert(
        input.meetingId,
        input.wsId,
        ledger.intervals,
        ledger.epoch ?? 0
      );
    } catch (error) {
      if (isMissingTable(error))
        throw new MeetCallAccessError(503, 'Attendance is unavailable');
      if (
        error instanceof Error &&
        error.message === 'Meet attendance sync was fenced'
      )
        throw error;
      throw error;
    }
  }
  try {
    const stored = await store.list(input.meetingId, input.wsId, input.now);
    return aggregateAttendance(
      stored.length ? stored : (ledger?.intervals ?? []),
      input.now,
      ledger?.endedAt
    );
  } catch (error) {
    if (isMissingTable(error))
      throw new MeetCallAccessError(503, 'Attendance is unavailable');
    if (ledger)
      return aggregateAttendance(ledger.intervals, input.now, ledger.endedAt);
    throw error;
  }
}
