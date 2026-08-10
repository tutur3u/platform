import { resolveRootLocale } from '@tuturuuu/utils/i18n-root-locale';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(
  async ({ locale: localeOverride, requestLocale }) => {
    const locale = await resolveRootLocale(
      routing.locales,
      localeOverride ?? (await requestLocale)
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
