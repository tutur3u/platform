import { expect, it } from 'vitest';
import type { MeetRoomController } from '../call/lib/room-controller';
import { deliverRoomAssistantAudio, privateMiraUsers } from './room-audio';

it('lists the people using Mira privately and never plays room Mira audio', () => {
  const participants = {
    synthetic: {
      userId: 'synthetic',
      displayName: 'Synthetic person',
      miraPrivate: true,
    },
    other: { userId: 'other', displayName: 'Other person' },
  } as unknown as MeetRoomController['state']['participants'];
  expect(privateMiraUsers(participants)).toEqual([
    { userId: 'synthetic', displayName: 'Synthetic person' },
  ]);
  expect(privateMiraUsers({})).toEqual([]);
  expect(
    deliverRoomAssistantAudio('synthetic', {
      type: 'assistant.audio',
      sessionId: 'synthetic',
      data: 'synthetic',
      sampleRate: 24000,
    } as never)
  ).toBe(false);
});
