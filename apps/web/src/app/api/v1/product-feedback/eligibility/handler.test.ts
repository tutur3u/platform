// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createStaffActorResolver,
  type StaffAuthDependencies,
  StaffReadError,
} from '../staff-access';
import {
  createStaffEligibilityHandler,
  type StaffEligibilityDependencies,
} from './handler';

const production = vi.hoisted(() => ({ admin: vi.fn(), session: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: production.admin,
}));
vi.mock('@tuturuuu/auth/supabase-session-user', () => ({
  resolveSupabaseSessionRequest: production.session,
}));
const actor = '91800000-0000-4000-8000-000000000001';
const identity = {
  id: actor,
  email: 'synthetic-staff@tuturuuu.com',
  email_confirmed_at: '2026-10-01T00:00:00Z',
  banned_until: null,
  app_metadata: { employee_onboarding: true },
  platform_user_roles: { enabled: false },
};
const request = (query = '', headers?: HeadersInit) =>
  new Request(
    `https://feedback.example.test/api/v1/product-feedback/eligibility${query}`,
    { headers }
  );
function auth(overrides: Partial<StaffAuthDependencies> = {}) {
  return {
    session: vi.fn<StaffAuthDependencies['session']>(
      overrides.session ??
        (async () => ({ user: { id: actor }, authError: null }))
    ),
    app: vi.fn<StaffAuthDependencies['app']>(
      overrides.app ?? (() => ({ id: actor }))
    ),
    hasApp: vi.fn(overrides.hasApp ?? (() => false)),
    current: vi.fn<StaffAuthDependencies['current']>(
      overrides.current ?? (async () => ({ user: identity, error: null }))
    ),
    now: overrides.now ?? (() => Date.parse('2026-10-08T00:00:00Z')),
  };
}
function dependencies(overrides: Partial<StaffEligibilityDependencies> = {}) {
  return {
    resolveActor: vi.fn(async () => actor),
    enabled: vi.fn(() => true),
    check: vi.fn(async () => ({ eligible: true })),
    ...overrides,
  };
}
async function responseBody(response: Response, status: number) {
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('vary')).toBe('Authorization, Cookie');
  expect(response.headers.has('etag')).toBe(false);
  const body: unknown = await response.json();
  if (status !== 200) {
    const code =
      status === 400
        ? 'feedback_invalid_query'
        : status === 401
          ? 'feedback_unauthorized'
          : status === 403
            ? 'feedback_forbidden'
            : 'feedback_unavailable';
    expect(body).toEqual({ error: { code } });
  }
  return body;
}
afterEach(() => {
  // Only synthetic injected dependencies are invoked, never production Auth/RPC.
  expect(production.admin).not.toHaveBeenCalled();
  expect(production.session).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('unwired content-free eligibility handler', () => {
  it('checks ordinary non-root, platform-disabled current actor in order', async () => {
    const events: string[] = [];
    const a = auth({
      session: async () => {
        events.push('session');
        return { user: { id: actor }, authError: null };
      },
      current: async (id) => {
        events.push(`current:${id}`);
        return { user: identity, error: null };
      },
    });
    const d = dependencies({
      resolveActor: createStaffActorResolver(a),
      enabled: () => {
        events.push('flag');
        return true;
      },
      check: vi.fn(async (id) => {
        events.push(`check:${id}`);
        return { eligible: true };
      }),
    });
    expect(
      await responseBody(await createStaffEligibilityHandler(d)(request()), 200)
    ).toEqual({ eligible: true });
    expect(events).toEqual([
      'session',
      `current:${actor}`,
      'flag',
      `check:${actor}`,
    ]);
    expect(d.check).toHaveBeenCalledExactlyOnceWith(actor);
    // This injected check does NOT prove real canonical registry eligibility.
  });
  it.each([401, 403, 503] as const)(
    'actor %s precedes flag/query/check',
    async (status) => {
      const d = dependencies({
        resolveActor: async () => {
          throw new StaffReadError(status);
        },
      });
      await responseBody(
        await createStaffEligibilityHandler(d)(request('?actor=other')),
        status
      );
      expect(d.enabled).not.toHaveBeenCalled();
      expect(d.check).not.toHaveBeenCalled();
    }
  );
  it('flag OFF precedes query validation and makes zero check calls', async () => {
    const d = dependencies({ enabled: vi.fn(() => false) });
    await responseBody(
      await createStaffEligibilityHandler(d)(request('?workspace=other')),
      503
    );
    expect(d.resolveActor).toHaveBeenCalledOnce();
    expect(d.check).not.toHaveBeenCalled();
  });
  it.each([undefined, 'false', '1', 'TRUE'])(
    'existing flag defaults OFF for %s',
    async (value) => {
      vi.stubEnv('PRODUCT_FEEDBACK_STAFF_INBOX_ENABLED', value);
      const d = dependencies({ enabled: undefined });
      await responseBody(
        await createStaffEligibilityHandler(d)(request()),
        503
      );
      expect(d.check).not.toHaveBeenCalled();
    }
  );
  it('only exact existing staff flag true enables the injected check', async () => {
    vi.stubEnv('PRODUCT_FEEDBACK_STAFF_INBOX_ENABLED', 'true');
    const d = dependencies({ enabled: undefined });
    expect(
      await responseBody(await createStaffEligibilityHandler(d)(request()), 200)
    ).toEqual({ eligible: true });
    expect(d.check).toHaveBeenCalledExactlyOnceWith(actor);
  });
  it.each([
    '?actor=other',
    '?wsId=other',
    '?q=private',
    '?limit=1',
    '?unknown=',
    '?unknown=1&unknown=2',
  ])('rejects every query field %s before check', async (query) => {
    const d = dependencies();
    await responseBody(
      await createStaffEligibilityHandler(d)(request(query)),
      400
    );
    expect(d.check).not.toHaveBeenCalled();
  });
  it.each([
    false,
    null,
    undefined,
    {},
    Object.create({ eligible: true }),
    { eligible: false },
    { eligible: null },
    { eligible: 'true' },
    { eligible: true, title: 'private-title' },
    { eligible: true, actor },
    { eligible: true, capabilities: {} },
    [{ eligible: true }],
    '{"eligible":true}',
    { items: [], nextCursor: null },
  ])('rejects malformed/extra/non-true output %#', async (raw) => {
    const d = dependencies({ check: vi.fn(async () => raw) });
    await responseBody(await createStaffEligibilityHandler(d)(request()), 503);
    expect(d.check).toHaveBeenCalledExactlyOnceWith(actor);
  });
  it('rejects a missing own eligibility key under prototype pollution', async () => {
    const before = Object.getOwnPropertyDescriptor(
      Object.prototype,
      'eligible'
    );
    const response = await (async () => {
      try {
        Object.defineProperty(Object.prototype, 'eligible', {
          value: true,
          configurable: true,
        });
        const d = dependencies({ check: vi.fn(async () => ({})) });
        return await createStaffEligibilityHandler(d)(request());
      } finally {
        if (before) Object.defineProperty(Object.prototype, 'eligible', before);
        else delete (Object.prototype as { eligible?: unknown }).eligible;
      }
    })();
    await responseBody(response, 503);
  });
  it.each([401, 403, 503] as const)(
    'preserves typed check rejection %s',
    async (status) => {
      const d = dependencies({
        check: vi.fn(async () => {
          throw new StaffReadError(status);
        }),
      });
      await responseBody(
        await createStaffEligibilityHandler(d)(request()),
        status
      );
      expect(d.check).toHaveBeenCalledExactlyOnceWith(actor);
    }
  );
  it.each([
    'PT403',
    { code: 'PT403', message: 'private-body' },
    new Error('private-body'),
  ])(
    'unknown rejection %# is dependency failure, never a privilege classification',
    async (error) => {
      const d = dependencies({
        check: async () => {
          throw error;
        },
      });
      await responseBody(
        await createStaffEligibilityHandler(d)(request()),
        503
      );
    }
  );
  it('does not swallow missing final check as a successful empty fallback', async () => {
    const d = dependencies({
      check: vi.fn(async () => {
        throw new Error('missing-rpc');
      }),
    });
    await responseBody(await createStaffEligibilityHandler(d)(request()), 503);
    expect(d.check).toHaveBeenCalledExactlyOnceWith(actor);
  });
  it('safe flag faults do not log raw errors or expose report/identity data', async () => {
    const logs = [
      vi.spyOn(console, 'error'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'log'),
    ];
    const d = dependencies({
      enabled: () => {
        throw new Error('private-body');
      },
    });
    await responseBody(await createStaffEligibilityHandler(d)(request()), 503);
    expect(d.check).not.toHaveBeenCalled();
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
});

describe('actual injected staff actor resolver at eligibility boundary', () => {
  it.each([
    ['unverified', { email_confirmed_at: null }, 403],
    ['banned', { banned_until: '2099-01-01T00:00:00Z' }, 403],
    ['malformed ban', { banned_until: 'unknown' }, 403],
    ['wrong email', { email: 'staff@xwf.tuturuuu.com' }, 403],
    ['marker false', { app_metadata: { employee_onboarding: false } }, 403],
    ['marker null', { app_metadata: { employee_onboarding: null } }, 403],
    ['marker string', { app_metadata: { employee_onboarding: 'true' } }, 403],
    ['marker absent', { app_metadata: {} }, 403],
    ['id mismatch', { id: '91800000-0000-4000-8000-000000000002' }, 401],
    ['malformed identity', { id: 'invalid' }, 503],
  ] as const)('current %s denies before check', async (_, changed, status) => {
    const a = auth({
      current: async () => ({ user: { ...identity, ...changed }, error: null }),
    });
    const d = dependencies({ resolveActor: createStaffActorResolver(a) });
    await responseBody(
      await createStaffEligibilityHandler(d)(request()),
      status
    );
    expect(d.check).not.toHaveBeenCalled();
    expect(d.enabled).not.toHaveBeenCalled();
  });
  it.each(['Basic ignored', 'Bearer token extra', 'Bearer '])(
    'malformed explicit %s never borrows valid cookie',
    async (authorization) => {
      const a = auth();
      const d = dependencies({ resolveActor: createStaffActorResolver(a) });
      await responseBody(
        await createStaffEligibilityHandler(d)(
          request('', {
            authorization,
            cookie: 'synthetic-valid-cookie=actor',
          })
        ),
        401
      );
      expect(a.session).not.toHaveBeenCalled();
      expect(a.app).not.toHaveBeenCalled();
      expect(a.current).not.toHaveBeenCalled();
      expect(d.check).not.toHaveBeenCalled();
    }
  );
  it('invalid explicit Bearer receives cookie-free request and cannot fall back', async () => {
    const a = auth({
      session: async () => ({ user: null, authError: { status: 401 } }),
    });
    const d = dependencies({ resolveActor: createStaffActorResolver(a) });
    await responseBody(
      await createStaffEligibilityHandler(d)(
        request('', {
          authorization: 'Bearer synthetic-invalid',
          cookie: 'synthetic-valid-cookie=actor',
        })
      ),
      401
    );
    expect(a.session.mock.calls[0]?.[0].headers.get('cookie')).toBeNull();
    expect(a.current).not.toHaveBeenCalled();
    expect(d.check).not.toHaveBeenCalled();
  });
  it.each(['infrastructure', 'mail'])(
    'injected wrong-target %s app denial never falls back',
    async () => {
      // Target verification result is synthetic, not signature/provider proof.
      const a = auth({ app: () => null });
      const d = dependencies({ resolveActor: createStaffActorResolver(a) });
      await responseBody(
        await createStaffEligibilityHandler(d)(
          request('', {
            authorization: 'Bearer ttr_app_synthetic-wrongtarget',
            cookie: 'synthetic-valid-cookie=actor',
          })
        ),
        401
      );
      expect(a.app.mock.calls[0]?.[0].headers.get('cookie')).toBeNull();
      expect(a.session).not.toHaveBeenCalled();
      expect(a.current).not.toHaveBeenCalled();
      expect(d.check).not.toHaveBeenCalled();
    }
  );
  it('injected platform app actor requires fresh matching current Auth before check', async () => {
    const a = auth();
    const d = dependencies({ resolveActor: createStaffActorResolver(a) });
    expect(
      await responseBody(
        await createStaffEligibilityHandler(d)(
          request('', {
            authorization: 'Bearer ttr_app_synthetic-platform',
            cookie: 'synthetic-valid-cookie=actor',
          })
        ),
        200
      )
    ).toEqual({ eligible: true });
    expect(a.app).toHaveBeenCalledOnce();
    expect(a.session).not.toHaveBeenCalled();
    expect(a.current).toHaveBeenCalledExactlyOnceWith(actor);
    expect(d.check).toHaveBeenCalledExactlyOnceWith(actor);
  });
  it.each([
    ['missing current actor', { user: null, error: null }, 401],
    ['provider unavailable', { user: null, error: { status: 500 } }, 503],
    ['provider revoked', { user: null, error: { status: 404 } }, 401],
  ] as const)('%s has no final check', async (_, current, status) => {
    const d = dependencies({
      resolveActor: createStaffActorResolver(
        auth({ current: async () => current })
      ),
    });
    await responseBody(
      await createStaffEligibilityHandler(d)(request()),
      status
    );
    expect(d.check).not.toHaveBeenCalled();
  });
  it('unknown actor resolution fault is safe and cannot enable check', async () => {
    const d = dependencies({
      resolveActor: createStaffActorResolver(
        auth({
          session: async () => {
            throw new Error('private-auth-body');
          },
        })
      ),
    });
    await responseBody(await createStaffEligibilityHandler(d)(request()), 503);
    expect(d.check).not.toHaveBeenCalled();
  });
});
