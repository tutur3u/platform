import {
  notFound as startNotFound,
  redirect as startRedirect,
} from '@tanstack/router-core';
import { withAppBase } from '../start/base-path';

/**
 * `next/navigation` inside the RSC environment: server components may only
 * redirect or 404. Hooks belong to client components, which are references
 * here and resolve the router-mode shim in the client and SSR environments.
 */
export const RedirectType = { push: 'push', replace: 'replace' } as const;

export function redirect(href: string): never {
  throw startRedirect({ href: withAppBase(href) });
}
export function permanentRedirect(href: string): never {
  throw startRedirect({ href: withAppBase(href), statusCode: 308 });
}
export function notFound(): never {
  throw startNotFound();
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
