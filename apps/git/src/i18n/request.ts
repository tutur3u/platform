import { resolveRequestLocale } from '@tuturuuu/utils/i18n-root-locale';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(
  async ({ locale: localeOverride, requestLocale }) => {
    const locale = resolveRequestLocale(
      routing.locales,
      localeOverride ?? (await requestLocale),
      routing.defaultLocale
    );

    return {
      locale,
      messages: (await import(`../../messages/${locale}.json`)).default,
      onError(error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(error.message);
        }
      },
      getMessageFallback({ key }) {
        return key;
      },
    };
  }
);
