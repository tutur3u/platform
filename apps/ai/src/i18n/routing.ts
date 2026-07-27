import { defineRouting } from 'next-intl/routing';

export const supportedLocales = ['en', 'vi'] as const;
export type Locale = (typeof supportedLocales)[number];

export const routing = defineRouting({
  locales: supportedLocales,
  defaultLocale: 'en',
  localePrefix: 'never',
});
