import { NextIntlClientProvider } from 'next-intl';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import en from '../../../messages/en.json';
import vietnamese from '../../../messages/vi.json';
import { getClientMessages } from '@/i18n/client-messages';
import { marketingMessagePaths } from '@/lib/marketing-render-context';
import { MarketingControls } from './marketing-controls';

vi.mock('@/i18n/routing', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace: vi.fn() }),
}));

for (const [locale, catalog] of [
  ['en', en],
  ['vi', vietnamese],
] as const) {
  for (const suffix of ['', '/contact']) {
    it(`delivers every controls translation through the real catalog filter (${locale}${suffix})`, () => {
      const errors: unknown[] = [];
      const messages = getClientMessages(
        catalog,
        marketingMessagePaths(`/${locale}${suffix}`)
      );
      const html = renderToStaticMarkup(
        <NextIntlClientProvider
          locale={locale}
          messages={messages}
          timeZone="UTC"
          onError={(error) => errors.push(error)}
        >
          <MarketingControls />
        </NextIntlClientProvider>
      );
      expect(errors).toEqual([]);
      const container = document.createElement('div');
      container.innerHTML = html;
      const button = container.querySelector('button[aria-expanded]')!;
      expect(button.textContent).toContain(
        locale === 'en' ? 'Language, Theme' : 'Ngôn ngữ, Giao diện'
      );
      expect(button.textContent).not.toContain('common.');

      // Open the language and theme panel on the client: every option label
      // comes through the same filtered catalog.
      vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
      const host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host);
      act(() =>
        root.render(
          <NextIntlClientProvider
            locale={locale}
            messages={messages}
            timeZone="UTC"
            onError={(error) => errors.push(error)}
          >
            <MarketingControls />
          </NextIntlClientProvider>
        )
      );
      act(() =>
        (
          host.querySelector('button[aria-expanded]') as HTMLButtonElement
        ).click()
      );
      const panel = host.querySelector('[role="group"]')!;
      expect(panel.textContent).toContain(
        locale === 'en'
          ? 'LanguageEnglishTiếng ViệtThemeLightDarkSystem'
          : 'Ngôn ngữEnglishTiếng ViệtGiao diệnSángTốiHệ thống'
      );
      expect(errors).toEqual([]);
      act(() => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    });
  }
}
