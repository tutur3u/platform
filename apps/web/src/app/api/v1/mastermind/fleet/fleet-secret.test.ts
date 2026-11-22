import { randomUUID } from 'node:crypto';
import { createMemoryMastermindStore } from '@tuturuuu/utils/mastermind-store/client';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFleetState } from '@/lib/mastermind/fleet/sample-state.fixture';
import {
  ownerAnswer,
  secretFixture,
  secretPairDecision,
  secretRequestDecision,
  strangerSigner,
} from '@/lib/mastermind/fleet/secret.fixture';
import { fleetSignedPayload } from '@/lib/mastermind/fleet/signing';
import { signMastermindPushEvent } from '@/lib/mastermind/push-events/signature';

vi.mock('server-only', () => ({}));

const OWNER = '11111111-1111-4111-8111-111111111111';
const SECRET = 'fleet-test-'.padEnd(44, 'f');
const T0 = new Date('2026-11-22T10:00:00.000Z');

const mocks = vi.hoisted(() => ({
  user: { id: '' },
  granted: [] as string[],
  store: null as ReturnType<typeof createMemoryMastermindStore> | null,
  assurance: vi.fn(),
  devices: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (r: Request, a: unknown, p: unknown) => Response) =>
    async (request: Request, context?: { params?: unknown }) =>
      handler(
        request,
        { user: mocks.user, supabase: {} },
        await context?.params
      ),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: async () => ({
    containsPermission: (p: string) => mocks.granted.includes(p),
  }),
}));
vi.mock('@/lib/mastermind/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mastermind/store')>()),
  getMastermindStore: async () => mocks.store,
}));
vi.mock('@/lib/mastermind/fleet/bridge', () => ({
  replyAssurance: mocks.assurance,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: () => ({ select: () => ({ in: mocks.devices }) }),
    rpc: async () => ({ data: true, error: null }),
  }),
}));
vi.mock('@/lib/notifications/push-delivery', () => ({
  sendCustomPushMessageBatch: mocks.push,
}));

function signed(method: string, path: string, body = '') {
  // Each publisher signature is claimed once; a new second signs anew.
  vi.setSystemTime(Date.now() + 1000);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signMastermindPushEvent(
    SECRET,
    timestamp,
    fleetSignedPayload(method, path, body)
  );
  return new Request(`https://tuturuuu.com${path}`, {
    method,
    headers: { 'x-mm-signature': signature, 'x-mm-timestamp': timestamp },
    ...(body ? { body } : {}),
  });
}

let generation = 0;
async function publish(decisions: unknown[], extra: object = {}) {
  const { PUT } = await import('./state/route');
  generation += 1;
  const state = sampleFleetState({
    generatedAt: new Date(T0.getTime() + generation).toISOString(),
    decisions,
    ...extra,
  });
  return PUT(
    signed('PUT', '/api/v1/mastermind/fleet/state', JSON.stringify(state))
  );
}

async function answer(decisionId: string, body: unknown, key = randomUUID()) {
  const { POST } = await import('./decisions/[decisionId]/answer/route');
  return POST(
    new NextRequest(
      `https://tuturuuu.com/api/v1/mastermind/fleet/decisions/${decisionId}/answer`,
      {
        method: 'POST',
        headers: { 'idempotency-key': key },
        body: JSON.stringify(body),
      }
    ),
    { params: Promise.resolve({ decisionId }) }
  );
}

async function pull() {
  const { GET } = await import('./answers/route');
  const response = await GET(signed('GET', '/api/v1/mastermind/fleet/answers'));
  return (await response.json()).answers as Record<string, unknown>[];
}

async function ack(acks: { decisionId: string; revision: number }[]) {
  const { POST } = await import('./answers/route');
  const body = JSON.stringify({ acks });
  return POST(signed('POST', '/api/v1/mastermind/fleet/answers', body));
}

async function ownerRead(features?: string) {
  const { GET } = await import('./state/route');
  const response = await GET(
    new NextRequest('https://tuturuuu.com/api/v1/mastermind/fleet/state', {
      headers: features ? { 'x-mastermind-fleet-features': features } : {},
    })
  );
  return response.json();
}

const minutes = (value: number) =>
  vi.setSystemTime(T0.getTime() + value * 60_000);
const ask = sampleFleetState().decisions[0]!;
const request = secretRequestDecision(T0);
const pairing = secretPairDecision(T0);
const pairAnswer = (n: number) => ({
  action: 'pair',
  pair: {
    ownerKey: secretFixture.ownerKey,
    ownerMac: Buffer.alloc(32, n).toString('base64url'),
  },
});

// Design: apps/docs/build/devops/mastermind-secret-entry.mdx#relay-web-and-store
describe('Mastermind secret answers', () => {
  let logs: unknown[][];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    vi.clearAllMocks();
    generation = 0;
    mocks.store = createMemoryMastermindStore();
    mocks.user = { id: OWNER };
    mocks.granted = ['view_infrastructure'];
    mocks.assurance.mockResolvedValue({
      status: 'allowed',
      proof: { sessionId: 'session-1', verifiedAt: 0 },
    });
    mocks.devices.mockReturnValue({
      limit: async () => ({
        data: [{ user_id: OWNER, token: 'owner-device' }],
        error: null,
      }),
    });
    mocks.push.mockResolvedValue({ deliveredCount: 1, invalidTokens: [] });
    vi.stubEnv('MASTERMIND_FLEET_PUBLISHER_SECRET', SECRET);
    vi.stubEnv('MASTERMIND_PUSH_OWNER_IDS', OWNER);
    vi.stubEnv('MASTERMIND_FLEET_OWNER_IDS', OWNER);
    vi.stubEnv('MASTERMIND_PUSH_LOCALE', 'en');
    vi.stubEnv('MASTERMIND_REQUIRE_EXPLICIT_GRANT', '');
    vi.stubEnv('MASTERMIND_SECRET_MFA_MAX_AGE_SECONDS', '');
    logs = [];
    for (const level of ['info', 'warn', 'error', 'log'] as const)
      vi.spyOn(console, level).mockImplementation((...args) => {
        logs.push(args);
      });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('relays a signed secret once, opaque, and logs only time, id and outcome', async () => {
    expect((await publish([ask, request])).status).toBe(200);
    minutes(5);
    const answeredAt = new Date().toISOString();
    const body = ownerAnswer(request, { signedAt: answeredAt });
    const key = randomUUID();
    const response = await answer(request.id, body, key);
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      action: 'secret',
      revision: 1,
      pickedUp: false,
    });
    // The step-up asked for this very session, at most 300 seconds old.
    expect(mocks.assurance).toHaveBeenCalledWith(
      expect.anything(),
      { userId: OWNER, supabase: {} },
      300
    );
    expect(await pull()).toEqual([
      {
        decisionId: request.id,
        revision: 1,
        action: 'secret',
        sealed: body.sealed,
        owner: body.owner,
        answeredAt,
      },
    ]);
    const text = JSON.stringify(logs);
    for (const value of [
      body.sealed!.ct,
      body.sealed!.enc,
      body.owner.sig,
      body.owner.publicKey,
      OWNER,
      key,
      'session-1',
    ])
      expect(text).not.toContain(value);
    expect(logs).toContainEqual([
      'Mastermind fleet secret answer',
      { at: answeredAt, requestId: request.id, outcome: 'accepted' },
    ]);
  });

  it('needs the step-up for secret and pair, and the session only to decline', async () => {
    await publish([request, pairing]);
    vi.stubEnv('MASTERMIND_SECRET_MFA_MAX_AGE_SECONDS', '20');
    mocks.assurance.mockResolvedValue({ status: 'required' });
    for (const [id, body] of [
      [request.id, ownerAnswer(request)],
      [pairing.id, pairAnswer(1)],
    ] as const) {
      const response = await answer(id, body);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: 'mfa_required',
        maxAgeSeconds: 60,
      });
    }
    mocks.assurance.mockClear();
    expect(
      (await answer(request.id, ownerAnswer(request, { action: 'decline' })))
        .status
    ).toBe(202);
    expect(mocks.assurance).not.toHaveBeenCalled();
    expect(await pull()).toMatchObject([{ action: 'decline' }]);
  });

  it('refuses a non-owner before anything else', async () => {
    await publish([request]);
    mocks.user = { id: '33333333-3333-4333-8333-333333333333' };
    expect((await answer(request.id, ownerAnswer(request))).status).toBe(403);
    expect(mocks.assurance).not.toHaveBeenCalled();
  });

  it('checks the owner signature against the stored request before claiming', async () => {
    await publish([request]);
    const good = ownerAnswer(request);
    const tamperedSig = Buffer.from(good.owner.sig, 'base64url');
    tamperedSig[10]! ^= 1;
    for (const [label, body] of [
      [
        'tampered signature',
        {
          ...good,
          owner: { ...good.owner, sig: tamperedSig.toString('base64url') },
        },
      ],
      [
        'key outside the audience',
        ownerAnswer(request, { signer: strangerSigner }),
      ],
      ['wrong key id', ownerAnswer(request, { keyId: 'f'.repeat(32) })],
      [
        'signed after expiry',
        ownerAnswer(request, {
          signedAt: new Date(T0.getTime() + 11 * 60_000).toISOString(),
        }),
      ],
      [
        'signed for another request',
        ownerAnswer(
          secretRequestDecision(T0, { id: 'secret-ffffffffffffffffffffffff' })
        ),
      ],
    ] as const) {
      const response = await answer(request.id, body);
      expect([label, response.status, (await response.json()).error]).toEqual([
        label,
        422,
        'invalid_answer',
      ]);
    }
    // None of them took the slot.
    expect(await pull()).toEqual([]);
    expect((await answer(request.id, good)).status).toBe(202);
  });

  it('keeps secret actions and secret decisions to each other', async () => {
    await publish([ask, request, pairing]);
    for (const [label, id, body] of [
      ['secret on an ask', ask.id, ownerAnswer(request)],
      ['pair on an ask', ask.id, pairAnswer(1)],
      [
        'approve on a request',
        request.id,
        { action: 'approve', optionId: 'yes' },
      ],
      ['reply on a request', request.id, { action: 'reply', text: 'hello' }],
      ['pair on a request', request.id, pairAnswer(1)],
      ['secret on a pairing', pairing.id, ownerAnswer(request)],
      ['hold on a pairing', pairing.id, { action: 'hold' }],
    ] as const) {
      const response = await answer(id, body);
      expect([label, response.status]).toEqual([label, 422]);
    }
    expect(await pull()).toEqual([]);
  });

  it('takes one answer per request and replays only the same key and payload', async () => {
    await publish([request]);
    const first = ownerAnswer(request);
    const key = randomUUID();
    expect((await answer(request.id, first, key)).status).toBe(202);
    const second = await answer(
      request.id,
      ownerAnswer(request, { action: 'decline' })
    );
    expect([second.status, (await second.json()).error]).toEqual([
      409,
      'secret_closed',
    ]);
    const replay = await answer(request.id, first, key);
    expect([replay.status, (await replay.json()).revision]).toEqual([202, 1]);
    const changed = await answer(
      request.id,
      ownerAnswer(request, {
        signedAt: new Date(T0.getTime() + 1).toISOString(),
      }),
      key
    );
    expect([changed.status, (await changed.json()).error]).toEqual([
      409,
      'idempotency_conflict',
    ]);
    expect(await pull()).toMatchObject([{ revision: 1, action: 'secret' }]);
  });

  it('closes 15 seconds before expiry and when the request leaves the snapshot', async () => {
    await publish([request]);
    const key = randomUUID();
    const body = ownerAnswer(request);
    expect((await ownerRead('secret')).state.decisions).toHaveLength(1);
    vi.setSystemTime(T0.getTime() + 10 * 60_000 - 14_000);
    const late = await answer(request.id, body, key);
    expect([late.status, (await late.json()).error]).toEqual([
      409,
      'secret_closed',
    ]);
    expect((await ownerRead('secret')).state.decisions).toEqual([]);

    vi.setSystemTime(T0.getTime() + 60_000);
    await publish([]);
    const gone = await answer(request.id, body);
    expect([gone.status, (await gone.json()).error]).toEqual([
      409,
      'secret_closed',
    ]);
  });

  it('replays the receipt after withdrawal and after acknowledgement, without the payload', async () => {
    await publish([request]);
    const key = randomUUID();
    const body = ownerAnswer(request);
    expect((await answer(request.id, body, key)).status).toBe(202);
    await publish([]);
    // The pending index keeps it pullable even with no recent list at all.
    await mocks.store!.del('mastermind:fleet:v1:recent');
    expect(await pull()).toMatchObject([
      { decisionId: request.id, revision: 1 },
    ]);
    expect(
      await mocks.store!.get('mastermind:fleet:v1:secret-pending')
    ).toContain(request.id);

    expect(
      await (await ack([{ decisionId: request.id, revision: 1 }])).json()
    ).toEqual({
      acknowledged: 1,
    });
    expect(await pull()).toEqual([]);
    expect(
      await mocks.store!.get('mastermind:fleet:v1:secret-pending')
    ).not.toContain(request.id);
    const record = await mocks.store!.get(
      `mastermind:fleet:v1:answer:${request.id}`
    );
    expect(record).not.toContain(body.sealed!.ct);
    expect(record).not.toContain(body.owner.sig);
    expect(record).toMatch(/"payloadDigest":"[0-9a-f]{64}"/);

    const replay = await answer(request.id, body, key);
    expect([replay.status, (await replay.json()).pickedUp]).toEqual([
      202,
      true,
    ]);
    const other = await answer(
      request.id,
      ownerAnswer(request, { action: 'decline' }),
      key
    );
    expect(other.status).toBe(409);

    // The record and its replay last until expiry plus 10 minutes.
    vi.setSystemTime(T0.getTime() + 20 * 60_000 + 1);
    expect(
      await mocks.store!.get(`mastermind:fleet:v1:answer:${request.id}`)
    ).toBeNull();
  });

  it('keeps up to five pairing answers, each pulled until acknowledged', async () => {
    await publish([pairing]);
    const keys = Array.from({ length: 6 }, () => randomUUID());
    for (let n = 1; n <= 5; n++)
      expect(
        (await answer(pairing.id, pairAnswer(n), keys[n - 1])).status
      ).toBe(202);
    const sixth = await answer(pairing.id, pairAnswer(6), keys[5]);
    expect([sixth.status, (await sixth.json()).error]).toEqual([
      409,
      'secret_closed',
    ]);
    // An earlier revision's retry still replays its own receipt.
    const retry = await answer(pairing.id, pairAnswer(2), keys[1]);
    expect([retry.status, (await retry.json()).revision]).toEqual([202, 2]);

    const pulled = await pull();
    expect(pulled.map((entry) => entry.revision)).toEqual([1, 2, 3, 4, 5]);
    expect(pulled[0]).toMatchObject({
      action: 'pair',
      pair: pairAnswer(1).pair,
    });

    await ack([{ decisionId: pairing.id, revision: 3 }]);
    expect((await pull()).map((entry) => entry.revision)).toEqual([4, 5]);
    await ack([{ decisionId: pairing.id, revision: 5 }]);
    expect(await pull()).toEqual([]);
    const record = await mocks.store!.get(
      `mastermind:fleet:v1:answer:${pairing.id}`
    );
    expect(record).not.toContain('ownerMac');
  });

  it('hides secret decisions and outcomes from clients without the feature', async () => {
    await publish([ask, request], {
      resolved: [
        {
          id: 'secret-ffffffffffffffffffffffff',
          kind: 'secret',
          title: 'Earlier request',
          resolvedAt: T0.toISOString(),
          secretOutcome: {
            outcome: 'declined',
            answerDigest: '',
            sig: secretFixture.outcome.sig,
          },
        },
      ],
    });
    const plain = await ownerRead('login,review');
    expect(plain.state.decisions.map((d: { id: string }) => d.id)).toEqual([
      ask.id,
    ]);
    expect(plain.state.resolved).toEqual([]);
    const opted = await ownerRead('secret');
    expect(opted.state.decisions.map((d: { id: string }) => d.id)).toEqual([
      ask.id,
      request.id,
    ]);
    expect(opted.state.resolved).toHaveLength(1);
  });

  it('refuses a snapshot whose secret request would need rewriting', async () => {
    for (const decision of [
      secretRequestDecision(T0, { purpose: 'Use ~/keys/sudo.txt please' }),
      secretRequestDecision(T0, { command: 'sudo -S' }),
    ])
      expect((await publish([decision])).status).toBe(422);
    const eleven = Array.from({ length: 11 }, (_, i) =>
      secretRequestDecision(T0, {
        id: `secret-${i.toString(16).padStart(24, '0')}`,
      })
    );
    expect((await publish(eleven)).status).toBe(422);
    expect((await publish(eleven.slice(0, 10))).status).toBe(200);
  });

  it('never sends a decision push for a secret request', async () => {
    await publish([]);
    await publish([request, pairing]);
    expect(mocks.push).not.toHaveBeenCalled();
    // The same publish path still pushes a new ask.
    vi.setSystemTime(T0.getTime() + 2 * 60_000);
    await publish([request, pairing, ask]);
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mocks.push.mock.calls)).not.toContain(request.title);
  });
});
