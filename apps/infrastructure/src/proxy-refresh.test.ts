import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  definePageAdapterTests,
  pageAdapterMocks,
} from '../../../packages/auth/src/proxy/page-adapter-test-fixture';

vi.mock('next-intl/middleware', () => ({
  default: () => pageAdapterMocks.continuation,
}));
vi.mock('next-intl/navigation', () => ({
  createNavigation: () => ({}),
}));

import { proxy } from './proxy';

definePageAdapterTests({ proxy, targetApp: 'infra' });

describe('build-info refresh isolation', () => {
  beforeEach(() => {
    pageAdapterMocks.refresh.mockReset().mockResolvedValue({
      ok: false,
      error: 'App session refresh unavailable',
    });
  });
  afterEach(() => vi.clearAllMocks());

  it.each(['GET', 'HEAD'])(
    'continues %s without refreshing or expiring provider cookies',
    async (method) => {
      const request = new NextRequest(
        'https://infrastructure.tuturuuu.com/api/build-info',
        {
          method,
          headers: { cookie: 'sb-project-auth-token=synthetic-session' },
        }
      );
      const response = await proxy(request);
      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(request.headers.get('cookie')).toContain('synthetic-session');
      expect(pageAdapterMocks.refresh).not.toHaveBeenCalled();
    }
  );
});

describe('Admin apex session isolation', () => {
  beforeEach(() => {
    pageAdapterMocks.refresh.mockReset().mockResolvedValue({
      ok: false,
      error: 'Shared session unavailable',
    });
    pageAdapterMocks.continuation
      .mockReset()
      .mockImplementation(() => NextResponse.next());
  });

  it('uses the provider-only resolver for pages and does not expire central cookies', async () => {
    const request = new NextRequest('https://tuturuuu.com/admin/root', {
      nextConfig: { basePath: '/admin' },
      headers: { cookie: 'sb-project-auth-token=synthetic-session' },
    });
    const response = await proxy(request);
    expect(pageAdapterMocks.refresh).toHaveBeenCalledWith(request, {
      requireWebAppSession: false,
      sessionMode: 'supabase-only',
      targetApp: 'infra',
    });
    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/admin/login?next=%2Froot'
    );
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('keeps the legacy app on its existing session resolver', async () => {
    const request = new NextRequest('https://infrastructure.tuturuuu.com/root');
    await proxy(request);
    expect(pageAdapterMocks.refresh).toHaveBeenCalledWith(request, {
      requireWebAppSession: true,
      sessionMode: 'supabase-first',
      targetApp: 'infra',
    });
  });
});
