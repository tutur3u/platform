import 'server-only';
import {
  MEET_SERVICE_TTL_SECONDS,
  signMeetServiceCredential,
  type MeetServiceClaims,
} from '@tuturuuu/realtime/meet/service-credential';
import { ATTENDANCE_DIRECTORY_ROOM } from '@tuturuuu/realtime/meet';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getMeetRealtimeTokenSecret,
  getMeetRealtimeUrl,
} from '../lib/call-session';
import { readAttendancePages } from './attendance-scope';
import {
  attendanceErasureKey,
  eraseClaimKey,
  planMeetingAttendanceRooms,
  planSubjectAttendanceRooms,
  planWorkspaceAttendanceRooms,
  subjectEraseClaims,
  type AttendanceErasurePlan,
  type AttendanceErasureSql,
} from './attendance-erasure-plan';

export type { AttendanceErasurePlan };

export const ATTENDANCE_ERASURE_FANOUT = 4;
export const ATTENDANCE_ERASURE_ATTEMPTS = 8;

type Subject =
  | { userId: string; guestId?: never }
  | { guestId: string; userId?: never };

type QueryError = { message?: string; code?: string } | null;
type SessionRef = { meeting_id: string; ws_id: string };
type PendingRef = { plan?: AttendanceErasurePlan };

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

interface PendingQuery extends Promise<{
  data: PendingRef[] | null;
  error: QueryError;
}> {
  select(columns: string): PendingQuery;
  eq(column: string, value: string): PendingQuery;
  filter(column: string, operator: string, value: string): PendingQuery;
  order(column: string): PendingQuery;
  limit(count: number): PendingQuery;
  delete(): PendingQuery;
}

interface PrivateSchema {
  from(
    name: 'meet_attendance_sessions' | 'meet_attendance_fences'
  ): AttendanceFilter;
  from(name: 'meet_attendance_pending_erasures'): {
    select(columns: string): PendingQuery;
    upsert(
      row: unknown,
      options: { onConflict: string }
    ): Promise<{ error: QueryError }>;
    delete(): PendingQuery;
  };
  rpc(
    fn: 'bump_meet_attendance_fence',
    args: { p_meeting_id: string; p_ws_id: string }
  ): Promise<{ data: number | string | null; error: QueryError }>;
}

interface PrivateAttendanceClient {
  schema(name: 'private'): PrivateSchema;
}

function privateSchema(db: PrivateAttendanceClient) {
  return db.schema('private');
}

async function admin() {
  return (await createAdminClient({
    noCookie: true,
  })) as unknown as PrivateAttendanceClient;
}

export type AttendanceErasureDeps = {
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
  bumpFence: (wsId: string, meetingId: string) => Promise<number>;
  postRoom: (
    roomId: string,
    extra: Omit<MeetServiceClaims, 'aud' | 'purpose' | 'roomId' | 'exp'>
  ) => Promise<void>;
  queueRooms: (plan: AttendanceErasurePlan) => Promise<void>;
  forgetRooms: (roomIds: string[]) => Promise<void>;
  deleteSql: (sql: AttendanceErasureSql) => Promise<void>;
  readPending: (
    sql: AttendanceErasureSql
  ) => Promise<AttendanceErasurePlan | null>;
  savePending: (plan: AttendanceErasurePlan) => Promise<void>;
  finishPending: (sql: AttendanceErasureSql) => Promise<void>;
  listConfirmedPending: (limit: number) => Promise<AttendanceErasurePlan[]>;
};

export type BegunAttendanceErasure = {
  plan: AttendanceErasurePlan;
  preexisting: boolean;
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
  body?: unknown
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
  if (!response.ok) throw new Error('Meet attendance room copy was not erased');
  return response.json().catch(() => null);
}

async function throwIfError(error: QueryError) {
  if (error) throw error;
}

async function listSessionPairs(
  column: string,
  value: string
): Promise<Array<{ wsId: string; meetingId: string }>> {
  const table = privateSchema(await admin()).from('meet_attendance_sessions');
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
    )) as { roomIds?: unknown; cursor?: number | null } | null;
    if (!page || !Array.isArray(page.roomIds))
      throw new Error('Meet attendance directory was not listed');
    ids.push(...page.roomIds.filter((id) => typeof id === 'string'));
    if (page.cursor === null || page.cursor === undefined) return ids;
    cursor = page.cursor;
  }
}

async function bumpFence(wsId: string, meetingId: string) {
  const bumped = await privateSchema(await admin()).rpc(
    'bump_meet_attendance_fence',
    { p_meeting_id: meetingId, p_ws_id: wsId }
  );
  await throwIfError(bumped.error);
  const generation =
    typeof bumped.data === 'number' ? bumped.data : Number(bumped.data);
  if (!Number.isInteger(generation) || generation < 1)
    throw new Error('Meet attendance fence generation was not returned');
  return generation;
}

function pendingTable(db: PrivateAttendanceClient) {
  return privateSchema(db).from('meet_attendance_pending_erasures');
}

async function readPending(sql: AttendanceErasureSql) {
  const key = attendanceErasureKey(sql);
  const read = await pendingTable(await admin())
    .select('plan')
    .eq('kind', key.kind)
    .eq('subject_key', key.subjectKey);
  await throwIfError(read.error);
  return read.data?.[0]?.plan ?? null;
}

async function savePending(plan: AttendanceErasurePlan) {
  const key = attendanceErasureKey(plan.sql);
  await throwIfError(
    (
      await pendingTable(await admin()).upsert(
        { kind: key.kind, subject_key: key.subjectKey, plan },
        { onConflict: 'kind,subject_key' }
      )
    ).error
  );
}

async function finishPending(sql: AttendanceErasureSql) {
  const key = attendanceErasureKey(sql);
  await throwIfError(
    (
      await pendingTable(await admin())
        .delete()
        .eq('kind', key.kind)
        .eq('subject_key', key.subjectKey)
    ).error
  );
}

async function listConfirmedPending(limit: number) {
  const read = await pendingTable(await admin())
    .select('plan')
    .filter('plan->>phase', 'eq', 'confirmed')
    .order('created_at')
    .limit(limit);
  await throwIfError(read.error);
  return (read.data ?? [])
    .map((row) => row.plan)
    .filter((plan): plan is AttendanceErasurePlan => !!plan);
}

async function deleteSql(sql: AttendanceErasureSql) {
  const table = privateSchema(await admin()).from('meet_attendance_sessions');
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

function claimsFor(plan: AttendanceErasurePlan) {
  if (plan.sql.op !== 'subject')
    return [{ erase: 'meeting' as const, key: 'meeting' }];
  return subjectEraseClaims(plan.sql).map((claim) => ({
    erase: 'subject' as const,
    ...claim,
    key: eraseClaimKey(claim),
  }));
}

function queueClaim(claim: ReturnType<typeof claimsFor>[number]) {
  if (claim.erase === 'meeting') return { erase: claim.erase };
  return {
    erase: claim.erase,
    ...(claim.userId ? { userId: claim.userId } : {}),
    ...(claim.guestId ? { guestId: claim.guestId } : {}),
  };
}

async function queueRooms(plan: AttendanceErasurePlan) {
  const claims = claimsFor(plan).map(queueClaim);
  const rooms: Array<{
    claims: Array<ReturnType<typeof queueClaim>>;
    generation: number;
    roomId: string;
  }> = [];
  for (const room of plan.rooms) {
    if (rooms.length >= 128) break;
    if (room.generation == null) continue;
    rooms.push({
      roomId: room.roomId,
      generation: room.generation,
      claims,
    });
  }
  if (!rooms.length) return;
  await postJson(
    '/attendance-index',
    serviceClaims('attendance-index', ATTENDANCE_DIRECTORY_ROOM),
    { op: 'queue-erase', rooms }
  );
}

function defaultDeps(): AttendanceErasureDeps {
  return {
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
      return (await listSessionPairs('meeting_id', meetingId)).map(
        (row) => row.wsId
      );
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
        serviceClaims('attendance-erase', roomId, extra)
      );
    },
    queueRooms,
    async forgetRooms(roomIds) {
      if (!roomIds.length) return;
      await postJson(
        '/attendance-index',
        serviceClaims('attendance-index', ATTENDANCE_DIRECTORY_ROOM),
        { op: 'forget', roomIds }
      );
    },
    deleteSql,
    readPending,
    savePending,
    finishPending,
    listConfirmedPending,
  };
}

async function mapBounded<T>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<void>
) {
  const queue = [...items];
  let first: unknown;
  let stop = false;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (;;) {
        if (stop) return;
        const item = queue.shift();
        if (!item) return;
        try {
          await run(item);
        } catch (error) {
          first ??= error;
          stop = true;
        }
      }
    }
  );
  await Promise.all(workers);
  if (first) throw first;
}

async function resumeConfirmed(
  deps: AttendanceErasureDeps,
  except?: AttendanceErasureSql
) {
  const skip = except ? attendanceErasureKey(except) : null;
  for (const plan of await deps.listConfirmedPending(4)) {
    const key = attendanceErasureKey(plan.sql);
    if (skip && key.kind === skip.kind && key.subjectKey === skip.subjectKey)
      continue;
    if ((plan.attempts ?? 0) >= ATTENDANCE_ERASURE_ATTEMPTS) continue;
    try {
      await commitAttendanceErasure(plan, deps);
    } catch (error) {
      console.error('Meet attendance erasure failed', {
        name: error instanceof Error ? error.name : 'unknown',
      });
    }
  }
}

async function openPlan(
  sql: AttendanceErasureSql,
  prepare: () => Promise<AttendanceErasurePlan>,
  deps: AttendanceErasureDeps
): Promise<BegunAttendanceErasure> {
  await resumeConfirmed(deps, sql);
  const existing = await deps.readPending(sql);
  if (existing) return { plan: existing, preexisting: true };
  const plan = await prepare();
  await deps.savePending(plan);
  return { plan, preexisting: false };
}

export async function prepareMeetingAttendanceErasure(
  wsId: string,
  meetingId: string,
  deps: AttendanceErasureDeps = defaultDeps()
): Promise<AttendanceErasurePlan> {
  return {
    rooms: planMeetingAttendanceRooms({
      wsId,
      meetingId,
      sessionWsIds: await deps.listSessionWorkspaces(meetingId),
      directoryRoomIds: await deps.directoryRoomIds({ meetingId }),
    }),
    sql: { op: 'meeting', meetingId },
    phase: 'planned',
  };
}

export async function prepareWorkspaceAttendanceErasure(
  wsId: string,
  deps: AttendanceErasureDeps = defaultDeps()
): Promise<AttendanceErasurePlan> {
  return {
    rooms: planWorkspaceAttendanceRooms({
      wsId,
      meetingIds: await deps.listMeetings(wsId),
      sessionRooms: await deps.listSessionsByWorkspace(wsId),
      directoryRoomIds: await deps.directoryRoomIds({ wsId }),
    }),
    sql: { op: 'workspace', wsId },
    phase: 'planned',
  };
}

export async function prepareSubjectAttendanceErasure(
  subject: Subject,
  deps: AttendanceErasureDeps = defaultDeps()
): Promise<AttendanceErasurePlan> {
  if (!subject.userId && !subject.guestId)
    throw new Error('Meet attendance subject is required');
  return {
    rooms: planSubjectAttendanceRooms({
      sessionRooms: await deps.listSessionsBySubject(subject),
      directoryRoomIds: await deps.directoryRoomIds(
        subject.userId
          ? { userId: subject.userId }
          : { guestId: subject.guestId }
      ),
    }),
    sql: subject.userId
      ? { op: 'subject', userId: subject.userId }
      : { op: 'subject', guestId: subject.guestId },
    phase: 'planned',
  };
}

export async function openMeetingAttendanceErasure(
  wsId: string,
  meetingId: string,
  deps: AttendanceErasureDeps = defaultDeps()
) {
  return openPlan(
    { op: 'meeting', meetingId },
    () => prepareMeetingAttendanceErasure(wsId, meetingId, deps),
    deps
  );
}

export async function openWorkspaceAttendanceErasure(
  wsId: string,
  deps: AttendanceErasureDeps = defaultDeps()
) {
  return openPlan(
    { op: 'workspace', wsId },
    () => prepareWorkspaceAttendanceErasure(wsId, deps),
    deps
  );
}

export async function openSubjectAttendanceErasure(
  subject: Subject,
  deps: AttendanceErasureDeps = defaultDeps()
) {
  const sql: AttendanceErasureSql = subject.userId
    ? { op: 'subject', userId: subject.userId }
    : { op: 'subject', guestId: subject.guestId };
  return openPlan(
    sql,
    () => prepareSubjectAttendanceErasure(subject, deps),
    deps
  );
}

export async function readPendingAttendanceErasure(
  sql: AttendanceErasureSql,
  deps: AttendanceErasureDeps = defaultDeps()
) {
  return deps.readPending(sql);
}

export async function releaseAttendanceErasure(
  begun: BegunAttendanceErasure,
  deps: AttendanceErasureDeps = defaultDeps()
) {
  if (begun.plan.phase === 'confirmed') return;
  await deps.finishPending(begun.plan.sql);
}

export async function commitAttendanceErasure(
  plan: AttendanceErasurePlan | null,
  deps: AttendanceErasureDeps = defaultDeps()
) {
  if (!plan) return;
  if ((plan.attempts ?? 0) >= ATTENDANCE_ERASURE_ATTEMPTS) return;
  plan.phase = 'confirmed';
  plan.attempts = (plan.attempts ?? 0) + 1;
  await deps.savePending(plan);
  for (const room of plan.rooms)
    if (room.generation == null)
      room.generation = await deps.bumpFence(room.wsId, room.meetingId);
  await deps.savePending(plan);
  await deps.queueRooms(plan);
  try {
    await mapBounded(plan.rooms, ATTENDANCE_ERASURE_FANOUT, async (room) => {
      for (const claim of claimsFor(plan)) {
        if (room.posted?.includes(claim.key)) continue;
        const { key, ...extra } = claim;
        await deps.postRoom(room.roomId, {
          ...extra,
          generation: room.generation,
        });
        room.posted = [...(room.posted ?? []), key];
      }
    });
  } catch (error) {
    await deps.savePending(plan);
    throw error;
  }
  await deps.forgetRooms(plan.rooms.map((room) => room.roomId));
  await deps.deleteSql(plan.sql);
  await deps.finishPending(plan.sql);
}

export async function withWorkspaceAttendanceErasure(
  wsId: string,
  remove: () => Promise<{ error: unknown }>,
  deps: AttendanceErasureDeps = defaultDeps()
) {
  const begun = await openWorkspaceAttendanceErasure(wsId, deps);
  let removed: { error: unknown };
  try {
    removed = await remove();
  } catch (error) {
    await releaseAttendanceErasure(begun, deps);
    throw error;
  }
  if (removed.error) {
    await releaseAttendanceErasure(begun, deps);
    throw removed.error;
  }
  await commitAttendanceErasure(begun.plan, deps);
}

export async function eraseMeetAttendanceForMeeting(
  wsId: string,
  meetingId: string,
  deps?: AttendanceErasureDeps
) {
  const resolved = deps ?? defaultDeps();
  const begun = await openMeetingAttendanceErasure(wsId, meetingId, resolved);
  await commitAttendanceErasure(begun.plan, resolved);
}

export async function eraseMeetAttendanceForWorkspace(
  wsId: string,
  deps?: AttendanceErasureDeps
) {
  const resolved = deps ?? defaultDeps();
  const begun = await openWorkspaceAttendanceErasure(wsId, resolved);
  await commitAttendanceErasure(begun.plan, resolved);
}

export async function eraseMeetAttendanceSubject(
  subject: Subject,
  deps?: AttendanceErasureDeps
) {
  const resolved = deps ?? defaultDeps();
  const begun = await openSubjectAttendanceErasure(subject, resolved);
  await commitAttendanceErasure(begun.plan, resolved);
}
