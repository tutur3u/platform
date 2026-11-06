'use client';

import type { ComponentProps } from 'react';
import { useLocale } from 'use-intl';
import Link from '../next/link';
import {
  redirect as rawRedirect,
  usePathname as useRawPathname,
  useRouter as useRawRouter,
} from '../next/navigation';

import { localize } from './satellite-locales';

// Client-only navigation for `@tuturuuu/satellite/i18n`. Locale data lives in
// `satellite-locales`; bridged apps import through `satellite-i18n`.
export {
  defaultLocale,
  type Locale,
  localize,
  routing,
  supportedLocales,
} from './satellite-locales';

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
