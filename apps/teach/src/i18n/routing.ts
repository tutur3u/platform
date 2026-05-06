import { defineRouting } from 'next-intl/routing';

export const defaultLocale = 'en' as const;
export const supportedLocales = ['en', 'vi'] as const;
export type Locale = (typeof supportedLocales)[number];

export const routing = defineRouting({
  defaultLocale,
  localePrefix: 'as-needed',
  locales: supportedLocales,
});
