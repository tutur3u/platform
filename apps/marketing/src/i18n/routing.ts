import { createNavigation } from 'next-intl/navigation';
import { defineRouting } from 'next-intl/routing';

export const defaultLocale = 'en' as const;
export const supportedLocales = ['en', 'vi'] as const;
export type Locale = (typeof supportedLocales)[number];

export const routing = defineRouting({
  locales: supportedLocales,
  defaultLocale,
  // Same URL shape as the web app: the default locale has no prefix.
  localePrefix: 'as-needed',
});

export const { Link, redirect, usePathname, useRouter } =
  createNavigation(routing);
