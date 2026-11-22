import { MEET_CLASS_COHOST_SCOPE } from './class-timer';
import { applyLiveActivities } from './live-activities';
import { meetRealtimeClientMessageSchema } from './messages';
import { getMeetRealtimeScopesForRole } from './permissions';
import { meetRealtimeTokenPayloadSchema } from './primitives';
import {
  createMeetPresence,
  createMeetRoomSnapshot,
  type MeetRoomSnapshot,
} from './room';

/**
 * Shared live-activity protocol fixtures: tokens shaped like the ones the join
 * route mints, a room with everyone present and helpers that send one message.
 */
export const time = Date.parse('2026-11-22T08:00:00Z');
export const now = new Date(time).toISOString();
// Tokens shaped like the ones the join route mints (call-session.ts): the
// creator is the host, everyone else is a speaker, and a workspace admin in
// someone else's meeting is a speaker with the co-host scope.
export const host = meetRealtimeTokenPayloadSchema.parse({
  roomId: 'room-activities',
  wsId: crypto.randomUUID(),
  meetingId: crypto.randomUUID(),
  userId: crypto.randomUUID(),
  role: 'host',
  scopes: getMeetRealtimeScopesForRole('host'),
  exp: 2_000_000_000,
});
export const guest = {
  ...host,
  role: 'speaker' as const,
  scopes: getMeetRealtimeScopesForRole('speaker'),
  userId: crypto.randomUUID(),
};
export const other = { ...guest, userId: crypto.randomUUID() };
export const cohost = {
  ...guest,
  userId: crypto.randomUUID(),
  scopes: [...getMeetRealtimeScopesForRole('speaker'), MEET_CLASS_COHOST_SCOPE],
};
export const room = () => ({
  ...createMeetRoomSnapshot(),
  presence: Object.fromEntries(
    [host, guest, other, cohost].map((token) => [
      token.userId,
      createMeetPresence(token, now),
    ])
  ),
});
export const run = (
  state: MeetRoomSnapshot,
  token: typeof host,
  input: unknown,
  offset = 0
) => {
  const message = meetRealtimeClientMessageSchema.parse(input);
  const result = applyLiveActivities(state, {
    message,
    token,
    now: new Date(time + offset).toISOString(),
  });
  if (!result) throw new Error('Expected an activity outcome');
  return result;
};
export const action = (
  state: MeetRoomSnapshot,
  token: typeof host,
  command: unknown,
  offset?: number
) => run(state, token, { type: 'activity.command', command }, offset);
export const read = (state: MeetRoomSnapshot, token: typeof host) =>
  run(state, token, { type: 'activity.read', requestId: 'read' });
export const error = (name: string) => [{ type: 'error', error: name }];
