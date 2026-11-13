import { expect, it, vi } from 'vitest';
import {
  createMeetRoomSnapshot,
  meetRealtimeTokenPayloadSchema,
} from '@tuturuuu/realtime/meet';
import { roomService } from '../../../../../apps/meet-realtime/src/room-service';
vi.mock('server-only', () => ({}));
import { meetingProviderTransport } from '../meeting-ai/server/provider-transport';
import { POST as wav } from '../../routes/api/meet-ai/[wsId]/[meetingId]/chunks/route';
import { POST as notes } from '../../routes/api/meet-ai/[wsId]/[meetingId]/route';
vi.mock('../meeting-ai/server/access', () => ({
  MeetAiError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
  meetAiResponse: async (work: () => Promise<unknown>) => {
    try {
      return Response.json(await work());
    } catch (e) {
      return Response.json(
        { error: (e as Error).message },
        { status: (e as { status: number }).status }
      );
    }
  },
}));
vi.mock('../meeting-ai/server/sessions', () => ({ readMeetAi: vi.fn() }));
vi.mock('next/server', () => ({ connection: vi.fn() }));
it('denies all room input and output commands without consulting environment gates', () => {
  const token = meetRealtimeTokenPayloadSchema.parse({
    exp: 2000000000,
    limits: {},
    mode: 'call',
    role: 'host',
    roomId: 'room',
    scopes: ['meet:server'],
    userId: 'synthetic',
  });
  for (const action of [
    'ai.reserve',
    'ai.review.claim',
    'live.reserve',
    'live.audio',
    'live.transcript',
    'live.share',
    'live.share.audio',
  ])
    expect(
      roomService(createMeetRoomSnapshot(), token, { action }).status
    ).toBe(403);
});
it('does not reach either a direct or service-bound room provider', async () => {
  await expect(meetingProviderTransport()).rejects.toThrow(
    'Room meeting AI is unavailable'
  );
});
it('rejects WAV and notes before reading input or using a provider', async () => {
  const request = new Request('https://meet.example.test/api', {
    method: 'POST',
  });
  expect((await wav(request, {} as never)).status).toBe(403);
  expect((await notes(request, {} as never)).status).toBe(403);
});
