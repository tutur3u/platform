import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { GET } from './route';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

vi.mock('@/app/[locale]/(auth)/login/login-view.server', () => ({
  resolveLoginView: async () => ({
    hasSession: true,
    providerHint: null,
    returnApp: null,
    savedAccounts: [],
    session: { avatarUrl: null, name: 'Person' },
  }),
}));

describe('GET /api/v1/auth/login-view', () => {
  it('is private and never stored by a browser or CDN', async () => {
    const response = await GET(
      new NextRequest('https://tuturuuu.com/api/v1/auth/login-view')
    );

    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('cdn-cache-control')).toBe('no-store');
    expect(response.headers.get('vercel-cdn-cache-control')).toBe('no-store');
    expect(response.headers.get('vary')).toContain('Cookie');
    await expect(response.json()).resolves.toMatchObject({ hasSession: true });
  });
});
