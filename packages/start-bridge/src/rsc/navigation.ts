import {
  isNotFound,
  isRedirect,
  notFound as startNotFound,
} from '@tanstack/router-core';
import { bridgeRedirect } from '../start/absolute-redirect';

/**
 * `next/navigation` inside the RSC environment: server components may only
 * redirect or 404. Hooks belong to client components, which are references
 * here and resolve the router-mode shim in the client and SSR environments.
 */
export const RedirectType = { push: 'push', replace: 'replace' } as const;

export function redirect(href: string): never {
  throw bridgeRedirect(href);
}
export function permanentRedirect(href: string): never {
  throw bridgeRedirect(href, 308);
}
export function notFound(): never {
  throw startNotFound();
}
// Route handlers can catch ordinary failures without swallowing router control flow.
export function unstable_rethrow(error: unknown): void {
  const seen = new Set();
  while (error && typeof error === 'object' && !seen.has(error)) {
    if (isRedirect(error) || isNotFound(error)) throw error;
    seen.add(error);
    error = error instanceof Error ? error.cause : undefined;
  }
}
function clientOnly(name: string) {
  return () => {
    throw new Error(
      `${name}() is a client hook; call it from a 'use client' module`
    );
  };
}
export const usePathname = clientOnly('usePathname');
export const useRouter = clientOnly('useRouter');
export const useSearchParams = clientOnly('useSearchParams');
export const useParams = clientOnly('useParams');
