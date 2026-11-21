import { randomBytes } from 'node:crypto';
import { createCliAppSession } from '@tuturuuu/auth/cli-session';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as confirm } from './identity/confirm/route';
import { POST as linkCodes } from './identity/link-codes/route';
import { POST as submit } from './intents/route';

const { createClient, getUser, rpc } = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient,
  createAdminClient: () => ({
    schema: () => ({ rpc }),
  }),
}));
vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  extractIPFromHeaders: () => 'unknown',
  isIPBlocked: async () => null,
}));
vi.mock('@tuturuuu/utils/abuse-protection/user-suspension', () => ({
  checkUserSuspension: async () => ({ suspended: false }),
}));
vi.mock('@/lib/abuse-risk', () => ({
  enforceAdaptiveStepUpChallenge: async () => null,
  getAdaptiveRateLimitConfig: (config: unknown) => ({ config }),
  recordResponseAbuseSignal: vi.fn(),
  resolveWebAbuseDecision: async () => ({}),
}));
vi.mock('@/lib/infrastructure/log-drain', () => ({
  setLogDrainUserContext: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => ({ allowed: true, headers: {} }),
}));

const actorId = 'fc000000-0000-4000-8000-000000000001';
const intentId = 'fc000000-0000-4000-8000-000000000002';
const mobileBearer = 'fixture.supabase.jwt';

const writes = [
  {
    path: 'intents',
    handler: submit,
    body: {
      kind: 'approve.deploy',
      payload: {
        projectKey: 'platform',
        targetKey: 'release',
        environment: 'production',
        commitSha: 'a'.repeat(40),
      },
    },
    rpcName: 'fleet_submit_resolved_intent',
    rpcResult: {
      single: async () => ({
        data: { reason_code: 'accepted', intent_id: intentId },
        error: null,
      }),
    },
    status: 201,
  },
  {
    path: 'identity/link-codes',
    handler: linkCodes,
    body: {},
    rpcName: 'fleet_create_link_code',
    rpcResult: { data: true, error: null },
    status: 201,
  },
  {
    path: 'identity/confirm',
    handler: confirm,
    body: { linkId: intentId, confirmationCode: 'a'.repeat(43) },
    rpcName: 'fleet_confirm_link_code',
    rpcResult: {
      data: { reason: 'confirmed', channel: 'zalo', accountLabel: 'Desk' },
      error: null,
    },
    status: 200,
  },
];

function request(path: string, body: unknown, token: string) {
  return new NextRequest(`https://tuturuuu.com/api/v1/fleet/${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-user-id': intentId,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv(
    'TUTURUUU_APP_COORDINATION_SECRET',
    randomBytes(32).toString('hex')
  );
  createClient.mockImplementation((incoming: NextRequest) => ({
    auth: {
      getUser: () => getUser(incoming.headers.get('authorization')),
    },
  }));
  getUser.mockImplementation(async (authorization: string | null) =>
    authorization === `Bearer ${mobileBearer}`
      ? { data: { user: { id: actorId } }, error: null }
      : { data: { user: null }, error: new Error('Invalid token') }
  );
});

afterEach(() => vi.unstubAllEnvs());

describe.each(writes)(
  'Fleet POST $path',
  ({ body, handler, path, rpcName, rpcResult, status }) => {
    it('writes with the verified mobile user and ignores x-user-id', async () => {
      rpc.mockReturnValueOnce(rpcResult);
      const response = await handler(request(path, body, mobileBearer));
      expect(response.status).toBe(status);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(getUser).toHaveBeenCalledExactlyOnceWith(`Bearer ${mobileBearer}`);
      expect(rpc).toHaveBeenCalledExactlyOnceWith(
        rpcName,
        expect.objectContaining({ p_actor_id: actorId })
      );
    });

    it('refuses a signed CLI platform session before any write', async () => {
      const { access } = createCliAppSession({ userId: actorId });
      const response = await handler(request(path, body, access.token));
      expect(response.status).toBe(401);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(createClient).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    });

    it('refuses an unknown bearer before any write', async () => {
      const response = await handler(request(path, body, 'unknown.bearer.jwt'));
      expect(response.status).toBe(401);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(rpc).not.toHaveBeenCalled();
    });
  }
);
