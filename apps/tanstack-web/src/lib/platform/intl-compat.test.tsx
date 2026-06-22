import { useTranslations } from 'next-intl';
import { renderToString } from 'react-dom/server';
import { IntlProvider } from 'use-intl';
import { describe, expect, it } from 'vitest';

/**
 * Runtime proof that the SHARED `@tuturuuu/ui` components — which import
 * `useTranslations` from `next-intl` — render correctly under the
 * `use-intl` `IntlProvider` mounted by the `$locale` layout route.
 *
 * next-intl is built on use-intl and re-exports the same hook / context, so a
 * use-intl provider feeds next-intl's `useTranslations`. This test renders that
 * combination via SSR (`renderToString`, the TanStack Start scenario) to prove
 * the cross-package context sharing works without any Next.js runtime — the
 * supported way to run these hooks under TanStack Start.
 */
function NextIntlProbe() {
  const t = useTranslations('probe');
  return <span>{t('label')}</span>;
}

describe('next-intl ↔ use-intl provider compatibility (TanStack Start SSR)', () => {
  it('next-intl useTranslations reads the use-intl IntlProvider context', () => {
    const html = renderToString(
      <IntlProvider
        locale="en"
        messages={{ probe: { label: 'Loaded via use-intl' } }}
        timeZone="UTC"
      >
        <NextIntlProbe />
      </IntlProvider>
    );

    expect(html).toContain('Loaded via use-intl');
  });

  it('resolves Vietnamese messages through the same provider', () => {
    const html = renderToString(
      <IntlProvider
        locale="vi"
        messages={{ probe: { label: 'Tải bằng use-intl' } }}
        timeZone="UTC"
      >
        <NextIntlProbe />
      </IntlProvider>
    );

    expect(html).toContain('Tải bằng use-intl');
  });
});
