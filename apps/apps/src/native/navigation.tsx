import {
  useLocation,
  useRouter as useStartRouter,
} from '@tanstack/react-router';
import type { AnchorHTMLAttributes } from 'react';

export function usePathname() {
  return useLocation({ select: (location) => location.pathname });
}
export function useSearchParams() {
  const search = useLocation({ select: (location) => location.searchStr });
  return new URLSearchParams(search);
}
export function useRouter() {
  const router = useStartRouter();
  return {
    push: (href: string) => {
      window.location.assign(href);
    },
    replace: (href: string) => {
      window.location.replace(href);
    },
    refresh: () => router.invalidate(),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    prefetch: async () => {},
  };
}
export function NativeLink({
  prefetch: _prefetch,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) {
  return <a {...props} />;
}
export default NativeLink;
