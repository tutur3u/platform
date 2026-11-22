// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authorize: vi.fn() }));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('@/lib/infrastructure-admin-access', () => ({
  authorizeInfrastructureAdminRequest: mocks.authorize,
}));

import { GET } from './route';

beforeEach(() => vi.resetAllMocks());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it('conceals failed root authorization, passing the request into the existing authorizer', async () => {
  mocks.authorize.mockResolvedValue({
    ok: false,
    response: new Response(null, { status: 403 }),
  });
  const request = new Request(
    'https://infrastructure.tuturuuu.com/api/v1/ops-hub/status'
  );
  expect((await GET(request)).status).toBe(404);
  expect(mocks.authorize).toHaveBeenCalledWith(
    'view_infrastructure',
    true,
    request
  );
});
it('conceals auth backend exceptions', async () => {
  mocks.authorize.mockRejectedValue(new Error('unavailable'));
  expect(
    (
      await GET(
        new Request('https://infrastructure.tuturuuu.com/api/v1/ops-hub/status')
      )
    ).status
  ).toBe(404);
});

it('forwards through the Worker fetch receiver after authorizing the admin', async () => {
  mocks.authorize.mockResolvedValue({
    ok: true,
    user: { id: '11111111-1111-4111-8111-111111111111' },
  });
  vi.stubEnv('OPS_HUB_WORKER_URL', 'https://ops-fixture.account.workers.dev');
  vi.stubEnv('OPS_HUB_GATEWAY_SECRET', 'x'.repeat(43));
  vi.stubEnv(
    'OPS_HUB_ALLOWED_USER_IDS',
    '11111111-1111-4111-8111-111111111111'
  );
  const payload = { enabled: true };
  const workerFetch = vi.fn(function (this: typeof globalThis) {
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    return Promise.resolve(Response.json(payload));
  });
  vi.stubGlobal('fetch', workerFetch);

  const response = await GET(
    new Request('https://infrastructure.tuturuuu.com/api/v1/ops-hub/status')
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(payload);
  expect(workerFetch).toHaveBeenCalledExactlyOnceWith(
    'https://ops-fixture.account.workers.dev/status',
    expect.objectContaining({ method: 'GET', redirect: 'manual' })
  );
});
