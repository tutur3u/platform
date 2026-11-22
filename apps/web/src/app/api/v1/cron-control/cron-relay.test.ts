import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// The real Cron Control handler and ledger, so the relay is tested against
// the contract it calls.
import { handleControlRequest } from '../../../../../../cron-control/src/control';
import { MAX_CONSECUTIVE_FAILURES } from '../../../../../../cron-control/src/jobs';
import {
  LedgerCore,
  localLedger,
  memoryLedgerStore,
} from '../../../../../../cron-control/src/ledger';
import routeTable from '../../../../../../gateway/src/web-routes.generated.json';
import { POST } from './jobs/[id]/resume/route';
import { GET } from './jobs/route';

vi.mock('server-only', () => ({}));

const ADMIN = '11111111-1111-4111-8111-111111111111';
const URL = 'https://tuturuuu.com/api/v1/cron-control/jobs';
const RELAY_TOKEN = 'r'.repeat(40);
const OPERATOR_TOKEN = 'o'.repeat(40);
const JOB = 'calendar-provider-sync';

type Options = {
  rateLimit?: { maxRequests: number; windowMs: number };
  stepUpExempt?: (user: { id: string }) => Promise<boolean>;
};

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  permissions: [] as string[],
  permissionCalls: [] as Array<{ wsId: string }>,
  /** What the provider says of the session's user. */
  account: {} as { app_metadata?: object; banned_until?: string; id?: string },
  accountError: false,
  limiter: 'ok' as 'ok' | 'over' | 'down',
  /** Verified claims of the provider session. */
  claims: null as Record<string, unknown> | null,
  claimsFor: [] as Array<string | undefined>,
  limitKeys: [] as Array<{ key: string; maxRequests: number }>,
  cronControl: undefined as { fetch: typeof fetch } | undefined,
  options: [] as Array<Options | undefined>,
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (
    handler: (
      request: Request,
      auth: { user: { id: string }; supabase: object },
      params: unknown
    ) => Promise<Response>,
    options?: Options
  ) => {
    mocks.options.push(options);
    return async (request: Request, context?: { params?: Promise<unknown> }) =>
      mocks.user
        ? handler(
            request,
            {
              user: mocks.user,
              supabase: {
                auth: {
                  getUser: async () => ({
                    data: {
                      user: mocks.accountError
                        ? null
                        : { id: mocks.user!.id, ...mocks.account },
                    },
                    error: mocks.accountError ? new Error('down') : null,
                  }),
                  getClaims: async (jwt?: string) => {
                    mocks.claimsFor.push(jwt);
                    return {
                      data: mocks.claims ? { claims: mocks.claims } : null,
                      error: null,
                    };
                  },
                },
              },
            },
            await context?.params
          )
        : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  },
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: async (input: { wsId: string }) => {
    mocks.permissionCalls.push({ wsId: input.wsId });
    return {
      containsPermission: (permission: string) =>
        mocks.permissions.includes(permission),
    };
  },
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => {
    throw new Error('no admin client in this test');
  },
  getBearerAccessToken: (request: Request) => {
    const header = request.headers.get('authorization');
    return header?.startsWith('Bearer ')
      ? header.replace('Bearer ', '').trim()
      : undefined;
  },
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitRedis: async (
    key: string,
    config: { maxRequests: number },
    options: { failClosed?: boolean }
  ) => {
    mocks.limitKeys.push({ key, maxRequests: config.maxRequests });
    const reset = Math.floor(Date.now() / 1000) + 20;
    if (mocks.limiter === 'down')
      return {
        allowed: !options.failClosed,
        limit: config.maxRequests,
        remaining: 0,
        reset,
        unavailable: true,
      };
    return {
      allowed: mocks.limiter === 'ok',
      limit: config.maxRequests,
      remaining: 0,
      reset,
    };
  },
}));
vi.mock('@opennextjs/cloudflare/cloudflare-context', () => ({
  getCloudflareContext: () => {
    if (!mocks.cronControl) throw new Error('not in a Worker');
    return { env: { CRON_CONTROL: mocks.cronControl } };
  },
}));

/** Cron Control behind the binding, with one job its failure budget stopped. */
function cronControl() {
  const core = new LedgerCore(memoryLedgerStore().store);
  for (let run = 0; run < MAX_CONSECUTIVE_FAILURES; run++) {
    const slot = `2026-11-22T06:0${run}:00.000Z`;
    const claim = core.claim({
      jobId: JOB,
      leaseMs: 500,
      maxConsecutiveFailures: MAX_CONSECUTIVE_FAILURES,
      now: run * 1000,
      slot,
    });
    if (!claim.granted) throw new Error('claim refused');
    core.complete({
      generation: claim.generation,
      jobId: JOB,
      maxConsecutiveFailures: MAX_CONSECUTIVE_FAILURES,
      now: run * 1000 + 1,
      outcome: 'failed',
      slot,
    });
  }
  const calls: { auth: string | null; method: string; url: string }[] = [];
  const binding = {
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(String(input), init);
      calls.push({
        auth: request.headers.get('authorization'),
        method: request.method,
        url: request.url,
      });
      return (await handleControlRequest(
        request,
        {
          CRON_CONTROL_ENABLED_JOBS: JOB,
          CRON_CONTROL_OPERATOR_TOKEN: OPERATOR_TOKEN,
          CRON_CONTROL_RELAY_TOKEN: RELAY_TOKEN,
        },
        () => localLedger(core)
      ))!;
    }) as typeof fetch,
  };
  return { binding, calls, core };
}

const NOW = Math.floor(Date.now() / 1000);
/** Provider claims with a second factor verified `ageSeconds` ago. */
const session = (ageSeconds: number, sub = ADMIN) => ({
  aal: 'aal2',
  amr: [
    { method: 'password', timestamp: NOW - 7200 },
    { method: 'totp', timestamp: NOW - ageSeconds },
  ],
  session_id: 'session-1',
  sub,
});

const list = () => GET(new NextRequest(URL));
const resume = (id = JOB, headers: Record<string, string> = {}) =>
  POST(new NextRequest(`${URL}/${id}/resume`, { method: 'POST', headers }), {
    params: Promise.resolve({ id }),
  });

describe('cron control relay routes', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_CONTROL_RELAY_TOKEN', RELAY_TOKEN);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', async () => {
      throw new Error('public fetch must not be used');
    });
    mocks.user = { id: ADMIN };
    mocks.permissions = ['manage_workspace_secrets'];
    mocks.permissionCalls.length = 0;
    mocks.account = {};
    mocks.accountError = false;
    mocks.limiter = 'ok';
    mocks.claims = session(60);
    mocks.claimsFor.length = 0;
    mocks.limitKeys.length = 0;
    mocks.cronControl = undefined;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('answers 401 without a session and never calls Cron Control', async () => {
    const { binding, calls } = cronControl();
    mocks.cronControl = binding;
    mocks.user = null;
    expect((await list()).status).toBe(401);
    expect((await resume()).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it('answers 403 to a signed-in user without the root permission', async () => {
    const { binding, calls, core } = cronControl();
    mocks.cronControl = binding;
    mocks.permissions = ['view_infrastructure'];
    for (const response of [await list(), await resume()]) {
      expect(response.status).toBe(403);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(await response.json()).toEqual({ error: 'forbidden' });
    }
    expect(calls).toEqual([]);
    expect(core.status()[JOB]?.stopped).toBe(true);
    // The permission is read on the root workspace only.
    expect(new Set(mocks.permissionCalls.map((call) => call.wsId))).toEqual(
      new Set(['00000000-0000-0000-0000-000000000000'])
    );
  });

  it('requires a fresh second factor of the provider session for a resume', async () => {
    const { binding, calls, core } = cronControl();
    mocks.cronControl = binding;
    for (const claims of [
      session(960),
      // No second factor, another user's proof, no session at all.
      { ...session(60), aal: 'aal1' },
      session(60, '22222222-2222-4222-8222-222222222222'),
      null,
    ]) {
      mocks.claims = claims;
      const response = await resume();
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: 'mfa_required',
        maxAgeSeconds: 900,
      });
    }
    expect(calls).toEqual([]);
    expect(core.status()[JOB]?.stopped).toBe(true);

    mocks.claims = session(840);
    expect((await resume()).status).toBe(200);
  });

  it('reads the proof only from the credential that authenticated the request', async () => {
    const { binding, calls } = cronControl();
    mocks.cronControl = binding;
    // A cookie session: the client's own claims.
    expect((await resume()).status).toBe(200);
    expect(mocks.claimsFor).toEqual([undefined]);

    // A bearer: that token's claims and nothing else.
    mocks.claimsFor.length = 0;
    mocks.claims = session(5000);
    const stale = await resume(JOB, {
      authorization: 'Bearer provider.jwt.value',
    });
    expect(stale.status).toBe(401);
    expect(mocks.claimsFor).toEqual(['provider.jwt.value']);

    // An app session token is not a provider session and proves nothing.
    mocks.claimsFor.length = 0;
    mocks.claims = session(60);
    const app = await resume(JOB, { authorization: 'Bearer ttr_app_token' });
    expect(app.status).toBe(401);
    expect(mocks.claimsFor).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('reads the account policy from the same provider session', async () => {
    const { binding, calls } = cronControl();
    mocks.cronControl = binding;
    // A banned account, a recovery in progress, another user's session.
    for (const account of [
      { banned_until: '2999-01-01T00:00:00Z' },
      { app_metadata: { tuturuuu_required_mfa: null } },
      { id: '22222222-2222-4222-8222-222222222222' },
    ]) {
      mocks.account = account;
      expect((await list()).status).toBe(401);
      // A fresh proof of that session does not make up for it, and an app
      // session cookie beside it is never read.
      const response = await resume(JOB, {
        cookie: 'tuturuuu_app_session=another-session',
        'sec-fetch-site': 'same-origin',
      });
      expect(response.status).toBe(401);
    }
    mocks.account = {};
    mocks.accountError = true;
    expect((await list()).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it('enforces same-origin proof on a cookie resume in every CSRF mode', async () => {
    const { binding, calls, core } = cronControl();
    mocks.cronControl = binding;
    const cookie = 'sb-project-auth-token=value';
    for (const mode of ['', 'off', 'report']) {
      vi.stubEnv('TTR_CSRF_MODE', mode);
      for (const headers of [
        { cookie, 'sec-fetch-site': 'cross-site' },
        { cookie, 'sec-fetch-site': 'same-site' },
        // The satellite origin the proxy trusts is not this route's origin.
        {
          cookie,
          'sec-fetch-site': 'same-site',
          origin: 'https://workspace.tuturuuu.com',
        },
        { cookie, origin: 'https://workspace.tuturuuu.com' },
        { cookie, origin: 'https://evil.example' },
        { cookie },
        // A bearer beside a session cookie is still a browser request.
        { cookie, authorization: 'Bearer provider.jwt.value' },
      ] as Record<string, string>[]) {
        const response = await resume(JOB, headers);
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: 'CSRF_REJECTED' });
      }
    }
    expect(calls).toEqual([]);
    expect(core.status()[JOB]?.stopped).toBe(true);
    expect(mocks.limitKeys).toEqual([]);

    const sameOrigin = await resume(JOB, {
      cookie,
      'sec-fetch-site': 'same-origin',
    });
    expect(sameOrigin.status).toBe(200);
    // A cookie-less bearer (an operator's terminal) needs no origin.
    const bearer = await resume(JOB, {
      authorization: 'Bearer provider.jwt.value',
    });
    expect(bearer.status).toBe(409);
  });

  it('counts each action per operator apart from the shared mutation limit', async () => {
    const { binding, calls, core } = cronControl();
    mocks.cronControl = binding;
    await list();
    await resume();
    expect(mocks.limitKeys).toEqual([
      { key: `cron-control:read:user:${ADMIN}`, maxRequests: 30 },
      { key: `cron-control:resume:user:${ADMIN}`, maxRequests: 6 },
    ]);
    // The wrapper keeps its defaults: no tight limit on a shared counter.
    expect(mocks.options.every((options) => !options?.rateLimit)).toBe(true);

    core.stop(JOB, 'failure-budget-exhausted');
    calls.length = 0;
    mocks.limiter = 'over';
    expect((await list()).status).toBe(429);
    const over = await resume();
    expect(over.status).toBe(429);
    expect(over.headers.get('retry-after')).toBe('20');
    // Without the counter store nothing is relayed.
    mocks.limiter = 'down';
    expect((await list()).status).toBe(503);
    expect((await resume()).status).toBe(503);
    expect(calls).toEqual([]);
    expect(core.status()[JOB]?.stopped).toBe(true);
    mocks.limiter = 'ok';

    // A non-operator never touches the operator counters.
    mocks.limitKeys.length = 0;
    mocks.permissions = [];
    expect((await resume()).status).toBe(403);
    expect(mocks.limitKeys).toEqual([]);
  });

  it('relays the listing and the resume for an admin', async () => {
    const { binding, calls, core } = cronControl();
    mocks.cronControl = binding;

    const listed = await list();
    expect(listed.status).toBe(200);
    expect(listed.headers.get('cache-control')).toBe('private, no-store');
    const { jobs } = (await listed.json()) as {
      jobs: { id: string; state: { stopReason: string | null } }[];
    };
    expect(jobs.find((job) => job.id === JOB)?.state.stopReason).toBe(
      'failure-budget-exhausted'
    );

    const resumed = await resume();
    expect(resumed.status).toBe(200);
    expect(await resumed.json()).toMatchObject({
      id: JOB,
      result: 'resumed',
      state: { generation: 2, stopped: false },
    });
    expect(core.status()[JOB]).toMatchObject({
      generation: 2,
      stopped: false,
    });
    expect(calls).toEqual([
      {
        auth: `Bearer ${RELAY_TOKEN}`,
        method: 'GET',
        url: 'https://cron-control.internal/control/jobs',
      },
      {
        auth: `Bearer ${RELAY_TOKEN}`,
        method: 'POST',
        url: `https://cron-control.internal/control/jobs/${JOB}/resume`,
      },
    ]);

    // Cron Control's refusals pass through with their own status.
    const again = await resume();
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ result: 'not_stopped' });
    const disabled = await resume('pay-products');
    expect(disabled.status).toBe(409);
    expect(await disabled.json()).toEqual({
      id: 'pay-products',
      result: 'disabled',
    });
    expect((await resume('unknown-job')).status).toBe(404);
    calls.length = 0;
    expect((await resume('Bad..Id')).status).toBe(404);
    expect(calls).toEqual([]);
  });

  it('answers 503 without the binding or the token', async () => {
    for (const response of [await list(), await resume()]) {
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'unconfigured' });
    }
    const { binding, calls } = cronControl();
    mocks.cronControl = binding;
    vi.stubEnv('CRON_CONTROL_RELAY_TOKEN', 'short');
    expect((await list()).status).toBe(503);
    expect((await resume()).status).toBe(503);
    expect(calls).toEqual([]);
  });

  it('answers 502 when Cron Control refuses the bearer or sends another shape', async () => {
    const { binding } = cronControl();
    mocks.cronControl = binding;
    vi.stubEnv('CRON_CONTROL_RELAY_TOKEN', 'x'.repeat(40));
    expect((await list()).status).toBe(502);
    vi.stubEnv('CRON_CONTROL_RELAY_TOKEN', RELAY_TOKEN);
    mocks.cronControl = {
      fetch: (async () =>
        Response.json({
          id: 'another-job',
          result: 'resumed',
        })) as typeof fetch,
    };
    const response = await resume();
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'failed' });

    // A result under the wrong status is not passed on.
    const state = {
      consecutiveFailures: 0,
      generation: 2,
      lastCompletedAt: null,
      lastOutcome: null,
      lastSlot: null,
      leaseUntil: 0,
      runs: 0,
      stopReason: null,
      stopped: false,
    };
    for (const [result, status] of [
      ['resumed', 409],
      ['not_stopped', 200],
    ] as const) {
      mocks.cronControl = {
        fetch: (async () =>
          Response.json(
            { id: JOB, result, state },
            { status }
          )) as typeof fetch,
      };
      expect((await resume()).status).toBe(502);
    }
  });

  it('stops reading an oversized answer at the cap', async () => {
    let pulled = 0;
    let cancelled = false;
    mocks.cronControl = {
      fetch: (async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              pulled++;
              controller.enqueue(new Uint8Array(16 * 1024).fill(0x20));
            },
            cancel() {
              cancelled = true;
            },
          })
        )) as typeof fetch,
    };
    expect((await list()).status).toBe(502);
    expect(cancelled).toBe(true);
    // 64 KiB cap in 16 KiB chunks: the endless body is never drained.
    expect(pulled).toBeLessThan(10);
  });

  it('is served by api-core, the only family with the binding', () => {
    const owners = routeTable.routes
      .filter((route) => route.pattern.startsWith('/api/v1/cron-control/'))
      .map((route) => `${route.family} ${route.pattern}`)
      .sort();
    expect(owners).toEqual([
      'api-core /api/v1/cron-control/jobs',
      'api-core /api/v1/cron-control/jobs/[id]/resume',
    ]);
  });

  it('exempts only operators from the browser step-up', async () => {
    const exempt = mocks.options.find(
      (options) => options?.stepUpExempt
    )!.stepUpExempt!;
    expect(await exempt({ id: ADMIN })).toBe(true);
    mocks.permissions = [];
    expect(await exempt({ id: ADMIN })).toBe(false);
  });
});
