import { expect, it } from 'vitest';
import {
  applyPresenceDelta,
  coalescePresenceUpdates,
} from './room-presence-diff';
import type { MeetRealtimePresence } from './primitives';

type Presence = Record<string, MeetRealtimePresence>;
const roomId = 'large-room';
const person = (index: number): MeetRealtimePresence => ({
  userId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  joinedAt: '2026-11-10T00:00:00Z',
  lastSeenAt: '2026-11-10T00:00:00Z',
  displayName: `Participant ${index + 1}`,
  media: { audioEnabled: true, videoEnabled: true, screenEnabled: false },
  role: 'speaker',
});

it('coalesces 50 joins, cancelling toggle pairs and a leave burst and converges after resync', () => {
  let server: Presence = {};
  let before = server;
  let seq = 0;
  const clients = Array.from({ length: 50 }, () => ({
    presence: {},
    seq: 0 as number | null,
  }));
  const broadcast = (skip = -1) => {
    const delta = coalescePresenceUpdates(before, server, roomId, ++seq);
    before = server;
    clients.forEach((client, index) => {
      if (index === skip) return;
      const reply = applyPresenceDelta(client.presence, client.seq, delta);
      Object.assign(
        client,
        reply.gap ? { presence: { ...server }, seq } : reply
      );
    });
    return delta;
  };
  for (let i = 0; i < 50; i++) {
    const joined = person(i);
    server = { ...server, [joined.userId]: joined };
  }
  expect(broadcast().upserted).toHaveLength(50);
  expect(
    clients.every((client) => Object.keys(client.presence).length === 50)
  ).toBe(true);
  for (const person of Object.values(server)) {
    const muted = {
      ...person,
      media: { ...person.media, audioEnabled: false },
    };
    server = { ...server, [person.userId]: muted };
    if (!person.displayName.endsWith('1'))
      server = { ...server, [person.userId]: person };
  }
  const delta = broadcast(0);
  const bytes = (value: unknown) =>
    new TextEncoder().encode(JSON.stringify(value)).length;
  expect(delta.upserted).toHaveLength(5);
  expect(bytes(delta)).toBeLessThan(bytes(Object.values(server)) / 5);
  expect(clients[0]?.seq).toBe(1);
  clients[1] = { presence: { ...server }, seq }; // Reconnect receives a full snapshot.
  const departing = Object.keys(server).slice(-8);
  server = Object.fromEntries(
    Object.entries(server).filter(([id]) => !departing.includes(id))
  );
  expect(broadcast()).toMatchObject({
    seq: 3,
    upserted: [],
    removed: departing,
  });
  expect(
    clients.every(
      (client) =>
        client.seq === 3 &&
        JSON.stringify(client.presence) === JSON.stringify(server)
    )
  ).toBe(true);
});
