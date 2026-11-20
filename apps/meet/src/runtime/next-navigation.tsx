import {
  notFound as startNotFound,
  redirect as startRedirect,
  useLocation,
  useNavigate,
  useParams as useStartParams,
  useRouter as useStartRouter,
} from '@tanstack/react-router';
import { runtimeAppBase, withAppBase } from '@tuturuuu/start-bridge/app-url';
import { OUTSIDE_APP_LOCATION_HEADER } from '@tuturuuu/start-bridge/base-path';
import { createServerOnlyFn } from '@tanstack/react-start';
import { createContext, useContext, useMemo } from 'react';
import { meetRequest } from './request-context';

export const MeetParamsContext = createContext<Record<string, string>>({});

const observeLoginRedirect = createServerOnlyFn(
  (href: string, response: unknown) => {
    const context = meetRequest();
    if (context.basePath && /^https?:\/\//iu.test(href)) {
      const target = new URL(href);
      if (target.origin === new URL(context.request.url).origin)
        context.responseHeaders.set(
          OUTSIDE_APP_LOCATION_HEADER,
          `${target.pathname}${target.search}${target.hash}`
        );
    }
    context.observeLoginNavigation?.(href, response);
  }
);

export function redirect(href: string): never {
  const absolute = /^https?:\/\//iu.test(href);
  const result = startRedirect({
    href: withAppBase(href),
    reloadDocument: absolute && Boolean(runtimeAppBase()),
  });
  try {
    observeLoginRedirect(href, result);
  } catch {
    /* Diagnostic hooks cannot replace the owning redirect. */
  }
  throw result;
}
export function permanentRedirect(href: string): never {
  throw startRedirect({ href: withAppBase(href), statusCode: 308 });
}
export function notFound(): never {
  throw startNotFound();
}
export function usePathname() {
  return useLocation({
    select: ({ pathname }) => {
      const base = runtimeAppBase();
      return base && (pathname === base || pathname.startsWith(`${base}/`))
        ? pathname.slice(base.length) || '/'
        : pathname;
    },
  });
}
export function useSearchParams() {
  const search = useLocation({ select: (location) => location.searchStr });
  return useMemo(() => new URLSearchParams(search), [search]);
}
export function useParams() {
  const native = useStartParams({ strict: false });
  const logical = useContext(MeetParamsContext);
  return { ...native, ...logical };
}
export function useRouter() {
  const navigate = useNavigate();
  const router = useStartRouter();
  return useMemo(
    () => ({
      push: (href: string, options?: { scroll?: boolean }) => {
        void navigate({
          href: withAppBase(href),
          resetScroll: options?.scroll !== false,
        });
      },
      replace: (href: string, options?: { scroll?: boolean }) => {
        void navigate({
          href: withAppBase(href),
          replace: true,
          resetScroll: options?.scroll !== false,
        });
      },
      refresh: () => {
        void router.invalidate();
      },
      back: () => router.history.back(),
      forward: () => router.history.forward(),
      prefetch: (href: string) => {
        void router.preloadRoute({ to: href });
      },
    }),
    [navigate, router]
  );
}
