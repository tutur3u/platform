import { describe, expect, it } from 'vitest';
import { meetAccountDeviceId } from './device-identity';
import type { MeetRealtimeServerMessage } from './messages';
import { createMeetPresence } from './room';
import {
  createMeetRoomAccountAlias,
  meetRoomAccountAlias,
} from './room-account-alias';
import {
  arena,
  host,
  ok,
  player,
  setup,
  uuid,
} from './room-quiz-arena.fixtures';
import type { QuizArenaFullView } from './room-quiz-arena-view';
import { roomService } from './room-service';
import { meetFrameForViewer } from './room-viewer-identity';

const SECRET = 'account-ids-secret';
const alias = createMeetRoomAccountAlias(() => SECRET);
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('connection ids for members without a device id', () => {
  const account = uuid(42);

  it('are stable in one room and never equal the account id', async () => {
    const id = await meetAccountDeviceId(SECRET, 'ws:a', account);
    expect(id).toMatch(UUID);
    expect(id).not.toBe(account);
    expect(await meetAccountDeviceId(SECRET, 'ws:a', account)).toBe(id);
    // Reconnecting with a padded secret value keeps the same identity.
    expect(await meetAccountDeviceId(` ${SECRET} `, 'ws:a', account)).toBe(id);
  });

  it('differ per room, secret and account, and from the room account alias', async () => {
    const id = await meetAccountDeviceId(SECRET, 'ws:a', account);
    expect(await meetAccountDeviceId(SECRET, 'ws:b', account)).not.toBe(id);
    expect(await meetAccountDeviceId('other', 'ws:a', account)).not.toBe(id);
    expect(await meetAccountDeviceId(SECRET, 'ws:a', uuid(43))).not.toBe(id);
    expect(meetRoomAccountAlias(SECRET, 'ws:a', account)).not.toBe(id);
    await expect(meetAccountDeviceId(' ', 'ws:a', account)).rejects.toThrow();
  });
});

describe('Quiz Arena views per viewer', () => {
  const config = { answerMode: 'buzz_in', playMode: 'individual' } as const;
  let rooms = 0;
  // Read and buzz budgets are module-wide per room, so each case gets its own.
  const viewers = () => {
    const roomId = `arena-ids-${++rooms}`;
    return {
      host: { ...host, roomId },
      member: { ...player(2), roomId },
      guest: {
        ...player(1),
        guest: true as const,
        admission: 'lobby' as const,
        roomId,
      },
      external: { ...player(3), admission: 'lobby' as const, roomId },
    };
  };
  const played = () => {
    const people = viewers();
    let state = setup(config, 3);
    const tileId = arena(state).tiles[0]!.id;
    state = ok(state, people.host, { action: 'arena.pickTile', tileId });
    state = ok(state, people.guest, { action: 'arena.buzz', tileId });
    state = ok(state, people.member, { action: 'arena.buzz', tileId });
    return { state, people, tileId };
  };
  const read = (
    state: ReturnType<typeof setup>,
    token: Parameters<typeof roomService>[1],
    accountAlias = alias
  ) => {
    const result = roomService(
      state,
      token,
      { action: 'arena.state' },
      undefined,
      { accountAlias }
    );
    expect(result.status).toBeUndefined();
    return result.body as QuizArenaFullView;
  };
  const realIds = [uuid(0), uuid(1), uuid(2), uuid(3)];
  const foreign = (wire: string, own: string) =>
    realIds.filter((id) => id !== own && wire.includes(id));

  it('keeps real ids for the host and workspace members', () => {
    const { state, people } = played();
    const hostView = read(state, people.host);
    expect(hostView.players.map((p) => p.userId)).toContain(uuid(1));
    expect(hostView.tiles[0]!.answers).toBeDefined();
    const memberView = read(state, people.member);
    expect(memberView.players.map((p) => p.userId)).toEqual(
      expect.arrayContaining([uuid(1), uuid(2), uuid(3)])
    );
  });

  it.each(['guest', 'external'] as const)(
    'gives a %s aliases for every other player, in the scoreboard and buzz queue',
    (name) => {
      const { state, people } = played();
      const viewer = people[name];
      const view = read(state, viewer);
      const wire = JSON.stringify(view);
      expect(foreign(wire, viewer.accountId)).toEqual([]);
      const memberAlias = meetRoomAccountAlias(SECRET, viewer.roomId, uuid(2));
      expect(view.players.map((p) => p.userId)).toContain(memberAlias);
      // A buzz still names the same player as the scoreboard row.
      expect(view.tiles[0]!.buzzQueue.map((b) => b.userId)).toContain(
        memberAlias
      );
      expect(view.tiles[0]!.answers).toBeUndefined();
    }
  );

  it('lets a guest find its own row and buzz by its own id', () => {
    const { state, people } = played();
    const view = read(state, people.guest);
    expect(view.players.find((p) => p.userId === uuid(1))?.displayName).toBe(
      'Player 1'
    );
    expect(view.tiles[0]!.buzzQueue[0]).toMatchObject({
      userId: uuid(1),
      status: 'answering',
    });
  });

  it('scores the guest’s buzz on the server by its account id', () => {
    const { state, people, tileId } = played();
    const judged = ok(state, people.host, {
      action: 'arena.judge',
      tileId,
      userId: uuid(1),
      correct: true,
    });
    expect(arena(judged).players[uuid(1)]!.score).toBeGreaterThan(0);
    const view = read(judged, people.guest);
    expect(view.players.find((p) => p.userId === uuid(1))!.score).toBe(
      arena(judged).players[uuid(1)]!.score
    );
  });

  it('leaves other players’ ids empty when the room has no alias', () => {
    const { state, people } = played();
    const view = read(
      state,
      people.guest,
      createMeetRoomAccountAlias(() => undefined)
    );
    expect(foreign(JSON.stringify(view), uuid(1))).toEqual([]);
    expect(view.players.filter((p) => p.userId === '')).toHaveLength(2);
  });
});

describe('presence avatars', () => {
  const roomId = 'ws:fields';
  const base = {
    exp: 2_000_000_000,
    limits: {
      video: {
        defaultCameraEnabled: false,
        maxFrameRate: 24,
        maxHeight: 720,
        maxWidth: 1280,
      },
    },
    meetingId: uuid(900),
    mode: 'call' as const,
    roomId,
    scopes: [],
    wsId: uuid(901),
  };
  const tokens = {
    host: {
      ...base,
      role: 'host' as const,
      userId: uuid(10),
      accountId: uuid(0),
    },
    member: {
      ...base,
      role: 'speaker' as const,
      userId: uuid(12),
      accountId: uuid(2),
    },
    guest: {
      ...base,
      role: 'speaker' as const,
      userId: uuid(11),
      accountId: uuid(1),
      guest: true as const,
      admission: 'lobby' as const,
    },
  };
  it('drops an uploaded avatar whose URL names the account for outside viewers', () => {
    const uploaded = `https://cdn.example/storage/v1/object/public/avatars/${uuid(2)}/a.webp`;
    const presence = [
      createMeetPresence(
        { ...tokens.member, avatarUrl: uploaded } as never,
        '2026-11-28T08:00:00.000Z'
      ),
      createMeetPresence(
        {
          ...tokens.host,
          avatarUrl: 'https://lh3.googleusercontent.com/a/photo',
        } as never,
        '2026-11-28T08:00:00.000Z'
      ),
    ];
    const frame: MeetRealtimeServerMessage = {
      type: 'presence',
      roomId,
      seq: 1,
      presence,
    };
    const guestView = meetFrameForViewer(frame, tokens.guest as never, alias);
    if (guestView.type !== 'presence') throw new Error('expected presence');
    expect(JSON.stringify(guestView)).not.toContain(uuid(2));
    expect(guestView.presence[0]!.avatarUrl).toBeUndefined();
    expect(guestView.presence[1]!.avatarUrl).toBe(
      'https://lh3.googleusercontent.com/a/photo'
    );
    expect(meetFrameForViewer(frame, tokens.member as never, alias)).toBe(
      frame
    );
  });
});
