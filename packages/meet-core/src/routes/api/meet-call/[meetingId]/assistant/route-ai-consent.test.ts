import { beforeEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  aiConsent: vi.fn(),
  generate: vi.fn(),
  authority: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/meet-core/features/call/lib/call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string,
      public code?: string
    ) {
      super(message);
    }
  },
}));
vi.mock('../../../../../features/call/server/ai-data-consent', () => ({
  requireMeetAiDataConsent: fixture.aiConsent,
}));
vi.mock(
  '@tuturuuu/meet-core/features/call/server/assistant-generation',
  () => ({
    generateMeetAssistant: fixture.generate,
  })
);
vi.mock('@tuturuuu/meet-core/features/call/server/room-service', () => ({
  callRoomService: vi.fn(async () => ({ ok: true })),
  roomRoute: async (
    _request: Request,
    meetingId: string,
    work: (access: unknown) => Promise<unknown>
  ) => {
    try {
      return Response.json(
        await work({ user: { id: 'actor' }, meeting: { id: meetingId } })
      );
    } catch (error) {
      const problem = error as { status?: number; code?: string };
      return Response.json(
        { code: problem.code },
        { status: problem.status ?? 500 }
      );
    }
  },
}));
vi.mock(
  '../../../../../features/live-assistant/server/room-mira-authority',
  () => ({ requireRoomMiraAuthority: fixture.authority })
);
vi.mock('next/server', () => ({ connection: async () => undefined }));

import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import { POST as assistantPost } from './route';
import { POST as reviewPost } from './review/route';

const params = { params: Promise.resolve({ meetingId: 'meeting' }) };
const post = (body: unknown) =>
  new Request('https://meet.example.invalid/api', {
    method: 'POST',
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  fixture.aiConsent.mockResolvedValue(undefined);
  fixture.generate.mockResolvedValue({ text: 'reply' });
});

it('refuses room @mira without Mira AI data consent', async () => {
  fixture.aiConsent.mockRejectedValue(
    new MeetCallAccessError(403, 'ai_consent_required', 'ai_consent_required')
  );
  const response = await assistantPost(post({ messageId: 'm1' }), params);
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ code: 'ai_consent_required' });
  expect(fixture.aiConsent).toHaveBeenCalledWith(expect.any(Request), 'actor');
  expect(fixture.generate).not.toHaveBeenCalled();
});

it('generates room @mira once consent passes', async () => {
  const response = await assistantPost(post({ messageId: 'm1' }), params);
  expect(response.status).toBe(200);
  expect(fixture.generate).toHaveBeenCalledTimes(1);
});

it('checks consent before resuming a reviewed turn, not for share or discard', async () => {
  fixture.aiConsent.mockRejectedValue(
    new MeetCallAccessError(403, 'ai_consent_required', 'ai_consent_required')
  );
  const approve = await reviewPost(
    post({ messageId: 'm1', revision: 1, action: 'approve' }),
    params
  );
  expect(approve.status).toBe(403);
  expect(fixture.generate).not.toHaveBeenCalled();

  const discard = await reviewPost(
    post({ messageId: 'm1', revision: 1, action: 'discard' }),
    params
  );
  expect(discard.status).toBe(200);
  expect(fixture.aiConsent).toHaveBeenCalledTimes(1);
});
