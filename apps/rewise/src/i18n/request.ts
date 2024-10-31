import { routing } from './routing';
import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async ({ requestLocale }) => {
  // This typically corresponds to the `[locale]` segment
  let locale = await requestLocale;

  // Ensure that a valid locale is used
  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
}) as any;
//?    ^ `as any` is needed here to avoid the TypeScript error: The inferred type of 'getConfig' cannot be named
//? without a reference to '../node_modules/next-intl/dist/types/src/server/react-server/getRequestConfig'. This
//? is likely not portable. A type annotation is necessary.
