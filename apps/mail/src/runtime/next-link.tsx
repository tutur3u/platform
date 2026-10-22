'use client';

import { useRouter } from '@tanstack/react-router';
import { formatUrl } from 'next/dist/shared/lib/router/utils/format-url';
import type { LinkProps } from 'next/link';
import { type AnchorHTMLAttributes, forwardRef } from 'react';

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: LinkProps['href'];
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean | null;
  locale?: string | false;
};

export default forwardRef<HTMLAnchorElement, Props>(function MailLink(
  {
    href,
    replace,
    scroll,
    prefetch: _prefetch,
    locale: _locale,
    onClick,
    ...props
  },
  ref
) {
  const router = useRouter();
  const path = typeof href === 'string' ? href : formatUrl(href);
  return (
    <a
      {...props}
      ref={ref}
      href={path}
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
