// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStaffEligibilityHandler } from './eligibility/handler';
import {
  createStaffActorResolver,
  resolveStaffActor,
  type StaffAuthDependencies,
  StaffReadError,
} from './staff-access';
import {
  openStaffOperation,
  type StaffOperationPolicy,
} from './staff-operation';

const seams = vi.hoisted(() => ({
  session: vi.fn(),
  request: vi.fn(),
  sessionUser: vi.fn(),
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
vi.mock('@tuturuuu/supabase/request/server', () => ({
  createRequestClient: seams.request,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: seams.sessionUser,
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
  seams.request.mockResolvedValue({ auth: { synthetic: true } });
  seams.sessionUser.mockResolvedValue({ user: { id: actor }, authError: null });
  seams.session.mockResolvedValue({
    user: { id: actor },
    authError: null,
    supabase: null,
  });
});

describe('new resolver lifetime seam controls only', () => {
  it('scoped defaults compose request/helper fetch and current with SDK id only', async () => {
    const f = fixture('Bearer synthetic');
    const getUserById = vi.fn(async () => ({
      data: { user: identity },
      error: null,
    }));
    seams.admin.mockResolvedValue({ auth: { admin: { getUserById } } });
    expect(await resolveStaffActor(f.request, f.operation)).toBe(actor);
    expect(seams.session).not.toHaveBeenCalled();
    const isolated = seams.request.mock.calls[0]![0];
    expect(seams.request).toHaveBeenCalledExactlyOnceWith(isolated, {
      fetch: expect.any(Function),
    });
    expect(seams.sessionUser).toHaveBeenCalledExactlyOnceWith(
      await seams.request.mock.results[0]!.value,
      { check: expect.any(Function) }
    );
    expect(isolated.headers.get('cookie')).toBeNull();
    expect(isolated.headers.get('authorization')).toBe('Bearer synthetic');
    expect(isolated.signal.aborted).toBe(false);
    f.controller.abort();
    expect(isolated.signal.aborted).toBe(true);
    expect(seams.admin).toHaveBeenCalledExactlyOnceWith({
      noCookie: true,
      fetch: expect.any(Function),
    });
    expect(seams.admin.mock.calls[0]![0].fetch).not.toBe(
      seams.request.mock.calls[0]![1].fetch
    );
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
    expect(seams.request).not.toHaveBeenCalled();
    expect(seams.sessionUser).not.toHaveBeenCalled();
    expect(seams.admin).toHaveBeenCalledExactlyOnceWith({ noCookie: true });
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
    'default scoped session %s after stop prevents admin allocation',
    async (outcome) => {
      const f = fixture('Bearer synthetic');
      const pending = deferred<unknown>();
      const started = deferred<void>();
      seams.sessionUser.mockImplementation(() => {
        started.resolve();
        return pending.promise;
      });
      const result = resolveStaffActor(f.request, f.operation);
      await started.promise;
      f.expire();
      if (outcome === 'fulfill')
        pending.resolve({ user: { id: actor }, authError: null });
      else pending.reject(new StaffReadError(401));
      await expect(result).rejects.toMatchObject({ status: 503 });
      expect(seams.sessionUser.mock.calls[0]).toHaveLength(2);
      expect(seams.session).not.toHaveBeenCalled();
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

describe('actual scoped default construction and inspection boundaries', () => {
  it.each(['fulfill', 'reject'] as const)(
    'request client allocation %s after stop never enters authoritative helper',
    async (outcome) => {
      const f = fixture('Bearer synthetic');
      const pending = deferred<unknown>();
      const started = deferred<void>();
      seams.request.mockImplementation(() => {
        started.resolve();
        return pending.promise;
      });
      const result = resolveStaffActor(f.request, f.operation);
      const rejected = expect(result).rejects.toMatchObject({ status: 503 });
      await started.promise;
      f.controller.abort();
      if (outcome === 'fulfill') pending.resolve({ auth: {} });
      else pending.reject(new StaffReadError(401));
      await rejected;
      expect(seams.sessionUser).not.toHaveBeenCalled();
      expect(seams.session).not.toHaveBeenCalled();
      expect(seams.admin).not.toHaveBeenCalled();
      await finish(f);
    }
  );
  it.each(['session', 'current'] as const)(
    'late private %s getters are not inspected after stop',
    async (phase) => {
      const f = fixture('Bearer synthetic');
      const started = deferred<void>();
      const pending = deferred<unknown>();
      const privateRead = vi.fn(() => {
        throw new Error('PRIVATE synthetic value');
      });
      const late = Object.defineProperties(
        {},
        {
          user: { get: privateRead },
          authError: { get: privateRead },
          data: { get: privateRead },
          error: { get: privateRead },
        }
      );
      const getUserById = vi.fn(() => {
        started.resolve();
        return pending.promise;
      });
      seams.admin.mockResolvedValue({ auth: { admin: { getUserById } } });
      if (phase === 'session')
        seams.sessionUser.mockImplementation(() => {
          started.resolve();
          return pending.promise;
        });
      const result = resolveStaffActor(f.request, f.operation);
      const rejected = expect(result).rejects.toMatchObject({ status: 503 });
      await started.promise;
      f.expire();
      pending.resolve(late);
      await rejected;
      expect(privateRead).not.toHaveBeenCalled();
      if (phase === 'session') expect(seams.admin).not.toHaveBeenCalled();
      else expect(getUserById).toHaveBeenCalledExactlyOnceWith(actor);
      await finish(f);
    }
  );
  it('platform-app actor skips session and still constructs scoped fresh current', async () => {
    const f = fixture('Bearer ttr_app_synthetic');
    seams.app.mockReturnValue({ id: actor });
    const getUserById = vi.fn(async () => ({
      data: { user: identity },
      error: null,
    }));
    seams.admin.mockResolvedValue({ auth: { admin: { getUserById } } });
    expect(await resolveStaffActor(f.request, f.operation)).toBe(actor);
    expect(seams.app).toHaveBeenCalledExactlyOnceWith(expect.any(Request), {
      targetApp: 'platform',
    });
    expect(seams.request).not.toHaveBeenCalled();
    expect(seams.sessionUser).not.toHaveBeenCalled();
    expect(seams.session).not.toHaveBeenCalled();
    expect(seams.admin).toHaveBeenCalledExactlyOnceWith({
      noCookie: true,
      fetch: expect.any(Function),
    });
    expect(getUserById).toHaveBeenCalledExactlyOnceWith(actor);
    expect((await finish(f)).status).toBe(200);
  });
  it('context-free explicit bearer retains one-argument shared resolver and cookie stripping', async () => {
    const f = fixture('Bearer synthetic');
    const getUserById = vi.fn(async () => ({
      data: { user: identity },
      error: null,
    }));
    seams.admin.mockResolvedValue({ auth: { admin: { getUserById } } });
    expect(await resolveStaffActor(f.request)).toBe(actor);
    const isolated = seams.session.mock.calls[0]![0];
    expect(seams.session).toHaveBeenCalledExactlyOnceWith(isolated);
    expect(isolated.headers.get('cookie')).toBeNull();
    expect(seams.request).not.toHaveBeenCalled();
    expect(seams.sessionUser).not.toHaveBeenCalled();
    expect(seams.admin).toHaveBeenCalledExactlyOnceWith({ noCookie: true });
    expect(getUserById).toHaveBeenCalledExactlyOnceWith(actor);
    await finish(f);
  });
  it('A/B wrappers stay distinct and cancelling A does not abort B dispatch', async () => {
    const a = fixture('Bearer synthetic-a');
    const b = fixture('Bearer synthetic-b');
    const clientA = { auth: { synthetic: 'a' } };
    const clientB = { auth: { synthetic: 'b' } };
    seams.request.mockResolvedValueOnce(clientA).mockResolvedValueOnce(clientB);
    const getUserById = vi.fn(async () => ({
      data: { user: identity },
      error: null,
    }));
    seams.admin.mockResolvedValue({ auth: { admin: { getUserById } } });
    const answers = await Promise.all([
      resolveStaffActor(a.request, a.operation),
      resolveStaffActor(b.request, b.operation),
    ]);
    expect(answers).toEqual([actor, actor]);
    expect(seams.sessionUser.mock.calls.map((call) => call[0])).toEqual([
      clientA,
      clientB,
    ]);
    const fetchA: typeof fetch = seams.request.mock.calls[0]![1].fetch;
    const fetchB: typeof fetch = seams.request.mock.calls[1]![1].fetch;
    expect(fetchA).not.toBe(fetchB);
    const started = deferred<void>();
    const pending = deferred<Response>();
    let signal: AbortSignal | null | undefined;
    const network = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((_input, init) => {
        signal = init?.signal;
        started.resolve();
        return pending.promise;
      });
    // Wrappers capture fetch at construction, so create a new B callback here.
    try {
      await resolveStaffActor(b.request, b.operation);
      const selected: typeof fetch = seams.request.mock.calls[2]![1].fetch;
      const response = selected('https://synthetic.invalid/auth/v1/user');
      await started.promise;
      a.controller.abort();
      expect(signal?.aborted).toBe(false);
      pending.resolve(new Response(null, { status: 204 }));
      expect((await response).status).toBe(204);
      expect((await finish(a)).status).toBe(503);
      expect((await finish(b)).status).toBe(200);
    } finally {
      network.mockRestore();
    }
  });
  it('scoped helper check remains live before any SDK dispatch', async () => {
    const f = fixture('Bearer synthetic');
    seams.sessionUser.mockImplementation(async (_client, options) => {
      f.controller.abort();
      options.check();
      throw new Error('unreachable');
    });
    await expect(
      resolveStaffActor(f.request, f.operation)
    ).rejects.toMatchObject({ status: 503 });
    expect(seams.admin).not.toHaveBeenCalled();
    await finish(f);
  });
});
