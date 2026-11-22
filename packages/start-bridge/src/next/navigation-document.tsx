import {
  useLocation,
  useParams as useStartParams,
  useRouter as useStartRouter,
} from '@tanstack/react-router';
import type { AnchorHTMLAttributes } from 'react';
import { appRelativePathname, withAppBase } from '../start/base-path';

/**
 * `next/navigation` + `next/link` for apps whose navigation is deliberately
 * document-level (full page loads), e.g. a gateway whose links leave the app.
 */
export function usePathname() {
  const routerBasepath = useStartRouter().basepath;
  const pathname = useLocation({ select: (location) => location.pathname });
  return appRelativePathname(pathname, routerBasepath);
}
export function useSearchParams() {
  const search = useLocation({ select: (location) => location.searchStr });
  return new URLSearchParams(search);
}
/** Route params of the matched TanStack route, read without a route id. */
export function useParams() {
  return useStartParams({ strict: false });
}
export function useRouter() {
  const router = useStartRouter();
  return {
    push: (href: string) => {
      window.location.assign(withAppBase(href));
    },
    replace: (href: string) => {
      window.location.replace(withAppBase(href));
    },
    refresh: () => router.invalidate(),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    prefetch: async () => {},
  };
}
export function NativeLink({
  prefetch: _prefetch,
  href,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) {
  return <a {...props} href={href === undefined ? href : withAppBase(href)} />;
}
export default NativeLink;
