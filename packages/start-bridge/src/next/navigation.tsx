import {
  notFound as startNotFound,
  redirect as startRedirect,
  useLocation,
  useNavigate,
  useParams as useStartParams,
  useRouter as useStartRouter,
} from '@tanstack/react-router';
import { createServerOnlyFn } from '@tanstack/react-start';
import { createContext, useContext, useMemo } from 'react';
import { withAppBase } from '../start/base-path';

/** Logical App Router params supplied by a catch-all page view. */
export const BridgeParamsContext = createContext<Record<string, string>>({});

// Reads the bridge request store through its global Symbol so this client
// module never imports node:async_hooks.
const REQUEST_STORE = Symbol.for('tuturuuu.start-bridge.request-context');
type ObservedStore = {
  getStore():
    | { observeNavigation?: (href: string, r: unknown) => void }
    | undefined;
};

const observeRedirect = createServerOnlyFn(
  (href: string, response: unknown) => {
    const store = (globalThis as { [REQUEST_STORE]?: ObservedStore })[
      REQUEST_STORE
    ];
    store?.getStore()?.observeNavigation?.(href, response);
  }
);

export function redirect(href: string): never {
  const result = startRedirect({ href: withAppBase(href) });
  try {
    observeRedirect(href, result);
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
/** App-relative pathname, as `next/navigation` reports under a basePath. */
export function usePathname() {
  return useLocation({ select: (location) => location.pathname });
}
export function useSearchParams() {
  const search = useLocation({ select: (location) => location.searchStr });
  return useMemo(() => new URLSearchParams(search), [search]);
}
export function useParams() {
  const native = useStartParams({ strict: false });
  const logical = useContext(BridgeParamsContext);
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
