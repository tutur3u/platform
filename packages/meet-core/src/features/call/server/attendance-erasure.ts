import 'server-only';
import {
  MEET_SERVICE_TTL_SECONDS,
  signMeetServiceCredential,
  type MeetServiceClaims,
} from '@tuturuuu/realtime/meet/service-credential';
import {
  ATTENDANCE_DIRECTORY_ROOM,
  meetClassAttendanceEnabled,
} from '@tuturuuu/realtime/meet';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getMeetRealtimeTokenSecret,
  getMeetRealtimeUrl,
} from '../lib/call-session';
import { readAttendancePages } from './attendance-scope';
import {
  planMeetingAttendanceRooms,
  planSubjectAttendanceRooms,
  planWorkspaceAttendanceRooms,
  subjectEraseClaims,
  type AttendanceErasurePlan,
  type AttendanceErasureSql,
} from './attendance-erasure-plan';

export type { AttendanceErasurePlan };

type Subject =
  | { userId: string; guestId?: never }
  | { guestId: string; userId?: never };

type QueryError = { message?: string; code?: string } | null;
type SessionRef = { meeting_id: string; ws_id: string; generation?: number };

interface AttendanceFilter extends Promise<{
  data: SessionRef[] | null;
  error: QueryError;
}> {
  select(columns: string): AttendanceFilter;
  insert(rows: unknown[]): Promise<{ error: QueryError }>;
  update(row: Record<string, unknown>): AttendanceFilter;
  delete(): AttendanceFilter;
  eq(column: string, value: string): AttendanceFilter;
  order(column: string): AttendanceFilter;
  range(
    from: number,
    to: number
  ): Promise<{ data: SessionRef[] | null; error: QueryError }>;
}

interface PrivateAttendanceClient {
  schema(name: 'private'): {
    from(
      name: 'meet_attendance_sessions' | 'meet_attendance_fences'
    ): AttendanceFilter;
  };
}

function privateTable(
  db: PrivateAttendanceClient,
  name: 'meet_attendance_sessions' | 'meet_attendance_fences'
) {
  return db.schema('private').from(name);
}

async function admin() {
  return (await createAdminClient({
    noCookie: true,
  })) as unknown as PrivateAttendanceClient;
}

export type AttendanceErasureDeps = {
  enabled: () => boolean;
  listMeetings: (wsId: string) => Promise<string[]>;
  listSessionWorkspaces: (meetingId: string) => Promise<string[]>;
  listSessionsByWorkspace: (
    wsId: string
  ) => Promise<Array<{ wsId: string; meetingId: string }>>;
  listSessionsBySubject: (
    subject: Subject
  ) => Promise<Array<{ wsId: string; meetingId: string }>>;
  directoryRoomIds: (query: {
    userId?: string;
    guestId?: string;
    meetingId?: string;
    wsId?: string;
  }) => Promise<string[]>;
  bumpFence: (wsId: string, meetingId: string) => Promise<void>;
  postRoom: (
    roomId: string,
    extra: Omit<MeetServiceClaims, 'aud' | 'purpose' | 'roomId' | 'exp'>
  ) => Promise<void>;
  forgetRooms: (roomIds: string[]) => Promise<void>;
  deleteSql: (sql: AttendanceErasureSql) => Promise<void>;
};

function serviceEndpoint(pathname: string) {
  const endpoint = new URL(getMeetRealtimeUrl());
  endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:';
  endpoint.pathname = pathname;
  endpoint.search = '';
  return endpoint;
}

function serviceClaims(
  purpose: MeetServiceClaims['purpose'],
  roomId: string,
  extra: Omit<MeetServiceClaims, 'aud' | 'purpose' | 'roomId' | 'exp'> = {}
): MeetServiceClaims {
  return {
    aud: 'meet-service',
    purpose,
    roomId,
    exp: Math.floor(Date.now() / 1000) + MEET_SERVICE_TTL_SECONDS,
    ...extra,
  };
}

async function postJson(
  pathname: string,
  claims: MeetServiceClaims,
  body?: unknown,
  allowMissing = false
) {
  const response = await fetch(serviceEndpoint(pathname), {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${signMeetServiceCredential(
        claims,
        getMeetRealtimeTokenSecret()
      )}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok && !(allowMissing && response.status === 404))
    throw new Error('Meet attendance room copy was not erased');
  if (response.status === 404) return null;
  return response.json().catch(() => null);
}

async function throwIfError(error: QueryError) {
  if (error) throw error;
}

async function listSessionPairs(
  column: string,
  value: string
): Promise<Array<{ wsId: string; meetingId: string }>> {
  const table = privateTable(await admin(), 'meet_attendance_sessions');
  const rows = await readAttendancePages(async (from, to) => {
    const page = await table
      .select('meeting_id, ws_id')
      .eq(column, value)
      .order('meeting_id')
      .order('ws_id')
      .range(from, to);
    await throwIfError(page.error);
    return page.data ?? [];
  });
  return rows.map((row) => ({ wsId: row.ws_id, meetingId: row.meeting_id }));
}

async function directoryRoomIds(query: {
  userId?: string;
  guestId?: string;
  meetingId?: string;
  wsId?: string;
}) {
  const ids: string[] = [];
  for (let cursor = 0; ;) {
    const page = (await postJson(
      '/attendance-index',
      serviceClaims('attendance-index', ATTENDANCE_DIRECTORY_ROOM),
      { op: 'list', ...query, cursor }
    )) as { roomIds?: string[]; cursor?: number | null } | null;
    if (!page) return ids;
    ids.push(...(page.roomIds ?? []));
    if (page.cursor === null || page.cursor === undefined) return ids;
    cursor = page.cursor;
  }
}

async function bumpFence(wsId: string, meetingId: string) {
  const table = privateTable(await admin(), 'meet_attendance_fences');
  const existing = await table
    .select('generation')
    .eq('meeting_id', meetingId)
    .eq('ws_id', wsId);
  await throwIfError(existing.error);
  const generation = (existing.data?.[0]?.generation ?? 0) + 1;
  if (existing.data?.length) {
    const updated = await table
      .update({ generation })
      .eq('meeting_id', meetingId)
      .eq('ws_id', wsId);
    await throwIfError(updated.error);
    return;
  }
  const inserted = await table.insert([
    { meeting_id: meetingId, ws_id: wsId, generation },
  ]);
  await throwIfError(inserted.error);
}

async function deleteSql(sql: AttendanceErasureSql) {
  const table = privateTable(await admin(), 'meet_attendance_sessions');
  if (sql.op === 'meeting') {
    await throwIfError(
      (await table.delete().eq('meeting_id', sql.meetingId)).error
    );
    return;
  }
  if (sql.op === 'workspace') {
    await throwIfError((await table.delete().eq('ws_id', sql.wsId)).error);
    return;
  }
  if (sql.userId)
    await throwIfError((await table.delete().eq('user_id', sql.userId)).error);
  const guestId = sql.guestId ?? sql.userId;
  if (guestId)
    await throwIfError((await table.delete().eq('guest_id', guestId)).error);
}

function defaultDeps(): AttendanceErasureDeps {
  return {
    enabled: () => meetClassAttendanceEnabled(),
    async listMeetings(wsId) {
      const db = await createAdminClient({ noCookie: true });
      const meetings = await db
        .from('workspace_meetings')
        .select('id')
        .eq('ws_id', wsId);
      if (meetings.error) throw meetings.error;
      return (meetings.data ?? []).map((row) => row.id);
    },
    async listSessionWorkspaces(meetingId) {
      const pairs = await listSessionPairs('meeting_id', meetingId);
      return pairs.map((row) => row.wsId);
    },
    listSessionsByWorkspace: (wsId) => listSessionPairs('ws_id', wsId),
    async listSessionsBySubject(subject) {
      const rows: Array<{ wsId: string; meetingId: string }> = [];
      if (subject.userId)
        rows.push(...(await listSessionPairs('user_id', subject.userId)));
      const guestId = subject.guestId ?? subject.userId;
      if (guestId) rows.push(...(await listSessionPairs('guest_id', guestId)));
      return rows;
    },
    directoryRoomIds,
    bumpFence,
    async postRoom(roomId, extra) {
      await postJson(
        '/class-service',
        serviceClaims('attendance-erase', roomId, extra),
        undefined,
        true
      );
    },
    async forgetRooms(roomIds) {
      if (!roomIds.length) return;
      await postJson(
        '/attendance-index',
        serviceClaims('attendance-index', ATTENDANCE_DIRECTORY_ROOM),
        { op: 'forget', roomIds }
      );
    },
    deleteSql,
  };
}

export async function prepareMeetingAttendanceErasure(
  wsId: string,
  meetingId: string,
  deps: AttendanceErasureDeps = defaultDeps()
): Promise<AttendanceErasurePlan | null> {
  if (!deps.enabled()) return null;
  const rooms = planMeetingAttendanceRooms({
    wsId,
    meetingId,
    sessionWsIds: await deps.listSessionWorkspaces(meetingId),
    directoryRoomIds: await deps.directoryRoomIds({ meetingId }),
  });
  return { rooms, sql: { op: 'meeting', meetingId } };
}

export async function prepareWorkspaceAttendanceErasure(
  wsId: string,
  deps: AttendanceErasureDeps = defaultDeps()
): Promise<AttendanceErasurePlan | null> {
  if (!deps.enabled()) return null;
  const rooms = planWorkspaceAttendanceRooms({
    wsId,
    meetingIds: await deps.listMeetings(wsId),
    sessionRooms: await deps.listSessionsByWorkspace(wsId),
    directoryRoomIds: await deps.directoryRoomIds({ wsId }),
  });
  return { rooms, sql: { op: 'workspace', wsId } };
}

export async function prepareSubjectAttendanceErasure(
  subject: Subject,
  deps: AttendanceErasureDeps = defaultDeps()
): Promise<AttendanceErasurePlan | null> {
  if (!deps.enabled()) return null;
  if (!subject.userId && !subject.guestId)
    throw new Error('Meet attendance subject is required');
  const rooms = planSubjectAttendanceRooms({
    sessionRooms: await deps.listSessionsBySubject(subject),
    directoryRoomIds: await deps.directoryRoomIds(
      subject.userId ? { userId: subject.userId } : { guestId: subject.guestId }
    ),
  });
  return {
    rooms,
    sql: subject.userId
      ? { op: 'subject', userId: subject.userId }
      : { op: 'subject', guestId: subject.guestId },
  };
}

export async function commitAttendanceErasure(
  plan: AttendanceErasurePlan | null,
  deps: AttendanceErasureDeps = defaultDeps()
) {
  if (!plan || !deps.enabled()) return;
  for (const room of plan.rooms)
    await deps.bumpFence(room.wsId, room.meetingId);
  for (const room of plan.rooms) {
    if (plan.sql.op === 'subject') {
      for (const claim of subjectEraseClaims(plan.sql))
        await deps.postRoom(room.roomId, { erase: 'subject', ...claim });
    } else {
      await deps.postRoom(room.roomId, { erase: 'meeting' });
    }
  }
  await deps.forgetRooms(plan.rooms.map((room) => room.roomId));
  await deps.deleteSql(plan.sql);
}

export async function eraseMeetAttendanceForMeeting(
  wsId: string,
  meetingId: string,
  deps?: AttendanceErasureDeps
) {
  const resolved = deps ?? defaultDeps();
  await commitAttendanceErasure(
    await prepareMeetingAttendanceErasure(wsId, meetingId, resolved),
    resolved
  );
}

export async function eraseMeetAttendanceForWorkspace(
  wsId: string,
  deps?: AttendanceErasureDeps
) {
  const resolved = deps ?? defaultDeps();
  await commitAttendanceErasure(
    await prepareWorkspaceAttendanceErasure(wsId, resolved),
    resolved
  );
}

export async function eraseMeetAttendanceSubject(
  subject: Subject,
  deps?: AttendanceErasureDeps
) {
  const resolved = deps ?? defaultDeps();
  await commitAttendanceErasure(
    await prepareSubjectAttendanceErasure(subject, resolved),
    resolved
  );
}
