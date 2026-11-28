import { describe, expect, it, vi } from 'vitest';
import type { MeetRealtimeServerMessage } from './messages';
import { getMeetRealtimeScopesForRole } from './permissions';
import {
  type MeetRealtimeTokenPayload,
  meetRealtimeTokenPayloadSchema,
} from './primitives';
import {
  createMeetPresence,
  createMeetRoomSnapshot,
  createMeetRoomSocketDelivery,
  type MeetRoomSocketAttachment,
} from './room';
import {
  createMeetRoomAccountAlias,
  meetRoomAccountAlias,
} from './room-account-alias';
import { meetFrameForViewer, seesMeetAccountIds } from './room-viewer-identity';

const SECRET = 'test-realtime-secret';
const ROOM = 'ws:meeting';
const now = '2026-11-28T08:00:00.000Z';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const account = {
  host: '10000000-0000-4000-8000-000000000001',
  member: '10000000-0000-4000-8000-000000000002',
  external: '10000000-0000-4000-8000-000000000003',
  guest: '10000000-0000-4000-8000-000000000004',
  otherGuest: '10000000-0000-4000-8000-000000000005',
};
const ACCOUNT_IDS = Object.values(account);

function token(
  name: keyof typeof account,
  extra: Partial<MeetRealtimeTokenPayload> = {}
) {
  const role = name === 'host' ? 'host' : 'speaker';
  return meetRealtimeTokenPayloadSchema.parse({
    accountId: account[name],
    // Device identities are distinct from account ids, as the web client sends.
    userId: crypto.randomUUID(),
    role,
    admission: name === 'host' || name === 'member' ? 'open' : 'lobby',
    ...(name === 'guest' || name === 'otherGuest' ? { guest: true } : {}),
    exp: 2_000_000_000,
    meetingId: '20000000-0000-4000-8000-000000000001',
    wsId: '30000000-0000-4000-8000-000000000001',
    roomId: ROOM,
    scopes: getMeetRealtimeScopesForRole(role),
    ...extra,
  });
}

const tokens = {
  host: token('host'),
  member: token('member'),
  external: token('external'),
  guest: token('guest'),
  otherGuest: token('otherGuest'),
};
const presence = Object.values(tokens).map((t) => createMeetPresence(t, now));
const snapshotFrame: MeetRealtimeServerMessage = {
  type: 'presence',
  roomId: ROOM,
  seq: 4,
  presence,
};
const deltaFrame: MeetRealtimeServerMessage = {
  type: 'presence.delta',
  roomId: ROOM,
  seq: 5,
  upserted: presence,
  removed: [],
};
const chatFrame: MeetRealtimeServerMessage = {
  type: 'chat.message',
  id: crypto.randomUUID(),
  body: 'hello',
  createdAt: now,
  displayName: 'Host',
  accountId: account.host,
  userId: tokens.host.userId,
};
const liveFrame: MeetRealtimeServerMessage = {
  type: 'assistant.live',
  sessionId: crypto.randomUUID(),
  ownerId: account.host,
  active: true,
};
const alias = createMeetRoomAccountAlias(() => SECRET);
const realIdsIn = (wire: string, except?: string) =>
  ACCOUNT_IDS.filter((id) => id !== except && wire.includes(id));

describe('who reads platform account ids', () => {
  it('lets the host and open-admission members read them, not lobby joiners', () => {
    expect(seesMeetAccountIds(tokens.host)).toBe(true);
    expect(seesMeetAccountIds(tokens.member)).toBe(true);
    expect(seesMeetAccountIds(tokens.guest)).toBe(false);
    expect(seesMeetAccountIds(tokens.external)).toBe(false);
  });
});

describe('meetFrameForViewer', () => {
  it.each(['host', 'member'] as const)(
    'returns the %s frame unchanged',
    (name) => {
      for (const frame of [snapshotFrame, deltaFrame, chatFrame])
        expect(meetFrameForViewer(frame, tokens[name], alias)).toBe(frame);
    }
  );

  it.each(['guest', 'external'] as const)(
    'replaces every other account id in a %s snapshot, delta and chat line',
    (name) => {
      const viewer = tokens[name];
      for (const frame of [snapshotFrame, deltaFrame, chatFrame]) {
        const wire = JSON.stringify(meetFrameForViewer(frame, viewer, alias));
        expect(realIdsIn(wire, viewer.accountId)).toEqual([]);
      }
      const viewed = meetFrameForViewer(snapshotFrame, viewer, alias);
      if (viewed.type !== 'presence') throw new Error('expected presence');
      for (const person of viewed.presence) {
        if (person.userId === viewer.userId)
          expect(person.accountId).toBe(viewer.accountId);
        else {
          expect(person.accountId).toMatch(UUID);
          expect(person.accountId).toBe(
            meetRoomAccountAlias(
              SECRET,
              ROOM,
              presence.find((p) => p.userId === person.userId)!.accountId!
            )
          );
        }
      }
    }
  );

  it('keeps the viewer’s own account id so its other devices still match', () => {
    const secondDevice = createMeetPresence(
      token('guest', { userId: crypto.randomUUID() }),
      now
    );
    const viewed = meetFrameForViewer(
      { ...deltaFrame, upserted: [secondDevice] },
      tokens.guest,
      alias
    );
    expect(viewed).toMatchObject({
      upserted: [{ accountId: account.guest }],
    });
  });

  it('gives one account the same alias in snapshots, deltas and chat', () => {
    const pick = (frame: MeetRealtimeServerMessage) => {
      const viewed = meetFrameForViewer(frame, tokens.guest, alias);
      if (viewed.type === 'presence')
        return viewed.presence.find((p) => p.userId === tokens.host.userId)
          ?.accountId;
      if (viewed.type === 'presence.delta')
        return viewed.upserted.find((p) => p.userId === tokens.host.userId)
          ?.accountId;
      return viewed.type === 'chat.message' ? viewed.accountId : undefined;
    };
    const ids = [snapshotFrame, deltaFrame, chatFrame].map(pick);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).not.toBe(account.host);
  });

  it('replaces the Mira Live owner for outside viewers only', () => {
    expect(meetFrameForViewer(liveFrame, tokens.member, alias)).toBe(liveFrame);
    expect(meetFrameForViewer(liveFrame, tokens.guest, alias)).toEqual({
      ...liveFrame,
      ownerId: meetRoomAccountAlias(SECRET, ROOM, account.host),
    });
    const own = { ...liveFrame, ownerId: account.external };
    expect(meetFrameForViewer(own, tokens.external, alias)).toBe(own);
    expect(meetFrameForViewer(liveFrame, tokens.guest)).not.toHaveProperty(
      'ownerId'
    );
  });

  it('scopes the alias to the room and the secret', () => {
    const a = meetRoomAccountAlias(SECRET, ROOM, account.host);
    expect(a).toMatch(UUID);
    expect(meetRoomAccountAlias(SECRET, 'ws:other', account.host)).not.toBe(a);
    expect(meetRoomAccountAlias('other-secret', ROOM, account.host)).not.toBe(
      a
    );
    expect(() => meetRoomAccountAlias(' ', ROOM, account.host)).toThrow();
  });

  it('omits other account ids when no secret is configured', () => {
    const none = createMeetRoomAccountAlias(() => undefined);
    const viewed = meetFrameForViewer(snapshotFrame, tokens.guest, none);
    if (viewed.type !== 'presence') throw new Error('expected presence');
    for (const person of viewed.presence)
      expect(person.accountId).toBe(
        person.userId === tokens.guest.userId ? account.guest : undefined
      );
    expect(meetFrameForViewer(chatFrame, tokens.guest)).not.toHaveProperty(
      'accountId'
    );
  });

  it('leaves frames without account ids untouched', () => {
    const stage: MeetRealtimeServerMessage = {
      type: 'room.ended',
      by: tokens.host.userId,
    };
    expect(meetFrameForViewer(stage, tokens.guest, alias)).toBe(stage);
  });
});

describe('socket delivery', () => {
  function setup(
    options: {
      delta?: boolean;
      seq?: number;
      announcements?: MeetRealtimeServerMessage[];
    } = {}
  ) {
    const people = Object.values(tokens);
    const sockets = people.map((t) => ({
      token: t,
      readyState: 1,
      send: vi.fn<(wire: string) => void>(),
      close: vi.fn(),
      deserializeAttachment: (): MeetRoomSocketAttachment => ({
        token: t,
        presenceSeq: options.seq ?? 4,
        supportsPresenceDelta: options.delta ?? true,
      }),
      serializeAttachment: vi.fn<(value: MeetRoomSocketAttachment) => void>(),
    }));
    const state = {
      ...createMeetRoomSnapshot(),
      presence: Object.fromEntries(presence.map((p) => [p.userId, p])),
      presenceSeq: 4,
    };
    const delivery = createMeetRoomSocketDelivery({
      sockets: () => sockets,
      read: () => state,
      fullPresence: () => snapshotFrame,
      announcements: () => options.announcements ?? [],
      accountAlias: alias,
    });
    const wires = (name: keyof typeof tokens) =>
      sockets
        .find((s) => s.token === tokens[name])!
        .send.mock.calls.map(([wire]) => wire!);
    const socketOf = (name: keyof typeof tokens) =>
      sockets.find((s) => s.token === tokens[name])!;
    return { delivery, wires, socketOf };
  }

  it('sends no other person’s account id to a guest, on any presence or chat path', () => {
    for (const delta of [true, false]) {
      const { delivery, wires } = setup({ delta });
      delivery.broadcast([deltaFrame, chatFrame]);
      delivery.sendToUser(tokens.guest.userId, [snapshotFrame]);
      delivery.sendToUser(tokens.external.userId, [snapshotFrame]);
      for (const name of ['guest', 'otherGuest', 'external'] as const) {
        const sent = wires(name);
        expect(sent.length).toBeGreaterThan(0);
        for (const wire of sent)
          expect(realIdsIn(wire, tokens[name].accountId)).toEqual([]);
        // Each outside viewer still finds itself by its own account id.
        expect(
          sent.some((wire) => wire.includes(tokens[name].accountId!))
        ).toBe(true);
      }
      for (const name of ['host', 'member'] as const)
        expect(wires(name).join('\n')).toContain(account.external);
    }
  });

  it('does not let one guest’s own id reach another guest through a shared wire', () => {
    const { delivery, wires } = setup();
    delivery.broadcast([deltaFrame]);
    expect(wires('guest').join('')).not.toContain(account.otherGuest);
    expect(wires('otherGuest').join('')).not.toContain(account.guest);
  });

  it('sends live announcements through the same viewer projection', () => {
    const { delivery, wires, socketOf } = setup({
      announcements: [liveFrame],
    });
    const ready = { type: 'ready', admission: 'admitted' } as never;
    for (const name of ['guest', 'member'] as const)
      delivery.sendTo(socketOf(name), ready);
    const guestLive = wires('guest').map((wire) => JSON.parse(wire));
    expect(guestLive).toContainEqual(
      expect.objectContaining({
        type: 'assistant.live',
        ownerId: meetRoomAccountAlias(SECRET, ROOM, account.host),
      })
    );
    expect(realIdsIn(wires('guest').join(''), account.guest)).toEqual([]);
    expect(wires('member').join('')).toContain(account.host);
  });

  it('resyncs restored sockets with the projected snapshot', () => {
    const { delivery, wires } = setup({ seq: 1 });
    delivery.resyncRestoredSockets();
    for (const name of ['guest', 'external'] as const) {
      expect(wires(name)).toHaveLength(1);
      expect(realIdsIn(wires(name)[0]!, tokens[name].accountId)).toEqual([]);
    }
    expect(wires('member')[0]).toContain(account.guest);
  });
});
