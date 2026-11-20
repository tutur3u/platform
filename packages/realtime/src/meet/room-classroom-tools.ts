import { takeActorRateLimit } from './actor-rate-limit';
import {
  classroomMutationSchema,
  classroomReadSchema,
  MEET_CLASSROOM_TOOLS_SCOPE,
} from './classroom-tools-schema';
import type { MeetRealtimeTokenPayload } from './primitives';
import {
  activeBreakouts,
  type BreakoutsView,
  breakoutRoster,
  editBreakouts,
  type RoomBreakouts,
} from './room-breakouts';
import type { RoomServiceState } from './room-service';
import {
  editWhiteboard,
  emptyWhiteboard,
  projectWhiteboard,
  type WhiteboardView,
} from './room-whiteboard';

type ClassroomToolResponse = {
  state: RoomServiceState;
  body: WhiteboardView | BreakoutsView | { ok: true } | { error: string };
  status?: number;
};

export function applyRoomClassroomTools(
  snapshot: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown,
  now = Date.now()
): ClassroomToolResponse | null {
  // The Meet app grants this scope only after checking the deployment and workspace.
  if (
    !token.scopes.includes('meet:server') ||
    !token.scopes.includes(MEET_CLASSROOM_TOOLS_SCOPE)
  )
    return null;

  const fail = (status: number) => ({
    state: snapshot,
    body: { error: 'Classroom action is unavailable' },
    status,
  });
  if (token.mode !== 'call' || snapshot.ended) return fail(403);
  const actorId = token.accountId ?? token.userId;
  if (
    !Object.values(snapshot.presence).some(
      (person) => (person.accountId ?? person.userId) === actorId
    )
  )
    return fail(403);

  const host = token.role === 'host';
  const read = classroomReadSchema.safeParse(input);
  if (read.success) {
    if (read.data.action === 'whiteboard.read') {
      return {
        state: snapshot,
        body: projectWhiteboard(
          snapshot.whiteboard ?? emptyWhiteboard,
          actorId,
          host,
          read.data.since
        ),
      };
    }
    const session = activeBreakouts(snapshot.breakouts, now);
    const groups = session?.groups.map((group) =>
      host || group.memberIds.includes(actorId)
        ? group
        : { ...group, memberIds: [], needsHelp: false }
    );
    const body: BreakoutsView = {
      session: session && groups ? { ...session, groups } : null,
      participants: breakoutRoster(snapshot).filter(
        ({ id }) =>
          host || groups?.some(({ memberIds }) => memberIds.includes(id))
      ),
      actorId,
      canManage: host,
      serverNow: now,
    };
    return { state: snapshot, body };
  }

  const parsed = classroomMutationSchema.safeParse(input);
  if (!parsed.success) return fail(400);
  if (
    !takeActorRateLimit(
      `classroom-write:${token.roomId}:${actorId}`,
      120,
      60_000,
      now
    )
  )
    return fail(429);

  const command = parsed.data;
  switch (command.action) {
    case 'whiteboard.draw':
    case 'whiteboard.undo':
    case 'whiteboard.clear': {
      const current = snapshot.whiteboard ?? emptyWhiteboard;
      const next = editWhiteboard(current, command, actorId, host);
      if (typeof next === 'number') return fail(next);
      return {
        state: next === current ? snapshot : { ...snapshot, whiteboard: next },
        body: { ok: true },
      };
    }
    default: {
      const previous = snapshot.breakouts;
      const participants = breakoutRoster(snapshot);
      const next = editBreakouts({
        previous,
        command,
        participants,
        actorId,
        host,
        now,
      });
      if (typeof next === 'number') return fail(next);
      if (next && !fitsBreakoutBudget(next)) return fail(409);
      return {
        state:
          next === previous
            ? snapshot
            : { ...snapshot, breakouts: next ?? undefined },
        body: { ok: true },
      };
    }
  }
}

function fitsBreakoutBudget(room: RoomBreakouts) {
  return new TextEncoder().encode(JSON.stringify(room)).byteLength <= 32 * 1024;
}
