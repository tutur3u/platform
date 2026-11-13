import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  intl: vi.fn(),
}));

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: mocks.guard,
}));
vi.mock('next-intl/middleware', () => ({ default: () => mocks.intl }));
vi.mock('./i18n/routing', () => ({ routing: {} }));

const { proxy } = await import('./proxy');

describe('marketing proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.intl.mockReturnValue(NextResponse.next());
  });

  it('runs /api requests through the shared API guard', async () => {
    mocks.guard.mockResolvedValue(null);
    const response = await proxy(new NextRequest('https://x.test/api/v1/x'));
    expect(mocks.guard).toHaveBeenCalledWith(expect.any(NextRequest), {
      prefixBase: 'proxy:marketing:api',
    });
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.intl).not.toHaveBeenCalled();
  });

  it('returns the guard rejection', async () => {
    mocks.guard.mockResolvedValue(
      NextResponse.json({ error: 'too large' }, { status: 413 })
    );
    const response = await proxy(new NextRequest('https://x.test/api/v1/x'));
    expect(response.status).toBe(413);
  });

  it('never guards or reads sessions on pages', async () => {
    await proxy(new NextRequest('https://x.test/en/about'));
    expect(mocks.guard).not.toHaveBeenCalled();
    expect(mocks.intl).toHaveBeenCalledOnce();
  });
});
