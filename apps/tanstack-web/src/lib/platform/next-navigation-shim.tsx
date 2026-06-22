'use client';

/**
 * `next/navigation` -> TanStack Router compatibility shim.
 *
 * Many shared `@tuturuuu/ui` client components import navigation hooks from
 * `next/navigation` (`useRouter`, `usePathname`, `useSearchParams`,
 * `useParams`) and the control-flow helpers `redirect` / `notFound`. Those
 * have no provider in TanStack Start and throw at runtime. Wiring this module
 * as a Vite `resolve.alias` for `next/navigation` (see the app-shell proposal)
 * lets those shared components run unchanged in apps/tanstack-web, backed by
 * the TanStack Router instance.
 *
 * Scope: this only needs to cover the surface the shared components actually
 * use — verified across `packages/ui`:
 *   useRouter (push/replace/refresh/back) · usePathname · useSearchParams ·
 *   useParams · redirect · notFound.
 * The router-method mapping is factored into `createNextCompatRouter` so it is
 * unit-testable without a live router context.
 */

import {
  notFound as tanstackNotFound,
  redirect as tanstackRedirect,
  useRouterState,
  useParams as useTanstackParams,
  useRouter as useTanstackRouter,
} from '@tanstack/react-router';

/**
 * The subset of Next's `AppRouterInstance` the shared components call. Next's
 * `push`/`replace` accept an optional options arg we intentionally ignore
 * (scroll behaviour etc. has no TanStack equivalent and is not relied upon).
 */
export interface NextCompatRouter {
  back(): void;
  forward(): void;
  prefetch(href: string): void;
  push(href: string): void;
  refresh(): void;
  replace(href: string): void;
}

/**
 * The minimal TanStack router shape this shim depends on. Declared structurally
 * so the adapter can be unit-tested against a lightweight fake.
 */
export interface RouterLike {
  history: {
    back(): void;
    forward(): void;
  };
  invalidate(): unknown;
  navigate(options: { href: string; replace?: boolean }): unknown;
}

/**
 * Pure adapter: maps Next's router method calls onto a TanStack router.
 * - push/replace -> navigate({ href, replace? })
 * - refresh      -> invalidate() (re-runs active loaders, Next's refresh intent)
 * - back/forward -> history.back/forward
 * - prefetch     -> no-op (Next's prefetch is an optimisation hint; TanStack
 *                   preloads on intent and has no stable imperative href API here)
 */
export function createNextCompatRouter(router: RouterLike): NextCompatRouter {
  return {
    back: () => {
      router.history.back();
    },
    forward: () => {
      router.history.forward();
    },
    prefetch: () => {
      // Intentionally a no-op — see doc comment above.
    },
    push: (href) => {
      router.navigate({ href });
    },
    refresh: () => {
      router.invalidate();
    },
    replace: (href) => {
      router.navigate({ href, replace: true });
    },
  };
}

export function useRouter(): NextCompatRouter {
  return createNextCompatRouter(useTanstackRouter() as unknown as RouterLike);
}

export function usePathname(): string {
  return useRouterState({ select: (state) => state.location.pathname });
}

export function useSearchParams(): URLSearchParams {
  const searchStr = useRouterState({
    select: (state) => state.location.searchStr,
  });
  return new URLSearchParams(searchStr);
}

// TanStack's `useParams` generic over-constrains the loose (`strict: false`)
// call shape we need; narrow it to the runtime contract we rely on.
const useLooseParams = useTanstackParams as unknown as (options: {
  strict: false;
}) => Record<string, string | string[]>;

export function useParams<
  T extends Record<string, string | string[]> = Record<
    string,
    string | string[]
  >,
>(): T {
  return useLooseParams({ strict: false }) as T;
}

export function redirect(url: string): never {
  throw tanstackRedirect({ href: url });
}

export function notFound(): never {
  throw tanstackNotFound();
}
