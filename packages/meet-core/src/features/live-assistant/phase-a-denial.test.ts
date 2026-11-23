import { expect, it, vi } from 'vitest';
import {
  createMeetRoomSnapshot,
  meetRealtimeTokenPayloadSchema,
} from '@tuturuuu/realtime/meet';
import { roomService } from '../../../../../apps/meet-realtime/src/room-service';
vi.mock('server-only', () => ({}));
const handlers = vi.hoisted(() => ({
  chunk: vi.fn(),
  change: vi.fn(),
}));
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
vi.mock('../meeting-ai/server/sessions', () => ({
  readMeetAi: vi.fn(),
  changeMeetAi: handlers.change,
}));
vi.mock('../meeting-ai/server/chunks', () => ({
  transcribeMeetChunk: handlers.chunk,
}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
it('denies room Live commands and fences room chat without consulting environment gates', () => {
  const token = meetRealtimeTokenPayloadSchema.parse({
    exp: 2000000000,
    limits: {},
    mode: 'call',
    role: 'host',
    roomId: 'room',
    scopes: ['meet:server'],
    userId: '00000000-0000-4000-8000-000000000001',
    meetingId: '00000000-0000-4000-8000-000000000002',
    wsId: '00000000-0000-4000-8000-000000000003',
  });
  // Room chat waits for every admitted participant's Continue; an empty or
  // unconsented room never releases chat context.
  for (const action of ['ai.reserve', 'ai.review.claim'])
    expect(
      roomService(createMeetRoomSnapshot(), token, { action })
    ).toMatchObject({
      status: 409,
      body: { code: 'MIRA_ROOM_CONSENT_REQUIRED' },
    });
  for (const action of [
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
it('uses only the Meet Worker key for Meet and keeps the Parley room provider closed', async () => {
  await expect(meetingProviderTransport()).resolves.toEqual({});
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_MEETING_APP', 'parley');
  const parley = await import('../meeting-ai/server/provider-transport');
  await expect(parley.meetingProviderTransport()).rejects.toThrow(
    'Room meeting AI is unavailable'
  );
  vi.unstubAllEnvs();
});
it('routes WAV and notes through the gated handlers', async () => {
  const request = new Request('https://meet.example.test/api', {
    method: 'POST',
  });
  handlers.chunk.mockResolvedValue({ status: 'completed' });
  handlers.change.mockResolvedValue({ sessionId: 'session' });
  expect((await wav(request, {} as never)).status).toBe(200);
  expect((await notes(request, {} as never)).status).toBe(200);
  expect(handlers.chunk).toHaveBeenCalledOnce();
  expect(handlers.change).toHaveBeenCalledOnce();
});
