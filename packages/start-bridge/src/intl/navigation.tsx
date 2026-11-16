'use client';

import { type ComponentProps, forwardRef } from 'react';
import { useLocale } from 'use-intl';
import { runtimeAppBase } from '../core/app-url';
import Link from '../next/link';
import {
  permanentRedirect as rawPermanentRedirect,
  redirect as rawRedirect,
  usePathname as useRawPathname,
  useRouter as useRawRouter,
} from '../next/navigation';
import { createLocalizedPaths, type Href } from './localized-path';
import { localeCookieAssignment } from './locale-cookie';
import type { BridgeRouting } from './routing';

/**
 * The `NEXT_LOCALE` write for a locale switch. On a mount (`/hive`) it is
 * scoped to the base, so a mounted app never changes the apex (Web) locale
 * cookie; at a host root it keeps `path=/`.
 */
export function localeCookieString(locale: string, basePath: string) {
  const path = basePath || '/';
  return `NEXT_LOCALE=${encodeURIComponent(locale)}; path=${path}; max-age=31536000; samesite=lax${basePath ? '; secure' : ''}`;
}

/**
 * `next-intl/navigation` `createNavigation(routing)` on the bridge's
 * `next/navigation` and `next/link`. Honours `localePrefix`: `never` keeps
 * paths unprefixed and switches locale through the `NEXT_LOCALE` cookie;
 * `as-needed` prefixes non-default locales; `always` prefixes every locale.
 */
export function createNavigation<const Locales extends readonly string[]>(
  routing: BridgeRouting<Locales>
) {
  const { mode, strip, getPathname } = createLocalizedPaths(routing);

  function rememberLocale(locale: string | undefined, current: string) {
    if (mode !== 'never' || !locale || locale === current) return;
    if (typeof document === 'undefined') return;
    // An app-configured locale cookie (Mind) owns its own name and scope;
    // otherwise NEXT_LOCALE follows the runtime mount base.
    const cookie =
      routing.localeCookie === undefined
        ? localeCookieString(locale, runtimeAppBase())
        : localeCookieAssignment(routing.localeCookie, locale);
    if (cookie !== null) document.cookie = cookie;
  }

  const LocalizedLink = forwardRef<
    HTMLAnchorElement,
    Omit<ComponentProps<typeof Link>, 'href' | 'locale'> & {
      href: Href;
      locale?: string;
    }
  >(function LocalizedLink({ href, locale, onClick, ...props }, ref) {
    const current = useLocale();
    return (
      <Link
        {...props}
        ref={ref}
        href={getPathname({ href, locale: locale ?? current })}
        onClick={(event) => {
          rememberLocale(locale, current);
          onClick?.(event);
        }}
      />
    );
  });

  function usePathname() {
    return strip(useRawPathname());
  }

  function useRouter() {
    const router = useRawRouter();
    const current = useLocale();
    const go =
      (method: 'push' | 'replace') =>
      (href: Href, options?: { locale?: string; scroll?: boolean }) => {
        rememberLocale(options?.locale, current);
        router[method](
          getPathname({ href, locale: options?.locale ?? current }),
          options
        );
      };
    return {
      ...router,
      push: go('push'),
      replace: go('replace'),
      prefetch: (href: Href, options?: { locale?: string }) =>
        router.prefetch(
          getPathname({ href, locale: options?.locale ?? current })
        ),
    };
  }

  function redirect(args: { href: Href; locale: string }): never {
    return rawRedirect(getPathname(args));
  }
  function permanentRedirect(args: { href: Href; locale: string }): never {
    return rawPermanentRedirect(getPathname(args));
  }

  return {
    Link: LocalizedLink,
    getPathname,
    permanentRedirect,
    redirect,
    usePathname,
    useRouter,
  };
}
