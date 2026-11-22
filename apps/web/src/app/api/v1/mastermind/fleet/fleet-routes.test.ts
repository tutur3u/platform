import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { mastermindFleetNativeSessionRequired } from '@/lib/mastermind/fleet/auth';
import { recordFleetAnswer } from '@/lib/mastermind/fleet/store';
import { createMemoryMastermindStore } from '@tuturuuu/utils/mastermind-store/client';
import { sampleFleetState } from '@/lib/mastermind/fleet/sample-state.fixture';
import { fleetSignedPayload } from '@/lib/mastermind/fleet/signing';
import { signMastermindPushEvent } from '@/lib/mastermind/push-events/signature';

vi.mock('server-only', () => ({}));

const OWNER = '11111111-1111-4111-8111-111111111111';
const PUSH_OWNER = '22222222-2222-4222-8222-222222222222';
const NO_PERMISSION = '33333333-3333-4333-8333-333333333333';
const SECRET = 'fleet-test-'.padEnd(44, 'f');

const mocks = vi.hoisted(() => ({
  user: { id: '' },
  granted: [] as string[],
  store: null as ReturnType<typeof createMemoryMastermindStore> | null,
  devices: vi.fn(),
  permission: vi.fn(),
  push: vi.fn(),
  authOptions: [] as unknown[],
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (
    handler: (r: Request, a: unknown, p: unknown) => Response,
    options?: unknown
  ) => (
    mocks.authOptions.push(options),
    async (request: Request, context?: { params?: unknown }) =>
      handler(request, { user: mocks.user }, await context?.params)
  ),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: async () => ({
    containsPermission: (p: string) => mocks.granted.includes(p),
  }),
}));
// The in-memory reference store has the Worker's semantics; the Worker itself
// is covered by apps/mastermind-store/src/worker.test.ts.
vi.mock('@/lib/mastermind/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mastermind/store')>()),
  getMastermindStore: async () => mocks.store,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: () => ({ select: () => ({ in: mocks.devices }) }),
    rpc: async (name: string, args: unknown) => {
      if (name === 'has_workspace_permission') return mocks.permission(args);
      return { data: true, error: null };
    },
  }),
}));
vi.mock('@/lib/notifications/push-delivery', () => ({
  sendCustomPushMessageBatch: mocks.push,
}));

function signed(method: string, path: string, body = '', secret = SECRET) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signMastermindPushEvent(
    secret,
    timestamp,
    fleetSignedPayload(method, path, body)
  );
  return new Request(`https://tuturuuu.com${path}`, {
    method,
    headers: { 'x-mm-signature': signature, 'x-mm-timestamp': timestamp },
    ...(body ? { body } : {}),
  });
}

async function publish(state: unknown = sampleFleetState()) {
  const { PUT } = await import('./state/route');
  return PUT(
    signed('PUT', '/api/v1/mastermind/fleet/state', JSON.stringify(state))
  );
}

async function ownerRead(headers: Record<string, string> = {}) {
  const { GET } = await import('./state/route');
  return GET(
    new NextRequest('https://tuturuuu.com/api/v1/mastermind/fleet/state', {
      headers,
    })
  );
}

async function answer(
  decisionId: string,
  body: unknown,
  key: string | null = randomUUID()
) {
  const { POST } = await import('./decisions/[decisionId]/answer/route');
  return POST(
    new NextRequest(
      `https://tuturuuu.com/api/v1/mastermind/fleet/decisions/${decisionId}/answer`,
      {
        method: 'POST',
        headers: key ? { 'idempotency-key': key } : {},
        body: JSON.stringify(body),
      }
    ),
    { params: Promise.resolve({ decisionId }) }
  );
}

// Product rule: apps/docs/platform/features/mobile-mastermind.mdx#fleet-sync
describe('Mastermind fleet sync routes', () => {
  it('owner reads and answers require dedicated Mastermind or native credentials', async () => {
    await import('./state/route');
    await import('./decisions/[decisionId]/answer/route');
    const fleetAuth = expect.objectContaining({
      allowAppSessionAuth: {
        targetApp: 'mastermind',
        requiredScope: 'internal-app:session',
      },
      requireMastermindMobileSessionForSupabase:
        mastermindFleetNativeSessionRequired,
      appSessionMfaMaxAgeSeconds: 86_400,
    });
    expect(mocks.authOptions).toEqual([fleetAuth, fleetAuth]);
  });

  it('holds the native-session requirement until its flag is on', () => {
    vi.stubEnv('MASTERMIND_FLEET_NATIVE_SESSION_REQUIRED', '');
    expect(mastermindFleetNativeSessionRequired()).toBe(false);
    vi.stubEnv('MASTERMIND_FLEET_NATIVE_SESSION_REQUIRED', '1');
    expect(mastermindFleetNativeSessionRequired()).toBe(false);
    vi.stubEnv('MASTERMIND_FLEET_NATIVE_SESSION_REQUIRED', 'true');
    expect(mastermindFleetNativeSessionRequired()).toBe(true);
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.clearAllMocks();
    mocks.store = createMemoryMastermindStore();
    mocks.devices.mockReturnValue({
      limit: async () => ({ data: [], error: null }),
    });
    mocks.permission.mockResolvedValue({ data: true, error: null });
    mocks.push.mockResolvedValue({ deliveredCount: 1, invalidTokens: [] });
    mocks.user = { id: OWNER };
    mocks.granted = ['view_infrastructure'];
    vi.stubEnv('MASTERMIND_FLEET_PUBLISHER_SECRET', SECRET);
    vi.stubEnv('MASTERMIND_PUSH_OWNER_IDS', OWNER);
    vi.stubEnv('MASTERMIND_FLEET_OWNER_IDS', '');
    vi.stubEnv('MASTERMIND_PUSH_LOCALE', 'en');
    vi.stubEnv('MASTERMIND_REQUIRE_EXPLICIT_GRANT', '');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe('decision pushes from PUT state', () => {
    const minutes = (value: number) =>
      vi.setSystemTime(Date.now() + value * 60_000);
    const decision = sampleFleetState().decisions[0]!;
    const state = (...ids: string[]) => {
      const now = new Date().toISOString();
      return sampleFleetState({
        generatedAt: now,
        decisions: ids.map((id) => ({ ...decision, id, createdAt: now })),
      });
    };

    beforeEach(() => {
      vi.stubEnv('MASTERMIND_FLEET_INBOX_PUSH_ENABLED', 'true');
      vi.stubEnv('MASTERMIND_FLEET_OWNER_IDS', OWNER);
      // Include a device outside the query audience to exercise the fan-out guard.
      mocks.devices.mockReturnValue({
        limit: async () => ({
          data: [
            { user_id: OWNER, token: 'owner-device' },
            { user_id: PUSH_OWNER, token: 'other-device' },
            { user_id: NO_PERMISSION, token: 'ungranted-device' },
          ],
          error: null,
        }),
      });
    });

    it('sends no decision push for a login request', async () => {
      expect((await publish(state())).status).toBe(200);
      expect(
        (
          await publish(
            sampleFleetState({
              generatedAt: new Date().toISOString(),
              decisions: [
                {
                  id: 'gh-login',
                  kind: 'login',
                  title: 'GitHub sign-in',
                  urgency: 'high',
                  login: {
                    service: 'github',
                    flow: 'device',
                    state: 'waiting',
                    url: 'https://github.com/login/device',
                    userCode: 'ABCD-1234',
                    expiresAt: new Date(Date.now() + 600_000).toISOString(),
                  },
                  createdAt: new Date().toISOString(),
                },
              ],
            })
          )
        ).status
      ).toBe(200);
      expect(mocks.push).not.toHaveBeenCalled();
    });

    it('sends one scrubbed card notification to the configured fleet owner', async () => {
      vi.stubEnv('MASTERMIND_PUSH_OWNER_IDS', PUSH_OWNER);
      expect((await publish(state())).status).toBe(200);
      const first = state(decision.id);
      const decisions = [
        {
          ...decision,
          title:
            'Approve rollout https://secret.example/thing person@example.com /Users/private/file',
          body: 'Rollout review summary https://private.example/draft',
          createdAt: new Date().toISOString(),
        },
      ];
      expect((await publish({ ...first, decisions })).status).toBe(200);
      expect(mocks.devices).toHaveBeenCalledExactlyOnceWith('user_id', [OWNER]);
      expect(mocks.permission).toHaveBeenCalledWith({
        p_ws_id: ROOT_WORKSPACE_ID,
        p_user_id: OWNER,
        p_permission: 'view_infrastructure',
      });
      expect(mocks.push).toHaveBeenCalledExactlyOnceWith({
        devices: [{ token: 'owner-device' }],
        message: {
          title: 'Approve rollout',
          body: 'Rollout review summary',
          category: 'mastermind_inbox_decision',
          androidChannelId: 'mastermind_inbox_decision',
          androidPriority: 'high',
          interruptionLevel: 'time-sensitive',
          expiresAt: expect.any(String),
          data: {
            openTarget: 'mastermind',
            route: '/mastermind/inbox',
            entityId: decision.id,
            userId: OWNER,
            mastermindCategory: 'decision',
          },
        },
      });

      minutes(2);
      expect((await publish(state(decision.id))).status).toBe(200);
      minutes(2);
      expect((await publish(state())).status).toBe(200);
      minutes(2);
      expect((await publish(state(decision.id))).status).toBe(200);
      expect(mocks.push).toHaveBeenCalledTimes(1);
    });

    it('deduplicates concurrent publishes and dispatches each distinct card', async () => {
      const first = state('first', 'second');
      const concurrent = await Promise.all([
        publish(first),
        publish({
          ...first,
          generatedAt: new Date(Date.now() + 1).toISOString(),
        }),
      ]);
      expect(concurrent.map(({ status }) => status)).toEqual([200, 200]);
      minutes(0.5);
      expect((await publish(state('first', 'second', 'third'))).status).toBe(
        200
      );
      expect(mocks.push).toHaveBeenCalledTimes(3);
      minutes(1);
      expect(
        (await publish(state('first', 'second', 'third', 'fourth'))).status
      ).toBe(200);
      expect(mocks.push).toHaveBeenCalledTimes(4);
    });

    it('skips a card answered before ingest and dispatches the next new card', async () => {
      const store = mocks.store;
      if (!store) throw new Error('Missing test store');
      await recordFleetAnswer(
        store,
        'answered',
        { action: 'hold' },
        randomUUID()
      );
      expect((await publish(state('answered'))).status).toBe(200);
      minutes(0.25);
      expect((await publish(state())).status).toBe(200);
      expect(mocks.push).not.toHaveBeenCalled();
      minutes(0.25);
      expect((await publish(state('fresh'))).status).toBe(200);
      expect(mocks.push).toHaveBeenCalledTimes(1);
    });

    it('keeps the accepted snapshot when push delivery fails', async () => {
      mocks.push.mockRejectedValueOnce(new Error('FCM unavailable'));
      expect((await publish(state('first'))).status).toBe(200);
      minutes(2);
      expect((await publish(state('first'))).status).toBe(200);
      expect(mocks.push).toHaveBeenCalledTimes(1);
    });
  });

  describe('PUT state (publisher)', () => {
    it('accepts a signed snapshot once and refuses its replay', async () => {
      const state = JSON.stringify(sampleFleetState());
      const request = signed('PUT', '/api/v1/mastermind/fleet/state', state);
      const replay = request.clone();
      const { PUT } = await import('./state/route');
      expect((await PUT(request)).status).toBe(200);
      expect((await PUT(replay)).status).toBe(409);
    });

    it('refuses unsigned, wrongly signed and path-swapped requests', async () => {
      const { PUT } = await import('./state/route');
      const body = JSON.stringify(sampleFleetState());
      expect(
        (
          await PUT(
            new Request('https://tuturuuu.com/api/v1/mastermind/fleet/state', {
              method: 'PUT',
              body,
            })
          )
        ).status
      ).toBe(401);
      expect(
        (
          await PUT(
            signed('PUT', '/api/v1/mastermind/fleet/state', body, `${SECRET}x`)
          )
        ).status
      ).toBe(401);
      const swapped = signed('POST', '/api/v1/mastermind/fleet/answers', body);
      expect(
        (
          await PUT(
            new Request('https://tuturuuu.com/api/v1/mastermind/fleet/state', {
              method: 'PUT',
              headers: swapped.headers,
              body,
            })
          )
        ).status
      ).toBe(401);
    });

    it('fails closed without a configured secret', async () => {
      vi.stubEnv('MASTERMIND_FLEET_PUBLISHER_SECRET', '');
      expect((await publish()).status).toBe(503);
    });

    it('rejects an invalid snapshot', async () => {
      expect((await publish({ version: 2 })).status).toBe(422);
    });
  });

  describe('GET state (owner)', () => {
    it('answers 503 when no store is configured', async () => {
      mocks.store = null;
      expect((await ownerRead()).status).toBe(503);
    });

    it('is 404 before the first publish', async () => {
      expect((await ownerRead()).status).toBe(404);
    });

    it('denies a non-owner and an owner without the root permission', async () => {
      await publish();
      mocks.user = { id: '22222222-2222-4222-8222-222222222222' };
      mocks.granted = ['view_infrastructure'];
      expect((await ownerRead()).status).toBe(403);
      mocks.user = { id: OWNER };
      mocks.granted = [];
      expect((await ownerRead()).status).toBe(403);
    });

    it('returns the snapshot, receipts without reply text, and honours ETag', async () => {
      await publish();
      await answer('ship-fleet-sync', {
        action: 'reply',
        text: 'private words',
      });
      const response = await ownerRead();
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      const body = await response.json();
      expect(body.state.lanes).toHaveLength(1);
      expect(body.answers['ship-fleet-sync']).toEqual({
        action: 'reply',
        revision: 1,
        answeredAt: expect.any(String),
        pickedUp: false,
      });
      expect(JSON.stringify(body)).not.toContain('private words');

      const etag = response.headers.get('etag') ?? '';
      expect((await ownerRead({ 'if-none-match': etag })).status).toBe(304);
    });
  });

  describe('POST answer (owner)', () => {
    beforeEach(async () => {
      await publish();
    });

    it('exempts only the fleet owner from the browser step-up challenge', async () => {
      await import('./decisions/[decisionId]/answer/route');
      const exempt = mocks.authOptions
        .map(
          (o) =>
            (o as { stepUpExempt?: (u: unknown) => Promise<boolean> })
              .stepUpExempt
        )
        .filter(Boolean);
      // Only the answer route opts in; the native app cannot solve Turnstile.
      expect(exempt).toHaveLength(1);
      expect(await exempt[0]?.({ id: OWNER })).toBe(true);
      expect(await exempt[0]?.({ id: NO_PERMISSION })).toBe(false);
      mocks.granted = [];
      expect(await exempt[0]?.({ id: OWNER })).toBe(false);
    });

    it('records an answer to an open decision', async () => {
      const response = await answer('ship-fleet-sync', {
        action: 'approve',
        optionId: 'yes',
      });
      expect(response.status).toBe(202);
      expect(await response.json()).toMatchObject({
        action: 'approve',
        optionId: 'yes',
        pickedUp: false,
      });
    });

    it('needs an idempotency key, an open decision and a known option', async () => {
      expect(
        (await answer('ship-fleet-sync', { action: 'hold' }, null)).status
      ).toBe(400);
      expect((await answer('gone', { action: 'hold' })).status).toBe(409);
      expect(
        (
          await answer('ship-fleet-sync', {
            action: 'approve',
            optionId: 'other',
          })
        ).status
      ).toBe(422);
    });

    const loginDecision = (expiresAt: string) => ({
      id: 'gh-login',
      kind: 'login',
      title: 'GitHub sign-in on Devbox',
      urgency: 'high',
      login: {
        service: 'github',
        flow: 'device',
        state: 'waiting',
        url: 'https://github.com/login/device',
        userCode: 'ABCD-1234',
        expiresAt,
      },
      createdAt: '2026-11-20T02:30:00.000Z',
    });
    const publishLogin = (expiresAt: string) =>
      publish(
        sampleFleetState({
          decisions: [
            ...sampleFleetState().decisions,
            loginDecision(expiresAt),
          ],
        })
      );
    const soon = () => new Date(Date.now() + 10 * 60_000).toISOString();

    it('takes "I signed in" only on open login requests', async () => {
      await publishLogin(soon());
      expect(
        (await answer('ship-fleet-sync', { action: 'signed_in' })).status
      ).toBe(422);
      expect((await answer('gh-login', { action: 'approve' })).status).toBe(
        422
      );
      const signedIn = await answer('gh-login', { action: 'signed_in' });
      expect(signedIn.status).toBe(202);
      expect(await signedIn.json()).toMatchObject({ action: 'signed_in' });
      expect(
        (await answer('gh-login', { action: 'reply', text: 'Later' })).status
      ).toBe(202);
    });

    it('replays "I signed in" after the request closes', async () => {
      await publishLogin(soon());
      const key = randomUUID();
      const body = { action: 'signed_in' };
      expect((await answer('gh-login', body, key)).status).toBe(202);
      vi.setSystemTime(Date.now() + 20 * 60_000);
      expect((await answer('gh-login', body, key)).status).toBe(202);
      expect((await answer('gh-login', body)).status).toBe(409);
    });

    it('refuses "I signed in" once the request has expired', async () => {
      await publishLogin('2026-11-20T02:45:00.000Z');
      expect((await answer('gh-login', { action: 'signed_in' })).status).toBe(
        409
      );
    });

    it('shows login requests only to clients that declare the feature', async () => {
      await publishLogin(soon());
      const legacy = await (await ownerRead()).json();
      expect(legacy.state.decisions.map((d: { id: string }) => d.id)).toEqual([
        'ship-fleet-sync',
      ]);
      const current = await (
        await ownerRead({ 'x-mastermind-fleet-features': 'login' })
      ).json();
      expect(
        current.state.decisions.find((d: { id: string }) => d.id === 'gh-login')
          .login
      ).toMatchObject({ state: 'waiting', userCode: 'ABCD-1234' });
    });

    it('serves an expired login without its link or code', async () => {
      await publishLogin('2026-11-20T02:45:00.000Z');
      const body = await (
        await ownerRead({ 'x-mastermind-fleet-features': 'login' })
      ).json();
      const login = body.state.decisions.find(
        (d: { id: string }) => d.id === 'gh-login'
      ).login;
      expect(login.state).toBe('expired');
      expect(login.url).toBeUndefined();
      expect(login.userCode).toBeUndefined();
    });

    it('accepts the idempotency key in the body', async () => {
      const key = randomUUID();
      const first = await answer(
        'ship-fleet-sync',
        { action: 'hold', idempotencyKey: key },
        null
      );
      expect(first.status).toBe(202);
      const retry = await answer(
        'ship-fleet-sync',
        { action: 'hold', idempotencyKey: key },
        null
      );
      expect(await retry.json()).toMatchObject({ revision: 1 });
      expect(
        (
          await answer(
            'ship-fleet-sync',
            { action: 'hold', idempotencyKey: 'nope' },
            null
          )
        ).status
      ).toBe(400);
    });

    it('refuses a reused key on an open decision', async () => {
      const key = randomUUID();
      const hold = { action: 'hold' };
      const first = await answer('ship-fleet-sync', hold, key);
      expect(JSON.stringify(await first.json())).not.toContain(OWNER);
      expect((await answer('ship-fleet-sync', hold, key)).status).toBe(202);
      const reply = { action: 'reply', text: 'Go' };
      const changed = await answer('ship-fleet-sync', reply, key);
      expect(await changed.json()).toEqual({ error: 'idempotency_conflict' });
      vi.stubEnv('MASTERMIND_PUSH_OWNER_IDS', `${OWNER},${PUSH_OWNER}`);
      mocks.user = { id: PUSH_OWNER };
      expect((await answer('ship-fleet-sync', hold, key)).status).toBe(409);
    });

    it('replays a recorded answer after its decision closed', async () => {
      const key = randomUUID();
      const body = { action: 'reply', text: 'Wait' };
      const first = await answer('ship-fleet-sync', body, key);
      expect(first.status).toBe(202);
      const { revision } = await first.json();
      await publish(sampleFleetState({ decisions: [] }));

      const retry = await answer('ship-fleet-sync', body, key);
      expect(retry.status).toBe(202);
      const replayed = await retry.json();
      expect(replayed).toMatchObject({ action: 'reply', revision });
      // A receipt never carries who answered.
      expect(JSON.stringify(replayed)).not.toContain(OWNER);
      const other = { action: 'reply', text: 'Go' };
      expect((await answer('ship-fleet-sync', other, key)).status).toBe(409);
      expect((await answer('ship-fleet-sync', body)).status).toBe(409);
      vi.stubEnv('MASTERMIND_PUSH_OWNER_IDS', `${OWNER},${PUSH_OWNER}`);
      mocks.user = { id: PUSH_OWNER };
      expect((await answer('ship-fleet-sync', body, key)).status).toBe(409);
    });

    it('denies a non-owner', async () => {
      mocks.user = { id: '22222222-2222-4222-8222-222222222222' };
      expect((await answer('ship-fleet-sync', { action: 'hold' })).status).toBe(
        403
      );
    });
  });

  describe('answers pull and ack (publisher)', () => {
    it('keeps an answer pullable after its decision leaves the snapshot', async () => {
      await publish();
      await answer('ship-fleet-sync', { action: 'approve', optionId: 'yes' });
      // Closed elsewhere (or a fallback publish) before the next pickup.
      await publish(sampleFleetState({ decisions: [] }));
      const { GET, POST } = await import('./answers/route');
      const pull = async () =>
        (
          await (
            await GET(
              signed(
                'GET',
                `/api/v1/mastermind/fleet/answers?nonce=${randomUUID()}`
              )
            )
          ).json()
        ).answers;
      expect(await pull()).toEqual([
        expect.objectContaining({ decisionId: 'ship-fleet-sync', revision: 1 }),
      ]);
      await POST(
        signed(
          'POST',
          '/api/v1/mastermind/fleet/answers',
          JSON.stringify({
            acks: [{ decisionId: 'ship-fleet-sync', revision: 1 }],
          })
        )
      );
      expect(await pull()).toEqual([]);
    });

    it('returns pending answers with text, then clears them on ack', async () => {
      await publish();
      await answer('ship-fleet-sync', { action: 'reply', text: 'Wait' });
      const { GET, POST } = await import('./answers/route');
      const pulled = await GET(
        signed('GET', `/api/v1/mastermind/fleet/answers?nonce=${randomUUID()}`)
      );
      expect(pulled.status).toBe(200);
      const pulledBody = await pulled.json();
      // Who answered is kept for receipts only; the orchestrator never sees it.
      expect(JSON.stringify(pulledBody)).not.toContain(OWNER);
      expect(pulledBody.answers).toEqual([
        expect.objectContaining({
          decisionId: 'ship-fleet-sync',
          revision: 1,
          text: 'Wait',
        }),
      ]);

      const ack = JSON.stringify({
        acks: [{ decisionId: 'ship-fleet-sync', revision: 1 }],
      });
      const acked = await POST(
        signed('POST', '/api/v1/mastermind/fleet/answers', ack)
      );
      expect(await acked.json()).toEqual({ acknowledged: 1 });
      const again = await GET(
        signed('GET', `/api/v1/mastermind/fleet/answers?nonce=${randomUUID()}`)
      );
      expect((await again.json()).answers).toEqual([]);
    });

    it('refuses an owner session without the publisher signature', async () => {
      const { GET } = await import('./answers/route');
      expect(
        (
          await GET(
            new Request('https://tuturuuu.com/api/v1/mastermind/fleet/answers')
          )
        ).status
      ).toBe(401);
    });
  });
});
