'use client';

/**
 * `next/link` -> TanStack Router compatibility shim.
 *
 * 51 shared `@tuturuuu/ui` files import the default `Link` from `next/link`.
 * Without Next's router, next/link still renders an `<a>` but its client-side
 * navigation does a full page reload. Wiring this module as a Vite
 * `resolve.alias` for `next/link` (see the app-shell proposal) makes those
 * links do real SPA navigation through the TanStack Router instead, while
 * keeping the rendered `<a href>` identical (so SSR/prerender output and SEO are
 * unchanged).
 *
 * Behaviour mirrors next/link: render `<a href>` with all passthrough props;
 * intercept plain left-clicks on internal hrefs and route via
 * `router.navigate({ href, replace })`; let modified clicks (cmd/ctrl/shift/
 * alt/middle), `target="_blank"`, external/protocol hrefs, and
 * default-prevented events fall through to native behaviour. The interception
 * decision is factored into the pure `shouldInterceptNavigation` /
 * `isExternalHref` helpers for unit testing.
 */

import { useRouter } from '@tanstack/react-router';
import {
  type AnchorHTMLAttributes,
  forwardRef,
  type MouseEvent,
  type ReactNode,
} from 'react';

type NextHref = string | { pathname?: string; query?: unknown; hash?: string };

export interface NextLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  children?: ReactNode;
  href: NextHref;
  // next/link-only props we accept and ignore (no TanStack equivalent needed):
  legacyBehavior?: boolean;
  locale?: string | false;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
  shallow?: boolean;
}

/** Coerce next/link's string-or-object href into a plain href string. */
export function resolveHref(href: NextHref): string {
  if (typeof href === 'string') {
    return href;
  }
  const pathname = href.pathname ?? '';
  const hash = href.hash ? `#${href.hash.replace(/^#/u, '')}` : '';
  return `${pathname}${hash}`;
}

/** True for hrefs that must use native navigation (external origin or scheme). */
export function isExternalHref(href: string): boolean {
  if (!href) {
    return true;
  }
  // Protocol-relative (//host) or any scheme (https:, mailto:, tel:, etc.).
  return /^[a-z][a-z0-9+.-]*:/iu.test(href) || href.startsWith('//');
}

/**
 * Pure decision for whether a click should be intercepted for SPA navigation.
 * Mirrors next/link's guard set.
 */
export function shouldInterceptNavigation(args: {
  defaultPrevented: boolean;
  href: string;
  target?: string;
  modifierKey: boolean;
  primaryButton: boolean;
}): boolean {
  if (args.defaultPrevented) {
    return false;
  }
  if (!args.primaryButton || args.modifierKey) {
    return false;
  }
  if (args.target && args.target !== '_self') {
    return false;
  }
  return !isExternalHref(args.href);
}

export const Link = forwardRef<HTMLAnchorElement, NextLinkProps>(
  function Link(props, ref) {
    const router = useRouter();
    const {
      children,
      href,
      legacyBehavior: _legacyBehavior,
      locale: _locale,
      onClick,
      prefetch: _prefetch,
      replace,
      scroll: _scroll,
      shallow: _shallow,
      target,
      ...rest
    } = props;

    const hrefStr = resolveHref(href);

    const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);

      const intercept = shouldInterceptNavigation({
        defaultPrevented: event.defaultPrevented,
        href: hrefStr,
        modifierKey:
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey,
        primaryButton: event.button === 0,
        target,
      });

      if (!intercept) {
        return;
      }

      event.preventDefault();
      router.navigate({ href: hrefStr, replace });
    };

    return (
      <a
        {...rest}
        href={hrefStr}
        onClick={handleClick}
        ref={ref}
        target={target}
      >
        {children}
      </a>
    );
  }
);

// next/link is a default export; mirror that for the alias.
export default Link;
