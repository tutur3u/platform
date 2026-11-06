import { isRedirect } from '@tanstack/router-core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { withBridgeRequest } from '../server/request-context';
import { createNavigation } from './intl-navigation';

vi.mock('../next/link', () => ({
  default: ({ href }: { href: string }) => <a href={href}>Open QR</a>,
}));

describe('RSC next-intl/navigation', () => {
  const nav = createNavigation({
    locales: ['en', 'vi'] as const,
    defaultLocale: 'en',
    localePrefix: 'as-needed',
  });

  it('localizes Link with the request locale on the server', async () => {
    const element = await withBridgeRequest(
      {
        request: new Request('https://x.test/vi/qr'),
        rootParams: { locale: 'vi' },
      },
      () => nav.Link({ href: '/qr' })
    );
    expect(renderToStaticMarkup(element)).toBe('<a href="/vi/qr">Open QR</a>');
  });

  it('redirects through Start and keeps hooks client-only', () => {
    let thrown: unknown;
    try {
      nav.redirect({ href: '/x', locale: 'vi' });
    } catch (error) {
      thrown = error;
    }
    expect(isRedirect(thrown)).toBe(true);
    expect(() => nav.usePathname()).toThrow(/client hook/u);
  });
});
