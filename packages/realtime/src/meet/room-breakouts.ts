import {
  type BreakoutMode,
  type ClassroomMutation,
  MAX_BREAKOUT_DURATION_MINUTES,
} from './classroom-tools-schema';
import type { MeetRealtimeTokenPayload } from './primitives';
import type { MeetRoomSnapshot } from './room';
import {
  type MeetAccountAlias,
  seesMeetAccountIds,
} from './room-viewer-identity';

type Group = { id: number; memberIds: string[]; needsHelp: boolean };
type Participant = { id: string; name: string };
export type RoomBreakouts = {
  id: string;
  mode: BreakoutMode;
  endsAt: number;
  groups: Group[];
  broadcast?: string;
};

export type BreakoutsView = {
  session: RoomBreakouts | null;
  participants: Participant[];
  actorId: string;
  canManage: boolean;
  serverNow: number;
};

export function breakoutRoster(snapshot: MeetRoomSnapshot): Participant[] {
  const people = new Map<string, Participant>();
  for (const person of Object.values(snapshot.presence)) {
    const id = person.accountId ?? person.userId;
    if (person.role !== 'host' && !people.has(id))
      people.set(id, { id, name: person.displayName });
  }
  return [...people.values()];
}

/**
 * The breakout view one participant receives. Groups hold account ids on the
 * server, so assignment and moves keep working there. A viewer outside the
 * workspace gets the room alias in place of every other person's id, in its
 * group's member list and in the roster alike, so the two still match. Its own
 * id stays, which is how its client finds its group. Hosts keep real ids: they
 * assign people by them. Without an alias the id is left empty.
 */
export function breakoutsViewForViewer(
  view: BreakoutsView,
  viewer: Pick<
    MeetRealtimeTokenPayload,
    'accountId' | 'admission' | 'guest' | 'role' | 'roomId'
  >,
  alias?: MeetAccountAlias
): BreakoutsView {
  if (view.canManage || seesMeetAccountIds(viewer)) return view;
  const id = (personId: string) =>
    personId === view.actorId
      ? personId
      : (alias?.(viewer.roomId, personId) ?? '');
  return {
    ...view,
    session: view.session && {
      ...view.session,
      groups: view.session.groups.map((group) => ({
        ...group,
        memberIds: group.memberIds.map(id),
      })),
    },
    participants: view.participants.map((person) => ({
      ...person,
      id: id(person.id),
    })),
  };
}

export function activeBreakouts(room: RoomBreakouts | undefined, now: number) {
  return room && room.endsAt > now ? room : null;
}

type Action = Extract<ClassroomMutation, { action: `breakouts.${string}` }>;

export function editBreakouts({
  previous,
  command,
  participants,
  actorId,
  host,
  now,
}: {
  previous: RoomBreakouts | undefined;
  command: Action;
  participants: Participant[];
  actorId: string;
  host: boolean;
  now: number;
}): RoomBreakouts | null | 403 | 404 | 409 {
  const current = activeBreakouts(previous, now);
  switch (command.action) {
    case 'breakouts.join':
    case 'breakouts.help':
      break;
    default:
      if (!host) return 403;
  }

  if (command.action === 'breakouts.create') {
    if (current) return current.id === command.sessionId ? current : 409;
    const groups: Group[] = Array.from(
      { length: command.roomCount },
      (_, i) => ({
        id: i + 1,
        memberIds: participants
          .filter(
            (_, index) =>
              command.mode === 'auto' && index % command.roomCount === i
          )
          .map(({ id }) => id),
        needsHelp: false,
      })
    );
    return {
      id: command.sessionId,
      mode: command.mode,
      endsAt: now + command.durationMinutes * 60_000,
      groups,
    };
  }

  if (!current || current.id !== command.sessionId) return 409;
  if (
    'groupId' in command &&
    command.groupId !== null &&
    !current.groups.some(({ id }) => id === command.groupId)
  )
    return 404;

  switch (command.action) {
    case 'breakouts.assign':
      if (!participants.some(({ id }) => id === command.participantId))
        return 404;
      return assign(current, command.participantId, command.groupId);
    case 'breakouts.join':
      if (!host && current.mode !== 'student_pick') return 403;
      return assign(current, actorId, command.groupId);
    case 'breakouts.help':
      if (
        !host &&
        !current.groups.some(
          ({ id, memberIds }) =>
            id === command.groupId && memberIds.includes(actorId)
        )
      )
        return 403;
      return {
        ...current,
        groups: current.groups.map((entry) =>
          entry.id === command.groupId
            ? { ...entry, needsHelp: command.requested }
            : entry
        ),
      };
    case 'breakouts.broadcast':
      return { ...current, broadcast: command.message };
    case 'breakouts.extend':
      return {
        ...current,
        endsAt: Math.min(
          current.endsAt + 5 * 60_000,
          now + MAX_BREAKOUT_DURATION_MINUTES * 60_000
        ),
      };
    case 'breakouts.close':
      return null;
  }
}

function assign(
  current: RoomBreakouts,
  actorId: string,
  groupId: number | null
) {
  return {
    ...current,
    groups: current.groups.map((entry) => {
      const memberIds = entry.memberIds.filter((id) => id !== actorId);
      if (entry.id === groupId) memberIds.push(actorId);
      return {
        ...entry,
        memberIds,
        needsHelp: memberIds.length > 0 && entry.needsHelp,
      };
    }),
  };
}
