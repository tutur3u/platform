import { createNavigation } from 'next-intl/navigation';
import { defineRouting } from 'next-intl/routing';

export const defaultLocale = 'en' as const;
export const supportedLocales = ['en', 'vi'] as const;
export type Locale = (typeof supportedLocales)[number];

export const routing = defineRouting({
  // A list of all locales that are supported
  locales: supportedLocales,
  // Used when no locale matches
  defaultLocale,
});

// Lightweight wrappers around Next.js' navigation APIs
// that will consider the routing configuration
export const { Link, redirect, usePathname, useRouter } =
  createNavigation(routing);
