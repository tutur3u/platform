'use client';

import { useRouter } from '@tanstack/react-router';
import { formatUrl } from 'next/dist/shared/lib/router/utils/format-url';
import type { LinkProps } from 'next/link';
import {
  type AnchorHTMLAttributes,
  forwardRef,
  useEffect,
  useRef,
} from 'react';
import { withAppBase } from '../start/base-path';

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: LinkProps['href'];
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean | null;
  locale?: string | false;
};

/** Matches TanStack Router's default `preloadDelay` for intent preloading. */
const INTENT_PRELOAD_DELAY_MS = 50;

/**
 * `next/link` on the TanStack router: same-app clicks navigate client-side,
 * and when the app's router opts into `defaultPreload: 'intent'` a hover,
 * focus or touch preloads the destination's loader, like TanStack `<Link>`.
 */
export default forwardRef<HTMLAnchorElement, Props>(function BridgeLink(
  {
    href,
    replace,
    scroll,
    prefetch,
    locale: _locale,
    onBlur,
    onClick,
    onFocus,
    onMouseEnter,
    onMouseLeave,
    onTouchStart,
    ...props
  },
  ref
) {
  const router = useRouter();
  const path = withAppBase(typeof href === 'string' ? href : formatUrl(href));
  const preloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canPreload =
    prefetch !== false &&
    router.options.defaultPreload === 'intent' &&
    props.download === undefined &&
    (!props.target || props.target === '_self') &&
    path.startsWith('/') &&
    !path.startsWith('//');
  const cancelPreload = () => {
    if (preloadTimer.current) clearTimeout(preloadTimer.current);
    preloadTimer.current = null;
  };
  const preload = () => {
    cancelPreload();
    if (!canPreload) return;
    // `href` carries the app base, which the router strips through its
    // rewrite exactly as for `navigate`; the preload types only name `to`.
    // A failed or redirecting preload leaves the click to navigate normally.
    void router
      .preloadRoute({ href: path } as unknown as Parameters<
        typeof router.preloadRoute
      >[0])
      .catch(() => {});
  };
  const schedulePreload = () => {
    cancelPreload();
    if (canPreload)
      preloadTimer.current = setTimeout(preload, INTENT_PRELOAD_DELAY_MS);
  };
  useEffect(() => cancelPreload, []);
  return (
    <a
      {...props}
      ref={ref}
      href={path}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        schedulePreload();
      }}
      onMouseLeave={(event) => {
        onMouseLeave?.(event);
        cancelPreload();
      }}
      onFocus={(event) => {
        onFocus?.(event);
        schedulePreload();
      }}
      onBlur={(event) => {
        onBlur?.(event);
        cancelPreload();
      }}
      onTouchStart={(event) => {
        onTouchStart?.(event);
        preload();
      }}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          props.download !== undefined ||
          (props.target && props.target !== '_self') ||
          !path.startsWith('/') ||
          path.startsWith('//')
        )
          return;
        event.preventDefault();
        void router.navigate({
          href: path,
          replace,
          resetScroll: scroll !== false,
        });
      }}
    />
  );
});
