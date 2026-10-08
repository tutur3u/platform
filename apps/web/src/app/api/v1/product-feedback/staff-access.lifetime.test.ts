// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createStaffActorResolver,
  resolveStaffActor,
  type StaffAuthDependencies,
  StaffReadError,
} from './staff-access';
import { createStaffEligibilityHandler } from './eligibility/handler';
import {
  openStaffOperation,
  type StaffOperationPolicy,
} from './staff-operation';

const seams = vi.hoisted(() => ({
  session: vi.fn(),
  admin: vi.fn(),
  app: vi.fn(),
  hasApp: vi.fn(),
}));
vi.mock('@tuturuuu/auth/supabase-session-user', () => ({
  resolveSupabaseSessionRequest: seams.session,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: seams.admin,
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  getAppSessionUserFromRequest: seams.app,
  getAppSessionTokenFromRequest: seams.hasApp,
}));
const actor = '91800000-0000-4000-8000-000000000001';
const identity = {
  id: actor,
  email: 'synthetic@tuturuuu.com',
  email_confirmed_at: '2026-10-01T00:00:00Z',
  banned_until: null,
  app_metadata: { employee_onboarding: true },
};
const policy: StaffOperationPolicy = {
  durationMs: 10,
  scope: 'staff-list-detail-handler',
  provenance: 'synthetic test-only policy',
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function fixture(authorization?: string) {
  let time = 0;
  const controller = new AbortController();
  const request = new Request('https://synthetic.invalid/eligibility', {
    signal: controller.signal,
    headers: {
      cookie: 'synthetic-cookie=actor',
      ...(authorization ? { authorization } : {}),
    },
  });
  const operation = openStaffOperation(request, policy, {
    now: () => time,
    schedule: () => () => {},
  });
  if (!operation) throw new Error('synthetic owner missing');
  return {
    request,
    operation,
    controller,
    expire: () => {
      time = 10;
    },
  };
}
function auth(overrides: Partial<StaffAuthDependencies> = {}) {
  return {
    session: vi.fn<StaffAuthDependencies['session']>(
      overrides.session ??
        (async () => ({ user: { id: actor }, authError: null }))
    ),
    current: vi.fn<StaffAuthDependencies['current']>(
      overrides.current ?? (async () => ({ user: identity, error: null }))
    ),
    app: vi.fn<StaffAuthDependencies['app']>(
      overrides.app ?? (() => ({ id: actor }))
    ),
    hasApp: vi.fn(overrides.hasApp ?? (() => false)),
    now: () => Date.parse('2026-10-08T00:00:00Z'),
  };
}
const failure = (status: number) =>
  Response.json({ error: 'safe' }, { status });
async function finish(f: ReturnType<typeof fixture>) {
  return f.operation.run(
    f.operation.phase(async () => 'safe'),
    (value) => Response.json(value),
    failure
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  seams.hasApp.mockReturnValue(null);
  seams.session.mockResolvedValue({
    user: { id: actor },
    authError: null,
    supabase: null,
  });
});

describe('new resolver lifetime seam controls only', () => {
  it('actual default session calls shared helper with EXACT ONE argument and current with SDK id only', async () => {
    const f = fixture('Bearer synthetic');
    const getUserById = vi.fn(async () => ({
      data: { user: identity },
      error: null,
    }));
    seams.admin.mockResolvedValue({ auth: { admin: { getUserById } } });
    expect(await resolveStaffActor(f.request, f.operation)).toBe(actor);
    expect(seams.session).toHaveBeenCalledOnce();
    const isolated = seams.session.mock.calls[0]![0];
    expect(seams.session).toHaveBeenCalledExactlyOnceWith(isolated);
    expect(seams.session.mock.calls[0]).toHaveLength(1);
    expect(isolated.headers.get('cookie')).toBeNull();
    expect(isolated.headers.get('authorization')).toBe('Bearer synthetic');
    expect(isolated.signal.aborted).toBe(false);
    f.controller.abort();
    expect(isolated.signal.aborted).toBe(true);
    expect(seams.admin).toHaveBeenCalledExactlyOnceWith({ noCookie: true });
    expect(getUserById).toHaveBeenCalledExactlyOnceWith(actor);
    await finish(f);
  });
  it('actual eligibility remains a one-argument resolver composition with no policy or context', async () => {
    const getUserById = vi.fn(async () => ({
      data: { user: identity },
      error: null,
    }));
    seams.admin.mockResolvedValue({ auth: { admin: { getUserById } } });
    const resolver = vi.fn(resolveStaffActor);
    const check = vi.fn(async () => ({ eligible: true }));
    const request = new Request('https://synthetic.invalid/eligibility');
    const response = await createStaffEligibilityHandler({
      resolveActor: resolver,
      enabled: () => true,
      check,
    })(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ eligible: true });
    expect(resolver).toHaveBeenCalledExactlyOnceWith(request);
    expect(seams.session).toHaveBeenCalledExactlyOnceWith(request);
    expect(getUserById).toHaveBeenCalledExactlyOnceWith(actor);
    expect(check).toHaveBeenCalledExactlyOnceWith(actor);
  });
  it('context-free request cancellation is cooperative with zero preaborted Auth effects', async () => {
    const a = auth();
    const f = fixture('Basic malformed');
    f.controller.abort('PRIVATE');
    await expect(createStaffActorResolver(a)(f.request)).rejects.toMatchObject({
      status: 503,
    });
    expect(a.session).not.toHaveBeenCalled();
    expect(a.current).not.toHaveBeenCalled();
    expect(a.app).not.toHaveBeenCalled();
    expect(a.hasApp).not.toHaveBeenCalled();
    await finish(f);
  });
  it.each(['session', 'current'] as const)(
    'late %s fulfillment/rejection cannot classify denial or dispatch another phase',
    async (phase) => {
      for (const reject of [false, true]) {
        const f = fixture('Bearer synthetic');
        const pending = deferred<{ user: unknown; error: unknown }>();
        const session = deferred<{
          user: { id: string } | null;
          authError: unknown;
        }>();
        const started = deferred<void>();
        const a = auth(
          phase === 'session'
            ? {
                session: async () => {
                  started.resolve();
                  return session.promise;
                },
              }
            : {
                current: async () => {
                  started.resolve();
                  return pending.promise;
                },
              }
        );
        const result = createStaffActorResolver(a)(f.request, f.operation);
        await started.promise;
        f.expire();
        if (phase === 'session') {
          if (reject) session.reject(new StaffReadError(401));
          else session.resolve({ user: null, authError: { status: 403 } });
        } else {
          if (reject) pending.reject(new StaffReadError(403));
          else pending.resolve({ user: null, error: { status: 401 } });
        }
        await expect(result).rejects.toMatchObject({ status: 503 });
        expect(a.session).toHaveBeenCalledOnce();
        if (phase === 'session') expect(a.current).not.toHaveBeenCalled();
        else
          expect(a.current).toHaveBeenCalledExactlyOnceWith(actor, f.operation);
        expect(a.session.mock.calls[0]).toHaveLength(2);
        expect(a.session.mock.calls[0]![1]).toBe(f.operation);
        await finish(f);
      }
    }
  );
  it.each(['fulfill', 'reject'] as const)(
    'default shared session %s after stop prevents admin allocation',
    async (outcome) => {
      const f = fixture('Bearer synthetic');
      const pending = deferred<unknown>();
      seams.session.mockReturnValue(pending.promise);
      const result = resolveStaffActor(f.request, f.operation);
      f.expire();
      if (outcome === 'fulfill')
        pending.resolve({ user: { id: actor }, authError: null });
      else pending.reject(new StaffReadError(401));
      await expect(result).rejects.toMatchObject({ status: 503 });
      expect(seams.session.mock.calls[0]).toHaveLength(1);
      expect(seams.admin).not.toHaveBeenCalled();
      await finish(f);
    }
  );
  it.each(['allocation', 'current'] as const)(
    'default %s stop checkpoints preserve real SDK signatures',
    async (phase) => {
      const f = fixture('Bearer synthetic');
      const started = deferred<void>();
      const pending = deferred<unknown>();
      const getUserById = vi.fn(() => {
        started.resolve();
        return pending.promise;
      });
      if (phase === 'allocation')
        seams.admin.mockImplementation(() => {
          started.resolve();
          return pending.promise;
        });
      else seams.admin.mockResolvedValue({ auth: { admin: { getUserById } } });
      const result = resolveStaffActor(f.request, f.operation);
      await started.promise;
      f.controller.abort();
      pending.reject(new StaffReadError(403));
      await expect(result).rejects.toMatchObject({ status: 503 });
      if (phase === 'allocation') expect(getUserById).not.toHaveBeenCalled();
      else expect(getUserById).toHaveBeenCalledExactlyOnceWith(actor);
      await finish(f);
    }
  );
  it('synchronous platform verification stop prevents fresh current Auth', async () => {
    const f = fixture('Bearer ttr_app_synthetic');
    const a = auth({
      app: () => {
        f.controller.abort();
        return { id: actor };
      },
    });
    await expect(
      createStaffActorResolver(a)(f.request, f.operation)
    ).rejects.toMatchObject({ status: 503 });
    expect(a.current).not.toHaveBeenCalled();
    expect(a.session).not.toHaveBeenCalled();
    await finish(f);
  });
});
