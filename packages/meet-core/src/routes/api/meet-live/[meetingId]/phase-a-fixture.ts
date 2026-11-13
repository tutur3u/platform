import { beforeEach, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  cloudflare: vi.fn(),
  fetch: vi.fn(),
  callRoom: vi.fn(),
  sign: vi.fn(),
  authorized: true,
  member: true,
  choice: null as null | {
    choice: string;
    accountId: string;
    meetingId: string;
    version: string;
    recordedAt: number;
    revision: number;
  },
  sessions: [] as string[],
  claims: {} as Record<string, unknown>,
  order: [] as string[],
}));
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mocks.cloudflare,
}));
vi.mock('@tuturuuu/meet-core/features/call/lib/call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));
vi.mock('@tuturuuu/meet-core/features/call/server/room-service', () => ({
  callRoomService: mocks.callRoom,
  personalWorkspace: async () => '00000000-0000-4000-8000-000000000003',
  roomRoute: async (
    _request: Request,
    id: string,
    work: (access: unknown) => Promise<unknown>
  ) => {
    try {
      return Response.json(
        await work({
          user: { id: '00000000-0000-4000-8000-000000000001' },
          canReadWorkspace: mocks.member,
          isHost: true,
          displayName: 'Synthetic person',
          meeting: {
            id,
            ws_id: '00000000-0000-4000-8000-000000000003',
            name: 'Synthetic room',
          },
        })
      );
    } catch (error) {
      return Response.json(
        { error: (error as Error).message },
        { status: (error as { status?: number }).status ?? 500 }
      );
    }
  },
}));
vi.mock('../../../../features/live-assistant/server/demo-authority', () => ({
  readMiraDemoAuthority: async (input: {
    disabledBinding: unknown;
    workspaceMember: boolean;
  }) =>
    mocks.authorized &&
    input.workspaceMember &&
    input.disabledBinding === 'false'
      ? { allowed: true, authority: 'verified-personal' }
      : { allowed: false, reason: 'workspace' },
}));
vi.mock('@tuturuuu/meet-core/features/live-assistant/token', () => ({
  signLiveSession: mocks.sign,
}));
export const f = mocks;
export { POST as live } from './route';
export { POST as review } from './review/route';
export const meetingId = '00000000-0000-4000-8000-000000000002';
export const sessionId = '00000000-0000-4000-8000-000000000004';
export const actorId = '00000000-0000-4000-8000-000000000001';
export const version = '2026-11-13-private-v1';
export const call = (
  handler: (
    request: Request,
    context: { params: Promise<{ meetingId: string }> }
  ) => Promise<Response>,
  body: unknown
) =>
  handler(
    new Request(`https://meet.example.test/api/meet-live/${meetingId}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ meetingId }) }
  );
export const bind = (disabled: string | undefined) =>
  mocks.cloudflare.mockResolvedValue({
    env: {
      MEET_LIVE: {
        idFromName: (id: string) => id,
        get: () => ({ fetch: mocks.fetch }),
      },
      GOOGLE_GENERATIVE_AI_API_KEY: 'synthetic-key',
      MEET_REALTIME_TOKEN_SECRET: 'synthetic-secret',
      MEET_AI_DISABLED: disabled,
    },
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorized = true;
  mocks.member = true;
  mocks.sessions = [];
  mocks.order = [];
  mocks.choice = {
    choice: 'continue',
    version,
    meetingId,
    accountId: actorId,
    recordedAt: 1000,
    revision: 1,
  };
  mocks.sign.mockImplementation((claims: Record<string, unknown>) => {
    mocks.order.push('token');
    mocks.claims = claims;
    return 'synthetic-token';
  });
  mocks.fetch.mockImplementation(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (url.endsWith('/initialize')) mocks.claims = body.claims;
    if (body.action === 'stop') mocks.order.push('stop');
    return Response.json(
      url.endsWith('/control') && body.action === 'resume'
        ? mocks.claims
        : { ok: true }
    );
  });
  mocks.callRoom.mockImplementation(
    async (
      _access: unknown,
      input: { action: string; sessionId?: string; choice?: string }
    ) => {
      mocks.order.push(input.action);
      if (input.action === 'mira.private.register')
        mocks.sessions.push(input.sessionId!);
      if (input.action === 'mira.private.ended')
        mocks.sessions = mocks.sessions.filter((id) => id !== input.sessionId);
      if (input.action === 'mira.private.choice')
        mocks.choice = {
          ...mocks.choice!,
          choice: input.choice!,
          version,
          meetingId,
          accountId: actorId,
          recordedAt: 1001,
          revision: (mocks.choice?.revision ?? 0) + 1,
        };
      return {
        version,
        admitted: true,
        choice: mocks.choice,
        sessions: mocks.sessions,
      };
    }
  );
  bind('false');
});
