// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  commit: vi.fn(),
  readState: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@/lib/infrastructure-admin-access', () => ({
  authorizeInfrastructureAdminRequest: mocks.authorize,
}));
vi.mock('@/lib/feature-flags/platform-feature-flag-store', () => ({
  asPrivateRpcAdmin: (admin: unknown) => admin,
  commitPlatformFeatureFlag: mocks.commit,
  readPlatformFeatureFlagState: mocks.readState,
}));

import { GET, POST } from './route';

const actor = '44444444-4444-4444-8444-444444444444';

const unsafeCookieHeaders: Array<Record<string, string>> = [
  {},
  { origin: 'https://infra.tuturuuu.com' },
  { 'x-tuturuuu-feature-flag-action': '1' },
  {
    origin: 'https://other.tuturuuu.com',
    'x-tuturuuu-feature-flag-action': '1',
  },
  {
    origin: 'https://infra.tuturuuu.com/path',
    'x-tuturuuu-feature-flag-action': '1',
  },
  { origin: 'null', 'x-tuturuuu-feature-flag-action': '1' },
  {
    origin: 'https://infra.tuturuuu.com',
    'x-tuturuuu-feature-flag-action': '1',
    'sec-fetch-site': 'same-site',
  },
  {
    origin: 'https://infra.tuturuuu.com',
    'x-tuturuuu-feature-flag-action': '1',
    'sec-fetch-site': 'cross-site',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue({
    ok: true,
    sbAdmin: {},
    user: { id: actor },
  });
});

describe('infrastructure feature flag routes', () => {
  it('returns the admin denial before reading or writing state', async () => {
    mocks.authorize.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
      }),
    });
    expect((await GET(new Request('http://localhost/flags'))).status).toBe(401);
    expect(
      (
        await POST(
          new Request('http://localhost/flags', {
            body: JSON.stringify({ flagKey: 'ENABLE_AI' }),
            method: 'POST',
            headers: { Authorization: 'Bearer fixture-admin-token' },
          })
        )
      ).status
    ).toBe(401);
    expect(mocks.readState).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('rejects a read-only family before the store mutation', async () => {
    const response = await POST(
      new Request('http://localhost/flags', {
        body: JSON.stringify({
          environment: 'production',
          expectedRevision: 0,
          flagKey: 'ENABLE_AI',
          operationId: '33333333-3333-4333-8333-333333333333',
          overrideEnabled: true,
        }),
        method: 'POST',
        headers: { Authorization: 'Bearer fixture-admin-token' },
      })
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'read_only_workspace_secret',
      storage: false,
    });
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('keeps an unknown mutation result without a second commit', async () => {
    mocks.commit.mockResolvedValue({
      operationId: '33333333-3333-4333-8333-333333333333',
      status: 'unknown',
    });
    const response = await POST(
      new Request('http://localhost/flags', {
        body: JSON.stringify({
          environment: 'production',
          expectedRevision: 0,
          flagKey: 'mobile_offline',
          operationId: '33333333-3333-4333-8333-333333333333',
          overrideEnabled: true,
        }),
        method: 'POST',
        headers: { Authorization: 'Bearer fixture-admin-token' },
      })
    );
    expect(response.status).toBe(503);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
    expect(await response.json()).toMatchObject({ status: 'unknown' });
  });

  it.each(unsafeCookieHeaders)(
    'rejects unsafe cookie mutation headers before storage: %j',
    async (headers) => {
      mocks.commit.mockResolvedValue({
        operationId: '33333333-3333-4333-8333-333333333333',
        status: 'unknown',
      });
      const response = await POST(
        new Request('https://infra.tuturuuu.com/flags', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            environment: 'production',
            expectedRevision: 0,
            flagKey: 'mobile_offline',
            operationId: '33333333-3333-4333-8333-333333333333',
            overrideEnabled: true,
          }),
        })
      );
      expect(response.status).toBe(403);
      expect(mocks.commit).not.toHaveBeenCalled();
    }
  );

  it('accepts an authenticated same-origin cookie mutation with its action header', async () => {
    mocks.commit.mockResolvedValue({
      operationId: '33333333-3333-4333-8333-333333333333',
      status: 'unknown',
    });
    const response = await POST(
      new Request('https://infra.tuturuuu.com/flags', {
        method: 'POST',
        headers: {
          origin: 'https://infra.tuturuuu.com',
          'x-tuturuuu-feature-flag-action': '1',
          'sec-fetch-site': 'same-origin',
        },
        body: JSON.stringify({
          environment: 'production',
          expectedRevision: 0,
          flagKey: 'mobile_offline',
          operationId: '33333333-3333-4333-8333-333333333333',
          overrideEnabled: true,
        }),
      })
    );
    expect(response.status).toBe(503);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
  });

  it('does not answer a storage failure with fabricated overrides', async () => {
    mocks.readState.mockResolvedValue({ status: 'unavailable' });
    const response = await GET(new Request('http://localhost/flags'));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'storage_unavailable' });
  });
});
