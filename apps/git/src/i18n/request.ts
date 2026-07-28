import { getRequestConfig } from 'next-intl/server';
import { type Locale, routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as Locale)) {
    locale = routing.defaultLocale;
  }

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
});
