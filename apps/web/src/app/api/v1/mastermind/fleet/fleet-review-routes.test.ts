import { createHash, randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryMastermindStore } from '@tuturuuu/utils/mastermind-store/client';
import { sampleFleetState } from '@/lib/mastermind/fleet/sample-state.fixture';
import { fleetSignedPayload } from '@/lib/mastermind/fleet/signing';
import { signMastermindPushEvent } from '@/lib/mastermind/push-events/signature';

vi.mock('server-only', () => ({}));

const OWNER = '11111111-1111-4111-8111-111111111111';
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

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13,
]);
const PNG_ID = createHash('sha256').update(PNG).digest('hex');
const ASSET_PATH = `/api/v1/mastermind/fleet/review-assets/${PNG_ID}`;
const uploadBody = JSON.stringify({
  contentType: 'image/png',
  data: Buffer.from(PNG).toString('base64'),
});
const params = (assetId: string) => ({
  params: Promise.resolve({ assetId }),
});

async function uploadAsset(request: Request, assetId = PNG_ID) {
  const { PUT } = await import('./review-assets/[assetId]/route');
  return PUT(request, params(assetId));
}

async function readAsset(assetId = PNG_ID) {
  const { GET } = await import('./review-assets/[assetId]/route');
  return GET(
    new NextRequest(
      `https://tuturuuu.com/api/v1/mastermind/fleet/review-assets/${assetId}`
    ),
    params(assetId)
  );
}

const review = {
  id: 'review-ship',
  kind: 'review',
  title: 'Approve the Ship mockup?',
  urgency: 'normal',
  options: [],
  review: { mockupUrl: 'https://claude.ai/artifact/abc' },
  createdAt: '2026-11-20T02:50:00.000Z',
};

async function answer(decisionId: string, body: unknown) {
  const { POST } = await import('./decisions/[decisionId]/answer/route');
  return POST(
    new NextRequest(
      `https://tuturuuu.com/api/v1/mastermind/fleet/decisions/${decisionId}/answer`,
      {
        method: 'POST',
        headers: { 'idempotency-key': randomUUID() },
        body: JSON.stringify(body),
      }
    ),
    { params: Promise.resolve({ decisionId }) }
  );
}

// Product rule: apps/docs/platform/features/mobile-mastermind.mdx#design-review-asks
describe('Mastermind fleet design reviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.store = createMemoryMastermindStore();
    mocks.user = { id: OWNER };
    mocks.granted = ['view_infrastructure'];
    vi.stubEnv('MASTERMIND_FLEET_PUBLISHER_SECRET', SECRET);
    vi.stubEnv('MASTERMIND_PUSH_OWNER_IDS', OWNER);
    vi.stubEnv('MASTERMIND_FLEET_OWNER_IDS', '');
    vi.stubEnv('MASTERMIND_REQUIRE_EXPLICIT_GRANT', '');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('stores a signed upload and serves it to the owner as an inert image', async () => {
    expect(
      (await uploadAsset(signed('PUT', ASSET_PATH, uploadBody))).status
    ).toBe(201);
    const response = await readAsset();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toContain(
      'sandbox'
    );
    expect(response.headers.get('cache-control')).toContain('private');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
  });

  it('refuses unsigned, mismatched and oversized uploads', async () => {
    expect(
      (
        await uploadAsset(
          signed(
            'PUT',
            ASSET_PATH,
            uploadBody,
            'wrong-secret-0123456789-0123456789'
          )
        )
      ).status
    ).toBe(401);
    const otherId = 'a'.repeat(64);
    expect(
      (
        await uploadAsset(
          signed(
            'PUT',
            `/api/v1/mastermind/fleet/review-assets/${otherId}`,
            uploadBody
          ),
          otherId
        )
      ).status
    ).toBe(422);
    const huge = JSON.stringify({
      contentType: 'image/png',
      data: 'A'.repeat(400 * 1024),
    });
    expect((await uploadAsset(signed('PUT', ASSET_PATH, huge))).status).toBe(
      413
    );
    expect((await readAsset()).status).toBe(404);
  });

  it('caps live assets and renews a repeat upload', async () => {
    const png = (n: number) => {
      const bytes = new Uint8Array(PNG.length + 2);
      bytes.set(PNG);
      bytes[PNG.length] = n & 0xff;
      bytes[PNG.length + 1] = n >> 8;
      return bytes;
    };
    const put = async (bytes: Uint8Array) => {
      const id = createHash('sha256').update(bytes).digest('hex');
      const path = `/api/v1/mastermind/fleet/review-assets/${id}`;
      const body = JSON.stringify({
        contentType: 'image/png',
        data: Buffer.from(bytes).toString('base64'),
      });
      return (await uploadAsset(signed('PUT', path, body), id)).status;
    };
    for (let n = 0; n < 24; n++) expect(await put(png(n))).toBe(201);
    expect(await put(png(24))).toBe(429);
    // A live asset uploaded again renews instead of counting twice; a new
    // timestamp gives the repeat its own signature.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 2_000);
    expect(await put(png(3))).toBe(201);
    vi.useRealTimers();
  });

  it('serves assets to the owner only', async () => {
    await uploadAsset(signed('PUT', ASSET_PATH, uploadBody));
    mocks.user = { id: NO_PERMISSION };
    expect((await readAsset()).status).toBe(403);
    mocks.user = { id: OWNER };
    expect((await readAsset('../etc')).status).toBe(404);
  });

  it('takes Request changes only on a review, with notes', async () => {
    expect(
      (
        await publish(
          sampleFleetState({
            generatedAt: new Date().toISOString(),
            decisions: [
              review,
              { ...sampleFleetState().decisions[0], id: 'plain' },
            ],
          })
        )
      ).status
    ).toBe(200);
    expect(
      (
        await answer('review-ship', {
          action: 'request_changes',
          text: 'Wider cards',
        })
      ).status
    ).toBe(202);
    expect(
      (await answer('review-ship', { action: 'request_changes' })).status
    ).toBe(422);
    expect(
      (await answer('plain', { action: 'request_changes', text: 'x' })).status
    ).toBe(422);
    expect((await answer('review-ship', { action: 'approve' })).status).toBe(
      202
    );
  });
});
