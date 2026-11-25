import { beforeEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  authority: vi.fn(),
  choice: vi.fn(),
  privateRequest: vi.fn(),
  context: vi.fn(),
  forward: vi.fn(),
  waitUntil: vi.fn(),
  roomAction: vi.fn(),
  routeLogs: vi.fn(),
  shared: false,
  sharedAt: undefined as number | undefined,
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
      public code?: string,
      public retryAfterSeconds?: number
    ) {
      super(message);
    }
  },
}));
vi.mock('@tuturuuu/meet-core/features/call/server/room-service', () => ({
  roomServiceFailureAction: fixture.roomAction,
  logRoomFailuresAtRoute: fixture.routeLogs,
  markFailureLogged: (error: unknown) => error,
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
      const problem = error as {
        status?: number;
        code?: string;
        retryAfterSeconds?: number;
      };
      // A route that leaks an untyped error would answer a generic 500.
      return Response.json(
        { code: problem.code, retryAfterSeconds: problem.retryAfterSeconds },
        { status: problem.status ?? 500 }
      );
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
    requirePrivateMiraChoiceState: async (access: unknown) => ({
      choice: await fixture.choice(access),
      shared: fixture.shared,
      sharedAt: fixture.sharedAt,
    }),
  })
);
vi.mock(
  '../../../../../../features/live-assistant/server/private-share',
  () => ({ forwardSharedTutorChat: fixture.forward })
);
vi.mock('../../../../../../features/call/server/personal-chat-request', () => ({
  requestPersonalMeetChat: fixture.privateRequest,
}));

import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import { POST } from './route';

beforeEach(() => {
  vi.resetAllMocks();
  fixture.shared = false;
  fixture.sharedAt = undefined;
  fixture.context.mockResolvedValue({
    env: { MEET_AI_DISABLED: 'false', GOOGLE_GENERATIVE_AI_API_KEY: 'test' },
    ctx: { waitUntil: fixture.waitUntil },
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

it('skips the tutor share entirely while sharing is off', async () => {
  fixture.privateRequest.mockResolvedValue({ text: 'A private reply' });
  expect((await ask()).status).toBe(200);
  expect(fixture.forward).not.toHaveBeenCalled();
  expect(fixture.waitUntil).not.toHaveBeenCalled();
});

it('forwards a shared tutor chat without holding the answer', async () => {
  fixture.shared = true;
  fixture.sharedAt = 1_800_000_000_000;
  fixture.privateRequest.mockResolvedValue({ text: 'A private reply' });
  // The forward never settles; the answer must still return.
  fixture.forward.mockReturnValue(new Promise(() => undefined));
  const response = await ask();
  expect(await response.json()).toEqual({ text: 'A private reply' });
  expect(fixture.forward).toHaveBeenCalledWith(
    expect.anything(),
    [
      { body: 'Hello', assistant: false },
      { body: 'A private reply', assistant: true },
    ],
    1_800_000_000_000
  );
  expect(fixture.waitUntil).toHaveBeenCalledWith(
    fixture.forward.mock.results[0]?.value
  );
});

it('types a failed room action as a retryable 503, never a generic 500', async () => {
  const failure = new MeetCallAccessError(500, 'Room action is unavailable');
  fixture.privateRequest.mockRejectedValue(failure);
  fixture.roomAction.mockImplementation((error: unknown) =>
    error === failure ? 'personal.begin' : undefined
  );
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = await ask();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    code: 'MIRA_PRIVATE_ROOM_UNAVAILABLE',
  });
  // Only the stage, room action and error class; never the question.
  expect(errors).toHaveBeenCalledWith('Private Mira answer failed', {
    stage: 'answer',
    action: 'personal.begin',
    name: 'Error',
  });
  expect(JSON.stringify(errors.mock.calls)).not.toContain('Hello');
  errors.mockRestore();
});

it.each([
  [503, 503, 7],
  [500, 503, undefined],
  [429, 429, 30],
])(
  'passes the room %s retry hint through as a typed %s',
  async (roomStatus, status, retryAfterSeconds) => {
    const failure = new MeetCallAccessError(
      roomStatus,
      'Room action is unavailable',
      undefined,
      retryAfterSeconds
    );
    fixture.privateRequest.mockRejectedValue(failure);
    fixture.roomAction.mockImplementation((error: unknown) =>
      error === failure ? 'personal.begin' : undefined
    );
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await ask();
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({
      code: 'MIRA_PRIVATE_ROOM_UNAVAILABLE',
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    });
    // A busy room is not a server failure; a failed one is logged once.
    expect(errors).toHaveBeenCalledTimes(roomStatus === 429 ? 0 : 1);
    errors.mockRestore();
  }
);

it('logs each failure once, at the route', async () => {
  const failure = new MeetCallAccessError(503, 'Room action is unavailable');
  fixture.privateRequest.mockRejectedValue(failure);
  fixture.roomAction.mockImplementation((error: unknown) =>
    error === failure ? 'personal.finish' : undefined
  );
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  await ask();
  expect(fixture.routeLogs).toHaveBeenCalledTimes(1);
  expect(errors).toHaveBeenCalledTimes(1);
  expect(errors).toHaveBeenCalledWith('Private Mira answer failed', {
    stage: 'answer',
    action: 'personal.finish',
    name: 'Error',
  });
  errors.mockRestore();
});

it('types an unexpected failure with a stable code', async () => {
  fixture.privateRequest.mockRejectedValue(new TypeError('provider broke'));
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = await ask();
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ code: 'MIRA_PRIVATE_FAILED' });
  expect(errors).toHaveBeenCalledWith('Private Mira answer failed', {
    stage: 'answer',
    action: undefined,
    name: 'TypeError',
  });
  errors.mockRestore();
});

it('answers when the runtime returns the bindings without a Promise', async () => {
  // The native Meet Worker's shim once did; `.catch` on it was a TypeError.
  fixture.context.mockReturnValue({
    env: { MEET_AI_DISABLED: 'false', GOOGLE_GENERATIVE_AI_API_KEY: 'test' },
    ctx: { waitUntil: fixture.waitUntil },
  });
  fixture.privateRequest.mockResolvedValue({ text: 'A private reply' });
  const response = await ask();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ text: 'A private reply' });
});
