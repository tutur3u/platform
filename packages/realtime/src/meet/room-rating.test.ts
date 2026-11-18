import { describe, expect, it } from 'vitest';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  meetRealtimeTokenPayloadSchema,
} from './index';
import {
  type RoomRatingStorage,
  roomRatingKey,
  roomRatingResponse,
} from './room-rating';
import { roomService } from './room-service';

const meetingId = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';
const guest = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';
const other = '1c7d6a52-6f2b-4f49-9e3f-0f0e2b6f8d11';
const member = '6a0f3d4e-2b7c-4f8a-9d1e-3c5b7a9e1f20';
const host = '2d4f6a8c-1e3b-4d5f-8a7c-9e1b3d5f7a9c';
const now = '2026-11-18T10:00:00Z';

const token = (
  userId: string,
  role: 'host' | 'speaker' = 'speaker',
  scopes = ['meet:server']
) =>
  meetRealtimeTokenPayloadSchema.parse({
    exp: 2000000000,
    limits: {},
    meetingId,
    mode: 'call',
    role,
    roomId: 'room',
    scopes,
    userId,
    accountId: userId,
    wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
  });

function memoryStorage() {
  const values = new Map<string, unknown>();
  let writes = 0;
  let queue = Promise.resolve();
  const storage: RoomRatingStorage = {
    transaction(run) {
      const result = queue.then(() =>
        run({
          get: async <V>(key: string) => values.get(key) as V | undefined,
          put: async (key, value) => {
            writes++;
            values.set(key, value);
          },
        })
      );
      queue = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    },
  };
  return { storage, values, writes: () => writes };
}

/** A room whose ended snapshot keeps the guests the room actually admitted. */
function endedRoom() {
  let state = createMeetRoomSnapshot();
  state = admitOrHold(state, token(guest), now).state;
  state = admitOrHold(state, token(other), now).state;
  return { ...state, ended: true };
}

async function call(
  storage: RoomRatingStorage,
  snapshot: ReturnType<typeof endedRoom>,
  actor: ReturnType<typeof token>,
  input: unknown
) {
  const response = await roomRatingResponse(storage, snapshot, actor, input);
  if (!response) return undefined;
  return { status: response.status, body: await response.json() };
}

describe('room rating', () => {
  it('lets an admitted attendee rate after the call and replaces repeat updates', async () => {
    const room = endedRoom();
    const memory = memoryStorage();
    expect(
      await call(memory.storage, room, token(guest), { action: 'rating.read' })
    ).toEqual({ status: 200, body: { rating: null } });
    expect(memory.writes()).toBe(0);
    expect(
      await call(memory.storage, room, token(guest), {
        action: 'rating.set',
        value: 4,
      })
    ).toEqual({ status: 200, body: { rating: 4 } });
    expect(
      await call(memory.storage, room, token(guest), {
        action: 'rating.set',
        value: 2,
      })
    ).toEqual({ status: 200, body: { rating: 2 } });
    expect(
      await call(memory.storage, room, token(guest), { action: 'rating.read' })
    ).toEqual({ status: 200, body: { rating: 2 } });
    expect([...memory.values.keys()]).toEqual([roomRatingKey(guest)]);
    expect(memory.values.get(roomRatingKey(guest))).toMatchObject({ value: 2 });
  });

  it('keeps each rating private to its account', async () => {
    const room = endedRoom();
    const memory = memoryStorage();
    await call(memory.storage, room, token(guest), {
      action: 'rating.set',
      value: 5,
    });
    expect(
      await call(memory.storage, room, token(other), { action: 'rating.read' })
    ).toEqual({ status: 200, body: { rating: null } });
    await call(memory.storage, room, token(other), {
      action: 'rating.set',
      value: 1,
    });
    expect(
      await call(memory.storage, room, token(guest), { action: 'rating.read' })
    ).toEqual({ status: 200, body: { rating: 5 } });
  });

  it('applies concurrent updates one at a time, last write wins', async () => {
    const room = endedRoom();
    const memory = memoryStorage();
    await Promise.all(
      [3, 1, 5].map((value) =>
        call(memory.storage, room, token(guest), {
          action: 'rating.set',
          value,
        })
      )
    );
    expect(memory.values.get(roomRatingKey(guest))).toMatchObject({ value: 5 });
  });

  it('denies workspace members who never attended, without writing', async () => {
    const memory = memoryStorage();
    const absent = token(member, 'speaker', [
      'meet:server',
      'meet:workspace-member',
    ]);
    for (const input of [
      { action: 'rating.read' },
      { action: 'rating.set', value: 3 },
    ])
      expect(await call(memory.storage, endedRoom(), absent, input)).toEqual({
        status: 403,
        body: { error: 'Only meeting attendees can rate this meeting' },
      });
    expect(memory.writes()).toBe(0);
  });

  it('denies a participant the host removed from the approved list', async () => {
    const room = endedRoom();
    const { [guest]: _, ...approved } = room.approved ?? {};
    const memory = memoryStorage();
    expect(
      (
        await call(memory.storage, { ...room, approved }, token(guest), {
          action: 'rating.set',
          value: 4,
        })
      )?.status
    ).toBe(403);
    expect(memory.writes()).toBe(0);
  });

  it('denies tokens without the signed server scope', async () => {
    const memory = memoryStorage();
    expect(
      (
        await call(memory.storage, endedRoom(), token(guest, 'speaker', []), {
          action: 'rating.set',
          value: 4,
        })
      )?.status
    ).toBe(403);
  });

  it('lets the signed host rate', async () => {
    const memory = memoryStorage();
    expect(
      await call(memory.storage, endedRoom(), token(host, 'host'), {
        action: 'rating.set',
        value: 3,
      })
    ).toEqual({ status: 200, body: { rating: 3 } });
  });

  it('leaves out-of-range values to the room service, which rejects them', async () => {
    const room = endedRoom();
    const memory = memoryStorage();
    for (const value of [0, 6, 2.5, '4'])
      expect(
        await call(memory.storage, room, token(guest), {
          action: 'rating.set',
          value,
        })
      ).toBeUndefined();
    expect(
      roomService(room, token(guest), { action: 'rating.set', value: 6 }).status
    ).toBe(400);
    expect(memory.writes()).toBe(0);
  });
});
