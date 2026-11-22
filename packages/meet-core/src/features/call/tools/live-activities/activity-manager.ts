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
