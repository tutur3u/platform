import { beforeEach, vi } from 'vitest';
export const f = vi.hoisted(() => ({
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
  getCloudflareContext: f.cloudflare,
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
  callRoomService: f.callRoom,
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
          canReadWorkspace: f.member,
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
    f.authorized && input.workspaceMember && input.disabledBinding === 'false'
      ? { allowed: true, authority: 'verified-personal' }
      : { allowed: false, reason: 'workspace' },
}));
vi.mock('@tuturuuu/meet-core/features/live-assistant/token', () => ({
  signLiveSession: f.sign,
}));
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
  f.cloudflare.mockResolvedValue({
    env: {
      MEET_LIVE: {
        idFromName: (id: string) => id,
        get: () => ({ fetch: f.fetch }),
      },
      GOOGLE_GENERATIVE_AI_API_KEY: 'synthetic-key',
      MEET_REALTIME_TOKEN_SECRET: 'synthetic-secret',
      MEET_AI_DISABLED: disabled,
    },
  });
beforeEach(() => {
  vi.resetAllMocks();
  f.authorized = true;
  f.member = true;
  f.sessions = [];
  f.order = [];
  f.choice = {
    choice: 'continue',
    version,
    meetingId,
    accountId: actorId,
    recordedAt: 1000,
    revision: 1,
  };
  f.sign.mockImplementation((claims: Record<string, unknown>) => {
    f.order.push('token');
    f.claims = claims;
    return 'synthetic-token';
  });
  f.fetch.mockImplementation(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (url.endsWith('/initialize')) f.claims = body.claims;
    if (body.action === 'stop') f.order.push('stop');
    return Response.json(
      url.endsWith('/control') && body.action === 'resume'
        ? f.claims
        : { ok: true }
    );
  });
  f.callRoom.mockImplementation(
    async (
      _access: unknown,
      input: { action: string; sessionId?: string; choice?: string }
    ) => {
      f.order.push(input.action);
      if (input.action === 'mira.private.register')
        f.sessions.push(input.sessionId!);
      if (input.action === 'mira.private.ended')
        f.sessions = f.sessions.filter((id) => id !== input.sessionId);
      if (input.action === 'mira.private.choice')
        f.choice = {
          ...f.choice!,
          choice: input.choice!,
          version,
          meetingId,
          accountId: actorId,
          recordedAt: 1001,
          revision: (f.choice?.revision ?? 0) + 1,
        };
      return {
        version,
        admitted: true,
        choice: f.choice,
        sessions: f.sessions,
      };
    }
  );
  bind('false');
});
