'use client';

import type { ComponentProps } from 'react';
import { useLocale } from 'use-intl';
import Link from '../next/link';
import {
  redirect as rawRedirect,
  usePathname as useRawPathname,
  useRouter as useRawRouter,
} from '../next/navigation';

/**
 * `@tuturuuu/satellite/i18n` navigation for bridged apps: English is the
 * unprefixed default, Vietnamese is served under `/vi`.
 */
export const defaultLocale = 'en';
export const supportedLocales = ['en', 'vi'] as const;
export type Locale = (typeof supportedLocales)[number];
export const routing = { locales: supportedLocales, defaultLocale };

export function localize(href: string, locale: string) {
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  const path = href.replace(/^\/(?:en|vi)(?=\/|$)/u, '') || '/';
  return locale === 'vi' ? `/vi${path === '/' ? '' : path}` : path;
}

export function LocalizedLink({
  href,
  locale,
  ...props
}: ComponentProps<typeof Link>) {
  const currentLocale = useLocale();
  return (
    <Link
      {...props}
      href={
        typeof href === 'string'
          ? localize(href, typeof locale === 'string' ? locale : currentLocale)
          : href
      }
    />
  );
}

export { LocalizedLink as Link };
export function usePathname() {
  return useRawPathname().replace(/^\/(?:en|vi)(?=\/|$)/u, '') || '/';
}
export function useRouter() {
  const router = useRawRouter();
  const locale = useLocale();
  return {
    ...router,
    push: (href: string, options?: { locale?: string; scroll?: boolean }) =>
      router.push(localize(href, options?.locale ?? locale), options),
    replace: (href: string, options?: { locale?: string; scroll?: boolean }) =>
      router.replace(localize(href, options?.locale ?? locale), options),
  };
}
export function redirect({
  href,
  locale,
}: {
  href: string;
  locale: string;
}): never {
  return rawRedirect(localize(href, locale));
}
