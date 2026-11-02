// @vitest-environment node
import { createHash } from 'node:crypto';
import { registry } from '@tuturuuu/feature-flags';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), membership: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({ resolveSessionAuthContext: mocks.auth }));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.membership,
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn().mockResolvedValue(undefined),
}));

const wsId = '11111111-1111-4111-8111-111111111111';
function request(query = '', etag?: string) {
  return new NextRequest(
    `http://localhost/api/v1/mobile/feature-flags${query}`,
    {
      headers: etag ? { 'If-None-Match': etag } : {},
    }
  );
}

describe('GET mobile feature flags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({
      ok: true,
      user: { id: 'user-1' },
      supabase: {},
    });
    mocks.membership.mockResolvedValue({ ok: true, membershipType: 'MEMBER' });
  });

  it('rejects unauthenticated requests before evaluating validators', async () => {
    mocks.auth.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });
    expect((await GET(request('', '*'))).status).toBe(401);
    expect(mocks.auth).toHaveBeenCalledWith(expect.any(NextRequest), {
      allowAppSessionAuth: true,
    });
    expect(mocks.membership).not.toHaveBeenCalled();
  });

  it('rejects a non-member even with a matching wildcard validator', async () => {
    mocks.membership.mockResolvedValue({
      ok: false,
      error: 'membership_missing',
    });
    expect((await GET(request(`?wsId=${wsId}`, '*'))).status).toBe(403);
    expect(mocks.membership).toHaveBeenCalledWith({
      wsId,
      userId: 'user-1',
      supabase: {},
      requiredType: 'ANY',
    });
  });

  it.each(['not-a-uuid', ''])(
    'rejects invalid workspace ID %j',
    async (value) => {
      expect((await GET(request(`?wsId=${value}`))).status).toBe(400);
      expect(mocks.membership).not.toHaveBeenCalled();
    }
  );

  it('fails closed on a membership lookup error', async () => {
    mocks.membership.mockResolvedValue({
      ok: false,
      error: 'membership_lookup_failed',
    });
    expect((await GET(request(`?wsId=${wsId}`, '*'))).status).toBe(500);
  });

  it('returns the complete default payload and its stable hash without workspace context', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      version: expect.stringMatching(/^[a-f0-9]{64}$/),
      ttlSeconds: 300,
      flags: Object.fromEntries(registry.map(({ key }) => [key, false])),
    });
    expect(body.version).toBe(
      createHash('sha256')
        .update(
          JSON.stringify({ ttlSeconds: body.ttlSeconds, flags: body.flags })
        )
        .digest('hex')
    );
    expect(response.headers.get('etag')).toBe(`"${body.version}"`);
    expect(response.headers.get('cache-control')).toBe(
      'private, max-age=0, must-revalidate'
    );
    expect(response.headers.get('vary')).toBe('Authorization, Cookie');
    expect(mocks.membership).not.toHaveBeenCalled();
  });

  it('accepts a workspace member and returns the same defaults', async () => {
    const personal = await GET(request());
    const scoped = await GET(request(`?wsId=${wsId}`));
    expect(scoped.status).toBe(200);
    expect(await scoped.json()).toEqual(await personal.json());
  });

  it.each(['exact', 'weak', 'list', 'wildcard'])(
    'returns a bodyless 304 for a matching %s validator',
    async (kind) => {
      const initial = await GET(request());
      const etag = initial.headers.get('etag') ?? '';
      const validator =
        kind === 'weak'
          ? `W/${etag}`
          : kind === 'list'
            ? `"old", ${etag}`
            : kind === 'wildcard'
              ? '*'
              : etag;
      const response = await GET(request(`?wsId=${wsId}`, validator));
      expect(response.status).toBe(304);
      expect(await response.text()).toBe('');
      expect(response.headers.get('etag')).toBe(etag);
      expect(response.headers.get('cache-control')).toBe(
        initial.headers.get('cache-control')
      );
      expect(mocks.membership).toHaveBeenCalledTimes(1);
    }
  );

  it('returns 200 for a stale validator', async () => {
    expect((await GET(request('', '"old"'))).status).toBe(200);
  });
});
