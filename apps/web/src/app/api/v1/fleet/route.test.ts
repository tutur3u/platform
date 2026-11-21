import { createHash, randomBytes } from 'node:crypto';
import type {
  FleetDigestSection,
  FleetDigestSnapshot,
} from '@tuturuuu/internal-api/fleet';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getAccess } from './access/route';
import { GET as getDigest, PUT as publish } from './digest/route';

const { rpc, actor, authOptions } = vi.hoisted(() => {
  const authOptions: unknown[] = [];
  return { rpc: vi.fn(), actor: vi.fn<() => string | null>(), authOptions };
});

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => ({
    schema: (name: string) => {
      expect(name).toBe('private');
      return { rpc };
    },
  }),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (
    handler: (
      request: NextRequest,
      context: { user: { id: string } }
    ) => Promise<NextResponse>,
    options: unknown
  ) => {
    authOptions.push(options);
    return (request: NextRequest) => {
      const id = actor();
      return id
        ? handler(request, { user: { id } })
        : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    };
  },
}));

const actorId = '21dfc803-cfa0-4345-80f9-d32248704e6d';
const disabledAccess = {
  enabled: false,
  tier: null,
  projects: [],
  capabilities: [],
  stopped: false,
};
const liveAccess = {
  enabled: true,
  tier: 'observer',
  projects: ['platform'],
  capabilities: ['status.read'],
  stopped: false,
};
const section = {
  projectKey: 'platform',
  generatedAt: '2026-11-21T01:30:00.000Z',
  lanes: [{ lane: 'Observer', state: 'ready', blockerCodes: [] }],
} satisfies FleetDigestSnapshot;
const storedSection = {
  ...section,
  receivedAt: '2026-11-21T01:30:01.000Z',
  stale: false,
} satisfies FleetDigestSection;

function request(path: string) {
  return new NextRequest(`https://tuturuuu.com/api/v1/fleet/${path}`, {
    headers: { 'x-user-id': 'forged-user' },
  });
}

describe('Fleet Observer reads', () => {
  beforeEach(() => {
    rpc.mockReset();
    actor.mockReturnValue(actorId);
  });

  it('binds app sessions to the Fleet audiences', () => {
    expect(authOptions).toContainEqual({
      allowAppSessionAuth: { targetApp: ['platform', 'mastermind'] },
      preferSupabaseSessionAuth: true,
    });
  });

  it('denies requests without a verified session before querying Fleet', async () => {
    actor.mockReturnValue(null);
    const response = await getAccess(request('access'));
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('defaults to disabled and passes the verified actor to the live lookup', async () => {
    rpc.mockResolvedValue({ data: disabledAccess, error: null });
    const response = await getAccess(request('access'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(disabledAccess);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('fleet_get_access', {
      p_actor_id: actorId,
    });
  });

  it('reports a live stop without returning the grant scope', async () => {
    const stoppedAccess = { ...disabledAccess, stopped: true };
    rpc.mockResolvedValue({ data: stoppedAccess, error: null });
    expect(await (await getAccess(request('access'))).json()).toEqual(
      stoppedAccess
    );
  });

  it('observes revocation on a repeated access request and marks both responses no-store', async () => {
    rpc
      .mockResolvedValueOnce({ data: liveAccess, error: null })
      .mockResolvedValueOnce({ data: disabledAccess, error: null });
    const sameRequest = request('access');
    const first = await getAccess(sameRequest);
    const second = await getAccess(sameRequest);
    expect(await first.json()).toEqual(liveAccess);
    expect(await second.json()).toEqual(disabledAccess);
    for (const response of [first, second]) {
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    }
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('returns a no-store digest denial when the live lookup denies access', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const response = await getDigest(request('digest'));
    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ error: 'forbidden' });
  });

  it('ignores caller project overrides and counts only the sections from the scoped lookup', async () => {
    rpc
      .mockResolvedValueOnce({ data: [storedSection], error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const sameRequest = request('digest?projectKey=another-project');
    const response = await getDigest(sameRequest);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      sections: [storedSection],
      totals: {
        projects: 1,
        lanes: 1,
        byState: {
          planned: 0,
          running: 0,
          blocked: 0,
          ready: 1,
          done: 0,
          paused: 0,
        },
      },
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('fleet_get_digest', {
      p_actor_id: actorId,
    });
    expect((await getDigest(sameRequest)).status).toBe(403);
  });
  it('omits malformed stored sections and counts the remaining lanes', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      rpc.mockResolvedValue({
        data: [
          {
            ...storedSection,
            lanes: [{ ...section.lanes[0], state: 'invalid' }],
          },
          storedSection,
        ],
        error: null,
      });
      const response = await getDigest(request('digest'));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        sections: [storedSection],
        totals: { projects: 1, lanes: 1 },
      });
      expect(log).toHaveBeenCalledExactlyOnceWith(
        'Invalid stored Fleet digest section'
      );
    } finally {
      log.mockRestore();
    }
  });
});

describe('Fleet digest publisher', () => {
  let token: string;

  beforeEach(() => {
    rpc.mockReset();
    token = `ttr_fleet_digest_${randomBytes(32).toString('base64url')}`;
    vi.stubEnv(
      'FLEET_DIGEST_PUBLISHER_TOKEN_SHA256',
      createHash('sha256').update(token).digest('hex')
    );
  });

  afterEach(() => vi.unstubAllEnvs());

  function publishRequest(body: unknown, credential = token) {
    return new Request('https://tuturuuu.com/api/v1/fleet/digest', {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: {
        authorization: `Bearer ${credential}`,
        cookie: 'tuturuuu_app_session=app-session-cookie',
      },
    });
  }

  it('accepts the dedicated publisher and passes only validated fields to the write RPC', async () => {
    rpc.mockResolvedValue({ data: 'published', error: null });
    const response = await publish(publishRequest(section));
    expect(response.status).toBe(204);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('fleet_publish_digest', {
      p_project_key: section.projectKey,
      p_generated_at: section.generatedAt,
      p_lanes: section.lanes,
    });
  });

  it.each(['ttr_app_user_session', 'mira-desk', 'fleet-consumer'])(
    'denies %s as a publisher',
    async (other) => {
      expect((await publish(publishRequest(section, other))).status).toBe(401);
      expect(rpc).not.toHaveBeenCalled();
    }
  );

  it('rejects a different publisher-shaped credential', async () => {
    const other = `ttr_fleet_digest_${randomBytes(32).toString('base64url')}`;
    expect((await publish(publishRequest(section, other))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('fails closed without a configured publisher', async () => {
    vi.stubEnv('FLEET_DIGEST_PUBLISHER_TOKEN_SHA256', '');
    expect((await publish(publishRequest(section))).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    { ...section, transcript: 'sample' },
    { ...section, projectKey: '../unscoped' },
    { ...section, lanes: [{ ...section.lanes[0], state: 'invalid' }] },
    { ...section, lanes: [{ ...section.lanes[0], hostPath: '/sample' }] },
    { ...section, lanes: [{ ...section.lanes[0], eta: 'soon' }] },
    { ...section, lanes: [{ ...section.lanes[0], shortSha: 'bad-sha' }] },
    {
      ...section,
      lanes: [{ ...section.lanes[0], blockerCodes: ['arbitrary text'] }],
    },
    {
      ...section,
      lanes: [{ ...section.lanes[0], blockerCodes: ['review', 'review'] }],
    },
    { ...section, receivedAt: storedSection.receivedAt },
  ])('rejects documents outside the closed schema %#', async (body) => {
    expect((await publish(publishRequest(body))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects excess bytes even without Content-Length', async () => {
    expect((await publish(publishRequest('a'.repeat(129 * 1024)))).status).toBe(
      413
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['unapproved_display_value', 400],
    ['stopped', 403],
    ['stale_snapshot', 409],
  ])('maps the database refusal %s', async (reason, status) => {
    rpc.mockResolvedValue({ data: reason, error: null });
    const response = await publish(publishRequest(section));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: reason });
  });
});
