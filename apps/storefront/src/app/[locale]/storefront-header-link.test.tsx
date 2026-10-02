import { NextIntlClientProvider } from 'next-intl';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorefrontHeaderLink } from './storefront-header-link';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
  usePathname: () => '/login',
  useRouter: () => ({ prefetch: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await act(() => root.unmount());
  document.body.replaceChildren();
});

describe('Storefront header client link composition', () => {
  for (const locale of ['en', 'vi']) {
    it(`renders and updates the actual outline Button and locale Link in ${locale}`, async () => {
      const host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host);
      roots.push(root);
      await act(() => {
        root.render(
          <NextIntlClientProvider locale={locale} messages={{}}>
            <StorefrontHeaderLink href="/login">Sign in</StorefrontHeaderLink>
          </NextIntlClientProvider>
        );
      });
      const anchor = host.querySelector('a');
      expect(anchor?.textContent).toBe('Sign in');
      // Storefront routing deliberately uses localePrefix: 'never'.
      expect(anchor?.getAttribute('href')).toBe('/login');
      expect(anchor?.getAttribute('data-slot')).toBe('button');
      expect(anchor?.className).toContain('border-input');
      expect(host.querySelector('button')).toBeNull();

      await act(() => {
        root.render(
          <NextIntlClientProvider locale={locale} messages={{}}>
            <StorefrontHeaderLink href="/sample-store/orders">
              <svg aria-hidden="true" />
              Order history
            </StorefrontHeaderLink>
          </NextIntlClientProvider>
        );
      });
      expect(host.querySelectorAll('a')).toHaveLength(1);
      expect(host.querySelector('a')?.textContent).toBe('Order history');
      expect(host.querySelector('a svg')).not.toBeNull();
      expect(host.querySelector('a')?.getAttribute('href')).toBe(
        '/sample-store/orders'
      );
      expect(host.querySelector('a')?.getAttribute('data-slot')).toBe('button');
      expect(host.querySelector('a')?.className).toContain('border-input');
      expect(host.querySelector('button')).toBeNull();
    });
  }
});
