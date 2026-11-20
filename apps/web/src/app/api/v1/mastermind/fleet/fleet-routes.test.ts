import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FleetAnswerRecord } from '@/lib/mastermind/fleet/contract';
import { sampleFleetState } from '@/lib/mastermind/fleet/sample-state.fixture';
import { fleetSignedPayload } from '@/lib/mastermind/fleet/signing';
import { signMastermindPushEvent } from '@/lib/mastermind/push-events/signature';

vi.mock('server-only', () => ({}));

const OWNER = '11111111-1111-4111-8111-111111111111';
const SECRET = 'fleet-publisher-secret-for-tests-0123456789';

const mocks = vi.hoisted(() => ({
  user: { id: '' },
  granted: [] as string[],
  kv: new Map<string, string>(),
  answers: {} as Record<string, FleetAnswerRecord>,
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (r: Request, a: unknown, p: unknown) => Response,
      _options?: unknown
    ) =>
    async (request: Request, context?: { params?: unknown }) =>
      handler(request, { user: mocks.user }, await context?.params),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: async () => ({
    containsPermission: (p: string) => mocks.granted.includes(p),
  }),
}));
vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRestRedisClient: async () => ({
    get: async (key: string) => mocks.kv.get(key) ?? null,
    set: async (key: string, value: string, options?: { nx?: boolean }) => {
      if (options?.nx && mocks.kv.has(key)) return null;
      mocks.kv.set(key, value);
      return 'OK';
    },
    eval: async () => {
      throw new Error('eval is covered by store.redis.test.ts');
    },
  }),
}));
// The Lua scripts run on real redis in store.redis.test.ts; here a JS model.
vi.mock('@/lib/mastermind/fleet/store', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/mastermind/fleet/store')>();
  return {
    ...actual,
    readFleetAnswers: async () => mocks.answers,
    recordFleetAnswer: async (
      _redis: unknown,
      decisionId: string,
      input: {
        action: 'approve' | 'hold' | 'reply';
        optionId?: string;
        text?: string;
      },
      idempotencyKey: string
    ) => {
      const current = mocks.answers[decisionId];
      if (current?.idempotencyKey === idempotencyKey) return current;
      const record: FleetAnswerRecord = {
        decisionId,
        ...input,
        idempotencyKey,
        answeredAt: '2026-11-20T03:01:00.000Z',
        revision: (current?.revision ?? 0) + 1,
        pickedUpRevision: current?.pickedUpRevision ?? 0,
      };
      mocks.answers[decisionId] = record;
      return record;
    },
    acknowledgeFleetAnswers: async (
      _redis: unknown,
      acks: { decisionId: string; revision: number }[]
    ) => {
      let changed = 0;
      for (const ack of acks) {
        const current = mocks.answers[ack.decisionId];
        if (current && ack.revision > current.pickedUpRevision) {
          current.pickedUpRevision = ack.revision;
          changed++;
        }
      }
      return changed;
    },
  };
});

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
  beforeEach(() => {
    mocks.kv.clear();
    mocks.answers = {};
    mocks.user = { id: OWNER };
    mocks.granted = ['view_infrastructure'];
    vi.stubEnv('MASTERMIND_FLEET_PUBLISHER_SECRET', SECRET);
    vi.stubEnv('MASTERMIND_PUSH_OWNER_IDS', OWNER);
    vi.stubEnv('MASTERMIND_REQUIRE_EXPLICIT_GRANT', '');
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
        answeredAt: '2026-11-20T03:01:00.000Z',
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

    it('denies a non-owner', async () => {
      mocks.user = { id: '22222222-2222-4222-8222-222222222222' };
      expect((await answer('ship-fleet-sync', { action: 'hold' })).status).toBe(
        403
      );
    });
  });

  describe('answers pull and ack (publisher)', () => {
    it('returns pending answers with text, then clears them on ack', async () => {
      await publish();
      await answer('ship-fleet-sync', { action: 'reply', text: 'Wait' });
      const { GET, POST } = await import('./answers/route');
      const pulled = await GET(
        signed('GET', `/api/v1/mastermind/fleet/answers?nonce=${randomUUID()}`)
      );
      expect(pulled.status).toBe(200);
      expect((await pulled.json()).answers).toEqual([
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
