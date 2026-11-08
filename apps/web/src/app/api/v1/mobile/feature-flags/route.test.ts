// @vitest-environment node
import { createHash } from 'node:crypto';
import { evaluateFlags, registry } from '@tuturuuu/feature-flags';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), membership: vi.fn() }));
vi.mock('@tuturuuu/feature-flags', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/feature-flags')>();
  return { ...actual, evaluateFlags: vi.fn(actual.evaluateFlags) };
});
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
      ttlSeconds: 30,
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
    expect(response.headers.get('cache-control')).toBe('private, no-cache');
    expect(response.headers.get('vary')).toBe('Authorization, Cookie');
    expect(response.headers.get('cdn-cache-control')).toBe('no-store');
    expect(response.headers.get('vercel-cdn-cache-control')).toBe('no-store');
    expect(mocks.membership).not.toHaveBeenCalled();
  });

  it('accepts a workspace member and returns the same defaults', async () => {
    const personal = await GET(request());
    const scoped = await GET(request(`?wsId=${wsId}`));
    expect(scoped.status).toBe(200);
    expect(await scoped.json()).toEqual(await personal.json());
  });

  it('returns 304 when the client echoes the bare body version', async () => {
    const initial = await GET(request());
    const { version } = (await initial.json()) as { version: string };
    const response = await GET(request(`?wsId=${wsId}`, version));
    expect(response.status).toBe(304);
    expect(await response.text()).toBe('');
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
      expect(response.headers.get('vary')).toBe('Authorization, Cookie');
      expect(response.headers.get('cdn-cache-control')).toBe('no-store');
      expect(response.headers.get('vercel-cdn-cache-control')).toBe('no-store');
      expect(mocks.membership).toHaveBeenCalledTimes(1);
    }
  );

  it('derives each evaluation and membership check only from the authenticated session', async () => {
    const query = `?wsId=${wsId}&userId=query-user&user_id=query-user`;
    await GET(request(query));
    expect(evaluateFlags).toHaveBeenLastCalledWith(registry, {
      userId: 'user-1',
      wsId,
    });
    mocks.auth.mockResolvedValue({
      ok: true,
      user: { id: 'user-2' },
      supabase: {},
    });
    await GET(request(query));
    expect(evaluateFlags).toHaveBeenLastCalledWith(registry, {
      userId: 'user-2',
      wsId,
    });
    expect(mocks.membership).toHaveBeenLastCalledWith({
      wsId,
      userId: 'user-2',
      supabase: {},
      requiredType: 'ANY',
    });
    expect(evaluateFlags).toHaveBeenCalledTimes(2);
  });

  it.each([401, 400, 403, 500])(
    'prevents shared caching of %s rejections',
    async (status) => {
      if (status === 401)
        mocks.auth.mockResolvedValue({
          ok: false,
          response: NextResponse.json({ error: 'Unauthorized' }, { status }),
        });
      if (status === 403)
        mocks.membership.mockResolvedValue({
          ok: false,
          error: 'membership_missing',
        });
      if (status === 500)
        mocks.membership.mockResolvedValue({
          ok: false,
          error: 'membership_lookup_failed',
        });
      const response = await GET(
        request(status === 400 ? '?wsId=invalid' : `?wsId=${wsId}`)
      );
      expect(response.status).toBe(status);
      expect(response.headers.get('cache-control')).toBe('private, no-cache');
      expect(response.headers.get('vary')).toBe('Authorization, Cookie');
      expect(response.headers.get('cdn-cache-control')).toBe('no-store');
      expect(response.headers.get('vercel-cdn-cache-control')).toBe('no-store');
    }
  );

  it('returns 200 for a stale validator', async () => {
    expect((await GET(request('', '"old"'))).status).toBe(200);
  });
});
