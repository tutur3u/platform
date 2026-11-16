import { defineRouting } from 'next-intl/routing';
import { BASE_URL } from '@/constants/common';

export const defaultLocale = 'en' as const;
export const supportedLocales = ['en', 'vi'] as const;
export type Locale = (typeof supportedLocales)[number];

export const routing = defineRouting({
  defaultLocale,
  localePrefix: 'never',
  locales: supportedLocales,
  localeCookie:
    new URL(BASE_URL).pathname.replace(/\/+$/u, '') === '/mind'
      ? { name: 'mind_locale', path: '/mind', secure: true }
      : undefined,
});
