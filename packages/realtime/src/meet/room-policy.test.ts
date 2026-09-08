import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  MeetRoomDurableObject,
  type MeetRoomEnv,
} from '../../../../apps/meet-realtime/src/room-do';

test('partial and concurrent policy updates preserve independent settings', async () => {
  const room = new MeetRoomDurableObject(
    {
      storage: { get: async () => undefined, put: async () => undefined },
      getWebSockets: () => [],
    } as unknown as DurableObjectState,
    {} as MeetRoomEnv
  );
  const request = (body?: Record<string, boolean>) =>
    room.fetch(
      new Request('https://meet.test/room-state', {
        method: body ? 'PATCH' : 'GET',
        headers: { 'x-meet-token': JSON.stringify({ role: 'host' }) },
        body: body ? JSON.stringify(body) : undefined,
      })
    );
  await request({ shareNotes: true });
  const partial = await request({ shareNotesAfterMeeting: true });
  assert.deepEqual((await partial.json()).settings, {
    shareNotes: true,
    shareNotesAfterMeeting: true,
  });
  await Promise.all([
    request({ shareNotes: false }),
    request({ shareNotesAfterMeeting: false }),
  ]);
  assert.deepEqual((await (await request()).json()).settings, {
    shareNotes: false,
    shareNotesAfterMeeting: false,
  });
});
