import { NextIntlClientProvider } from 'next-intl';
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
      const button = container.querySelector('button.min-w-10')!;
      expect(button.textContent).toContain(
        locale === 'en' ? 'switch to' : 'chuyển sang'
      );
      expect(button.textContent).not.toContain('common.switch_language_to');
    });
  }
}
