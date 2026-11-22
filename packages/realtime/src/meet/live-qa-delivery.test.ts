import { afterEach, expect, it, vi } from 'vitest';
import { liveQaDelivery } from './live-qa-views';
import { LIVE_QA_BROADCAST_DELAY_MS } from './live-qa-broadcast';
import type { MeetRealtimeServerMessage } from './messages';
import { getMeetRealtimeScopesForRole } from './permissions';
import { meetRealtimeTokenPayloadSchema } from './primitives';
import {
  createMeetPresence,
  createMeetRoomSnapshot,
  createMeetRoomSocketDelivery,
  type MeetRoomSocketAttachment,
} from './room';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const now = '2026-11-23T08:00:00Z';
const host = meetRealtimeTokenPayloadSchema.parse({
  roomId: 'room-qa',
  wsId: crypto.randomUUID(),
  meetingId: crypto.randomUUID(),
  userId: crypto.randomUUID(),
  role: 'host',
  scopes: getMeetRealtimeScopesForRole('host'),
  exp: 2_000_000_000,
});
const guest = {
  ...host,
  role: 'speaker' as const,
  userId: crypto.randomUUID(),
};

function setup() {
  const socket = (token: typeof host) => ({
    readyState: 1,
    send: vi.fn<(wire: string) => void>(),
    close: vi.fn(),
    deserializeAttachment: () => ({ token }),
    serializeAttachment: vi.fn<(value: MeetRoomSocketAttachment) => void>(),
  });
  const sockets = [socket(host), socket(host), socket(guest)];
  const state = {
    ...createMeetRoomSnapshot(),
    presence: Object.fromEntries(
      [host, guest].map((token) => [
        token.userId,
        createMeetPresence(token, now),
      ])
    ),
  };
  const delivery = createMeetRoomSocketDelivery({
    sockets: () => sockets,
    read: () => state,
    fullPresence: () => ({ type: 'room.ended' }),
    announcements: () => [],
  });
  return { delivery, sockets };
}
const snapshot = (revision: number): MeetRealtimeServerMessage => ({
  type: 'qa.snapshot',
  snapshot: { questions: [], revision },
});
const sent = (socket: { send: { mock: { calls: string[][] } } }) =>
  socket.send.mock.calls.map(([wire]) => JSON.parse(wire!));

it('sends one shared Q&A snapshot per window, with the newest state', () => {
  vi.useFakeTimers();
  const { delivery, sockets } = setup();
  delivery.broadcast([snapshot(1)]);
  delivery.broadcast([
    snapshot(2),
    { type: 'reaction', reaction: 'heart' } as never,
  ]);
  delivery.broadcast([snapshot(3)]);
  // Other frames are not held.
  expect(sent(sockets[2]!)).toEqual([{ type: 'reaction', reaction: 'heart' }]);
  vi.advanceTimersByTime(LIVE_QA_BROADCAST_DELAY_MS);
  expect(sent(sockets[2]!).slice(1)).toEqual([snapshot(3)]);
  delivery.broadcast([snapshot(4)]);
  vi.advanceTimersByTime(LIVE_QA_BROADCAST_DELAY_MS);
  expect(sent(sockets[2]!).slice(1)).toEqual([snapshot(3), snapshot(4)]);
});

it('drops a held snapshot when the room ends', () => {
  vi.useFakeTimers();
  const { delivery, sockets } = setup();
  delivery.broadcast([snapshot(1)]);
  delivery.broadcast([{ type: 'room.ended' }]);
  vi.advanceTimersByTime(LIVE_QA_BROADCAST_DELAY_MS * 2);
  expect(sent(sockets[2]!)).toEqual([{ type: 'room.ended' }]);
});

it('sends a reply carrying a request id at once', () => {
  vi.useFakeTimers();
  const { delivery, sockets } = setup();
  const reply = {
    ...snapshot(5),
    requestId: 'qa:1',
  } as MeetRealtimeServerMessage;
  delivery.sendToSocket(sockets[2]!, [reply]);
  expect(sent(sockets[2]!)).toEqual([reply]);
});

it('serializes one host view once for every host socket', () => {
  const { delivery, sockets } = setup();
  const message: MeetRealtimeServerMessage = {
    type: 'qa.host',
    snapshot: { questions: [], revision: 1 },
  };
  const stringify = vi.spyOn(JSON, 'stringify');
  delivery.sendToUser(host.userId, [message]);
  delivery.sendToUser(host.userId, [message]);
  expect(
    stringify.mock.calls.filter(([value]) => value === message)
  ).toHaveLength(1);
  expect(sockets[0]!.send).toHaveBeenCalledTimes(2);
  expect(sockets[1]!.send).toHaveBeenCalledTimes(2);
  // The full view never reaches someone who is not a host.
  delivery.sendToUser(guest.userId, [message]);
  expect(sockets[2]!.send).not.toHaveBeenCalled();
});

it('serializes the host frame of one change once for every host', () => {
  const second = { ...host, userId: crypto.randomUUID() };
  const socket = (token: typeof host) => ({
    readyState: 1,
    send: vi.fn<(wire: string) => void>(),
    close: vi.fn(),
    deserializeAttachment: () => ({ token }),
    serializeAttachment: vi.fn<(value: MeetRoomSocketAttachment) => void>(),
  });
  const sockets = [socket(host), socket(second)];
  const sender = { ...host, userId: crypto.randomUUID() };
  const state = {
    ...createMeetRoomSnapshot(),
    presence: Object.fromEntries(
      [host, second, sender].map((token) => [
        token.userId,
        createMeetPresence(token, now),
      ])
    ),
  };
  const delivery = createMeetRoomSocketDelivery({
    sockets: () => sockets,
    read: () => state,
    fullPresence: () => ({ type: 'room.ended' }),
    announcements: () => [],
  });
  const { direct } = liveQaDelivery(
    state,
    { questions: [], revision: 1 } as never,
    sender
  );
  const stringify = vi.spyOn(JSON, 'stringify');
  for (const entry of direct ?? [])
    delivery.sendToUser(entry.userId, [entry.message]);
  expect(direct).toHaveLength(2);
  const hostFrames = stringify.mock.calls.filter(
    ([value]) => (value as { type?: string })?.type === 'qa.host'
  );
  expect(hostFrames).toHaveLength(1);
  expect(sockets[0]!.send).toHaveBeenCalledTimes(1);
  expect(sockets[1]!.send).toHaveBeenCalledTimes(1);
});
