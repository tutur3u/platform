'use client';

import { useRouter } from '@tanstack/react-router';
import { formatUrl } from 'next/dist/shared/lib/router/utils/format-url';
import type { LinkProps } from 'next/link';
import { type AnchorHTMLAttributes, forwardRef } from 'react';
import { withAppBase } from '../start/base-path';
import { useIntentPreload } from './use-intent-preload';

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: LinkProps['href'];
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean | null;
  locale?: string | false;
};

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
  const intentHandlers = useIntentPreload(
    path,
    prefetch !== false &&
      router.options.defaultPreload === 'intent' &&
      props.download === undefined &&
      (!props.target || props.target === '_self') &&
      path.startsWith('/') &&
      !path.startsWith('//'),
    { onBlur, onFocus, onMouseEnter, onMouseLeave, onTouchStart }
  );
  return (
    <a
      {...props}
      ref={ref}
      href={path}
      {...intentHandlers}
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
