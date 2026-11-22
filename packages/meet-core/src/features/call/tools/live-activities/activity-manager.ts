/**
 * Whether this person runs the room's live activities, from what the room
 * told this client. It mirrors the room's own rule
 * (`canMeetRealtimeRunActivities`): the host, anyone who manages participants,
 * and a workspace admin in someone else's meeting, who joins as a co-host.
 */
export function runsRoomActivities(room: {
  role?: string | null;
  canManageParticipants?: boolean;
  classRole?: string | null;
}) {
  return (
    room.role === 'host' ||
    room.canManageParticipants === true ||
    room.classRole === 'cohost'
  );
}

const ROOM_ACTIVITY_TOOLS = new Set([
  'live-assessment',
  'live-flashcards',
  'live-game',
  'live-icebreaker',
  'pen-whiteboard',
]);

/**
 * The tools someone browses when all they may do is run room activities: a
 * workspace co-host in a room whose tools are for hosts only. They get the
 * four activities and the pen board; polls, timers, Quiz Arena and Q&A stay
 * with the hosts.
 */
export function roomActivityTools<T extends { id: string }>(
  tools: readonly T[]
) {
  return tools.filter(({ id }) => ROOM_ACTIVITY_TOOLS.has(id));
}
