import { randomBytes } from 'node:crypto';
import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import { createCliAppSession } from '@tuturuuu/auth/cli-session';
import type { MfaSessionProof } from '@tuturuuu/utils/required-mfa-policy';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as listAccess } from './access/route';
import { POST as control } from './control/route';
import { POST as displayValues } from './display-values/route';
import { POST as revoke } from './grants/revoke/route';
import { POST as grant } from './grants/route';
import { FLEET_OWNER_MFA_MAX_AGE_SECONDS } from './owner-session';
import { POST as projects } from './projects/route';

const { createClient, getUser, rateLimit, rpc } = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  rateLimit: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient,
  createAdminClient: () => ({
    schema: (name: string) => {
      expect(name).toBe('private');
      return { rpc };
    },
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
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: rateLimit }));

const ownerId = 'fd000000-0000-4000-8000-000000000001';
const granteeId = 'fd000000-0000-4000-8000-000000000002';
const supabaseBearer = 'fixture.supabase.jwt';
const now = () => Math.floor(Date.now() / 1000);

function mastermindSession(
  mfa: MfaSessionProof | null = { sessionId: 's', verifiedAt: now() - 60 },
  targetApp = 'mastermind'
) {
  return createAppSessionToken({
    email: 'owner@example.com',
    expiresInSeconds: 300,
    mfa: mfa ?? undefined,
    scopes: ['internal-app:session'],
    targetApp,
    userId: ownerId,
  }).token;
}

function request(
  path: string,
  token: string,
  body?: unknown,
  headers: Record<string, string> = {}
) {
  return new NextRequest(`https://tuturuuu.com/api/v1/fleet/owner/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      'x-user-id': granteeId,
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const grantBody = {
  email: 'grantee@example.com',
  tier: 'steerer',
  capabilities: ['status.read', 'comment', 'approve.low'],
  projectKeys: ['platform'],
  expiresAt: '2027-01-01T00:00:00.000Z',
  questionsPerHour: 30,
  intentsPerDay: 10,
  modelBudgetPerMonth: 0,
  expectedGeneration: null,
};

const consoleRead = {
  stopped: false,
  generation: '4',
  grants: [
    {
      userId: granteeId,
      email: 'grantee@example.com',
      tier: 'steerer',
      capabilities: ['status.read', 'comment'],
      projects: ['platform'],
      expiresAt: null,
      revokedAt: null,
      status: 'active',
      generation: '2',
      questionsPerHour: 30,
      intentsPerDay: 10,
      modelBudgetPerMonth: 0,
    },
  ],
  projects: [
    {
      key: 'platform',
      nameEn: 'Platform',
      nameVi: 'Nền tảng',
      displayValues: { lane: ['Web'], releaseTitle: [], readinessItem: [] },
    },
  ],
};

const mutations = [
  {
    path: 'grants',
    handler: grant,
    body: grantBody,
    rpcName: 'fleet_owner_grant_access',
    args: {
      p_actor_id: ownerId,
      p_email: 'grantee@example.com',
      p_tier: 'steerer',
      p_capabilities: ['status.read', 'comment', 'approve.low'],
      p_project_keys: ['platform'],
      p_expires_at: '2027-01-01T00:00:00.000Z',
      p_questions_per_hour: 30,
      p_intents_per_day: 10,
      p_model_budget_per_month: 0,
      p_expected_generation: null,
    },
    result: { result: 'granted', userId: granteeId, generation: '1' },
  },
  {
    path: 'grants/revoke',
    handler: revoke,
    body: { userId: granteeId, expectedGeneration: '2' },
    rpcName: 'fleet_owner_revoke_access',
    args: {
      p_actor_id: ownerId,
      p_user_id: granteeId,
      p_expected_generation: '2',
    },
    result: { result: 'revoked', generation: '3' },
  },
  {
    path: 'control',
    handler: control,
    body: { stopped: true, expectedGeneration: '4' },
    rpcName: 'fleet_owner_set_stopped',
    args: { p_actor_id: ownerId, p_stopped: true, p_expected_generation: '4' },
    result: { result: 'stopped', stopped: true, generation: '5' },
  },
  {
    path: 'projects',
    handler: projects,
    body: { key: 'platform', nameEn: 'Platform', nameVi: 'Nền tảng' },
    rpcName: 'fleet_owner_upsert_project',
    args: {
      p_actor_id: ownerId,
      p_key: 'platform',
      p_name_en: 'Platform',
      p_name_vi: 'Nền tảng',
    },
    result: { result: 'created' },
  },
  {
    path: 'display-values',
    handler: displayValues,
    body: {
      projectKey: 'platform',
      field: 'releaseTitle',
      value: 'November release',
      approved: true,
    },
    rpcName: 'fleet_owner_set_display_value',
    args: {
      p_actor_id: ownerId,
      p_project_key: 'platform',
      p_field: 'releaseTitle',
      p_value: 'November release',
      p_approved: true,
    },
    result: { result: 'approved' },
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv(
    'TUTURUUU_APP_COORDINATION_SECRET',
    randomBytes(32).toString('hex')
  );
  rateLimit.mockResolvedValue({ allowed: true, headers: {} });
  createClient.mockImplementation((incoming: NextRequest) => ({
    auth: { getUser: () => getUser(incoming.headers.get('authorization')) },
  }));
  getUser.mockImplementation(async (authorization: string | null) =>
    authorization === `Bearer ${supabaseBearer}`
      ? { data: { user: { id: ownerId } }, error: null }
      : { data: { user: null }, error: new Error('Invalid token') }
  );
});

afterEach(() => vi.unstubAllEnvs());

async function expectRefusal(
  response: Response,
  status: number,
  error?: string
) {
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  if (error) expect(await response.json()).toEqual({ error });
  expect(rpc).not.toHaveBeenCalled();
}

describe('Fleet Owner console reads', () => {
  it('lists access for the verified Owner session and ignores x-user-id', async () => {
    rpc.mockResolvedValueOnce({ data: consoleRead, error: null });
    const response = await listAccess(
      request('access', mastermindSession())
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual(consoleRead);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('fleet_owner_list_access', {
      p_actor_id: ownerId,
    });
    expect(rateLimit).not.toHaveBeenCalledWith(
      expect.stringMatching(/^fleet:owner:/),
      expect.anything()
    );
  });

  it('refuses a database read that fails the response schema', async () => {
    rpc.mockResolvedValueOnce({
      data: { ...consoleRead, grants: [{ userId: granteeId }] },
      error: null,
    });
    const response = await listAccess(
      request('access', mastermindSession())
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'owner_unavailable' });
  });

  it('answers 403 when the database refuses a non-Owner', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'Fleet Owner access required' },
    });
    const response = await listAccess(
      request('access', mastermindSession())
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'forbidden' });
  });
});

describe('Fleet Owner console sessions', () => {
  const routes = [
    { path: 'access', handler: listAccess, body: undefined },
    ...mutations,
  ];

  it.each(routes)('$path requires an MFA proof', async ({
    path,
    handler,
    body,
  }) => {
    await expectRefusal(
      await handler(request(path, mastermindSession(null), body)),
      403,
      'mfa_required'
    );
  });

  it.each(routes)('$path refuses an MFA proof older than the window', async ({
    path,
    handler,
    body,
  }) => {
    const stale = now() - FLEET_OWNER_MFA_MAX_AGE_SECONDS - 1;
    await expectRefusal(
      await handler(
        request(
          path,
          mastermindSession({ sessionId: 's', verifiedAt: stale }),
          body
        )
      ),
      403,
      'mfa_required'
    );
  });

  it.each(routes)('$path refuses an expired MFA approval', async ({
    path,
    handler,
    body,
  }) => {
    const proof = {
      sessionId: 's',
      verifiedAt: now() - 120,
      expiresAt: now() - 1,
    };
    await expectRefusal(
      await handler(request(path, mastermindSession(proof), body)),
      403,
      'mfa_required'
    );
  });

  it.each(routes)('$path refuses the platform CLI audience', async ({
    path,
    handler,
    body,
  }) => {
    const { access } = createCliAppSession({
      userId: ownerId,
      mfa: { sessionId: 's', verifiedAt: now() - 60 },
    });
    await expectRefusal(await handler(request(path, access.token, body)), 401);
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each(routes)('$path refuses a Supabase session without a Mastermind session', async ({
    path,
    handler,
    body,
  }) => {
    await expectRefusal(
      await handler(request(path, supabaseBearer, body)),
      403,
      'owner_session_required'
    );
  });

  it.each(routes)('$path refuses a desk bearer', async ({
    path,
    handler,
    body,
  }) => {
    await expectRefusal(
      await handler(
        request(path, `ttr_fleet_desk_mira.${'a'.repeat(43)}`, body)
      ),
      401
    );
  });
});

describe.each(mutations)(
  'Fleet Owner POST $path',
  ({ path, handler, body, rpcName, args, result }) => {
    it('passes the verified actor and typed arguments', async () => {
      rpc.mockResolvedValueOnce({ data: result, error: null });
      const response = await handler(request(path, mastermindSession(), body));
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(await response.json()).toEqual(result);
      expect(rpc).toHaveBeenCalledExactlyOnceWith(rpcName, args);
      expect(rateLimit).toHaveBeenCalledWith(
        `fleet:owner:mutate:${ownerId}`,
        { windowMs: 60_000, maxRequests: 20 }
      );
    });

    it('rate-limits Owner mutations before the database', async () => {
      rateLimit.mockImplementation(async (key: string) =>
        key.startsWith('fleet:owner:')
          ? NextResponse.json({ error: 'Too Many Requests' }, { status: 429 })
          : { allowed: true, headers: {} }
      );
      await expectRefusal(
        await handler(request(path, mastermindSession(), body)),
        429,
        'rate_limited'
      );
    });

    it('rejects unknown fields', async () => {
      await expectRefusal(
        await handler(
          request(path, mastermindSession(), { ...body, actorId: ownerId })
        ),
        400,
        'invalid_request'
      );
    });

    it('rejects a body that is not JSON', async () => {
      await expectRefusal(
        await handler(
          request(path, mastermindSession(), body, {
            'content-type': 'text/plain',
          })
        ),
        415,
        'unsupported_media_type'
      );
    });

    it('maps a stale generation or unavailable storage to fixed codes', async () => {
      rpc.mockResolvedValueOnce({
        data: { result: 'generation_changed', generation: null },
        error: null,
      });
      const stale = await handler(request(path, mastermindSession(), body));
      expect(stale.status).toBe(409);
      expect(await stale.json()).toEqual({ error: 'generation_changed' });

      rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000' } });
      const down = await handler(request(path, mastermindSession(), body));
      expect(down.status).toBe(503);
      expect(await down.json()).toEqual({ error: 'owner_unavailable' });
    });
  }
);

describe('Fleet Owner grant schema', () => {
  it.each([
    ['the Owner tier', { tier: 'owner' }],
    ['a capability above the tier ceiling', { tier: 'observer' }],
    ['an Owner capability', { capabilities: ['access.grant'] }],
    ['an invalid email', { email: 'not-an-email' }],
    ['no projects', { projectKeys: [] }],
    ['duplicate projects', { projectKeys: ['platform', 'platform'] }],
    ['an invalid project key', { projectKeys: ['Platform'] }],
    ['an expiry without milliseconds', { expiresAt: '2027-01-01T00:00:00Z' }],
    ['negative caps', { questionsPerHour: -1 }],
    ['an oversized budget', { modelBudgetPerMonth: 1_000_000_001 }],
    ['a numeric generation', { expectedGeneration: 2 }],
  ])('rejects %s', async (_label, patch) => {
    await expectRefusal(
      await grant(
        request('grants', mastermindSession(), { ...grantBody, ...patch })
      ),
      400,
      'invalid_request'
    );
  });

  it.each([
    ['unknown_user', 404],
    ['unknown_project', 404],
    ['invalid_grant', 400],
    ['grant_exists', 409],
  ])('maps %s to %i', async (code, status) => {
    rpc.mockResolvedValueOnce({
      data: { result: code, userId: null, generation: null },
      error: null,
    });
    const response = await grant(
      request('grants', mastermindSession(), grantBody)
    );
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: code });
  });

  it('rejects a display value with surrounding space or a control character', async () => {
    for (const value of [' Release', 'Release\u0007']) {
      await expectRefusal(
        await displayValues(
          request('display-values', mastermindSession(), {
            projectKey: 'platform',
            field: 'lane',
            value,
            approved: true,
          })
        ),
        400,
        'invalid_request'
      );
    }
  });
});
