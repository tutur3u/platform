import { resolveRootLocale } from '@tuturuuu/utils/i18n-root-locale';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ locale: localeOverride }) => {
  const locale = await resolveRootLocale(routing.locales, localeOverride);

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
