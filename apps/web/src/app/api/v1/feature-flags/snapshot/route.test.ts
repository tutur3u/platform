import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const load = vi.hoisted(() => vi.fn());
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('@/lib/feature-flags/server', () => ({
  loadPlatformFeatureFlagSnapshot: load,
}));

const url = 'https://example.test/api/v1/feature-flags/snapshot';
const testToken = 'synthetic-snapshot-credential';
const snapshot = {
  environment: 'production',
  version: '0123456789abcdef0123456789abcdef',
  rules: [
    {
      flagKey: 'MEET_UX_V2',
      scope: 'platform',
      subjectId: null,
      mode: 'off',
      revision: 1,
    },
  ],
};

function request(headers?: HeadersInit, query = 'environment=production') {
  return new Request(`${url}?${query}`, { headers });
}

beforeEach(() => {
  vi.stubEnv('FEATURE_FLAGS_SNAPSHOT_TOKEN', testToken);
  load.mockReset().mockResolvedValue({ status: 'ready', snapshot });
});
afterEach(() => vi.unstubAllEnvs());

describe('platform snapshot endpoint', () => {
  it('requires the matching bearer credential before reading the database', async () => {
    expect((await GET(request())).status).toBe(401);
    expect(
      (await GET(request({ Authorization: 'Bearer invalid' }))).status
    ).toBe(401);
    vi.stubEnv('FEATURE_FLAGS_SNAPSHOT_TOKEN', undefined);
    const unavailable = await GET(
      request({ Authorization: `Bearer ${testToken}` })
    );
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await unavailable.text()).not.toContain(testToken);
    expect(load).not.toHaveBeenCalled();
  });

  it('serves the platform snapshot with a strong validator and returns a bodyless 304', async () => {
    const authorization = { Authorization: `Bearer ${testToken}` };
    const response = await GET(request(authorization));
    const etag = response.headers.get('ETag');
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
    expect(await response.json()).toEqual(snapshot);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Vary')).toBe('Authorization');

    const conditional = request({
      ...authorization,
      'If-None-Match': `"old", W/${etag}`,
    });
    const unchanged = await GET(conditional);
    expect(unchanged.status).toBe(304);
    expect(unchanged.headers.get('ETag')).toBe(etag);
    expect(await unchanged.text()).toBe('');
    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledWith('production');

    load.mockResolvedValue({
      status: 'ready',
      snapshot: { ...snapshot, rules: [] },
    });
    const updated = await GET(conditional);
    expect(updated.status).toBe(200);
    expect(updated.headers.get('ETag')).not.toBe(etag);
  });

  it('validates the environment and fails closed on unavailable snapshots', async () => {
    const authorization = { Authorization: `Bearer ${testToken}` };
    expect(
      (await GET(request(authorization, 'environment=staging'))).status
    ).toBe(400);
    expect(
      (
        await GET(
          request(
            authorization,
            'environment=production&environment=development'
          )
        )
      ).status
    ).toBe(400);
    expect(load).not.toHaveBeenCalled();
    load.mockResolvedValue({ status: 'invalid' });
    expect(
      (await GET(request(authorization, 'environment=development'))).status
    ).toBe(503);
    expect(load).toHaveBeenCalledExactlyOnceWith('development');
  });
});
