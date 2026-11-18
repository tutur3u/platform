import { beforeEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  authority: vi.fn(),
  choice: vi.fn(),
  privateRequest: vi.fn(),
  context: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: fixture.context,
}));
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
vi.mock('@tuturuuu/meet-core/features/call/server/room-service', () => ({
  roomRoute: async (
    _request: Request,
    meetingId: string,
    work: (access: unknown) => Promise<unknown>
  ) => {
    try {
      return Response.json(
        await work({
          user: { id: 'actor' },
          meeting: { id: meetingId, ws_id: 'workspace' },
          canReadWorkspace: true,
        })
      );
    } catch (error) {
      const problem = error as { status: number; code?: string };
      return Response.json({ code: problem.code }, { status: problem.status });
    }
  },
}));
vi.mock(
  '../../../../../../features/live-assistant/server/demo-authority',
  () => ({
    readMiraDemoAuthority: fixture.authority,
  })
);
vi.mock(
  '../../../../../../features/live-assistant/server/private-consent',
  () => ({
    requirePrivateMiraChoice: fixture.choice,
  })
);
vi.mock('../../../../../../features/call/server/personal-chat-request', () => ({
  requestPersonalMeetChat: fixture.privateRequest,
}));

import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import { POST } from './route';

beforeEach(() => {
  vi.resetAllMocks();
  fixture.context.mockResolvedValue({
    env: { MEET_AI_DISABLED: 'false', GOOGLE_GENERATIVE_AI_API_KEY: 'test' },
  });
  fixture.authority.mockResolvedValue({ allowed: true });
  fixture.choice.mockResolvedValue({ revision: 1 });
});

function ask() {
  return POST(
    new Request('https://meet.example.invalid/api', {
      method: 'POST',
      body: JSON.stringify({
        requestId: crypto.randomUUID(),
        startedAt: Date.now(),
        question: 'Hello',
        timezone: 'UTC',
        history: [],
      }),
    }),
    { params: Promise.resolve({ meetingId: 'meeting' }) }
  );
}

it('answers through the existing metered private flow and rechecks consent', async () => {
  fixture.privateRequest.mockImplementation(
    async (_access, _payload, provider) => {
      await provider.checkConsent();
      return { text: 'A private reply' };
    }
  );
  const response = await ask();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ text: 'A private reply' });
  expect(fixture.choice).toHaveBeenCalledTimes(3);
});

it('denies a missing Continue without reaching the metered flow', async () => {
  fixture.choice.mockRejectedValue(
    new MeetCallAccessError(403, 'Consent required', 'MIRA_CONSENT_REQUIRED')
  );
  const response = await ask();
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ code: 'MIRA_CONSENT_REQUIRED' });
  expect(fixture.privateRequest).not.toHaveBeenCalled();
});

it('preserves the real credit failure response', async () => {
  fixture.privateRequest.mockRejectedValue(
    new MeetCallAccessError(
      403,
      'Credits unavailable',
      'MIRA_CREDITS_UNAVAILABLE'
    )
  );
  const response = await ask();
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ code: 'MIRA_CREDITS_UNAVAILABLE' });
});
