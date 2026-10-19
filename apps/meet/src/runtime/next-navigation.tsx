import {
  notFound as startNotFound,
  redirect as startRedirect,
  useLocation,
  useNavigate,
  useParams as useStartParams,
  useRouter as useStartRouter,
} from '@tanstack/react-router';
import { createContext, useContext, useMemo } from 'react';

export const MeetParamsContext = createContext<Record<string, string>>({});

export function redirect(href: string): never {
  throw startRedirect({ href });
}
export function permanentRedirect(href: string): never {
  throw startRedirect({ href, statusCode: 308 });
}
export function notFound(): never {
  throw startNotFound();
}
export function usePathname() {
  return useLocation({ select: (location) => location.pathname });
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
        void navigate({ href, resetScroll: options?.scroll !== false });
      },
      replace: (href: string, options?: { scroll?: boolean }) => {
        void navigate({
          href,
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
