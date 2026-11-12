import { isRedirect, redirect } from '@tanstack/react-router';
import { resolveBridgePage } from '@tuturuuu/start-bridge/start/page-render';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: (href: string) => {
    throw redirect({ href });
  },
}));

describe('Chat home route', () => {
  it('resolves its redirect before starting the RSC stream', async () => {
    const result = await resolveBridgePage({
      href: '/',
      pages: [{ pattern: '/', file: 'home' }],
      modules: { home: { page: () => import('./page'), layouts: [] } },
    }).catch((error: unknown) => error);
    expect(isRedirect(result)).toBe(true);
    expect((result as { options: { href: string } }).options.href).toBe(
      '/personal'
    );
  });
});
