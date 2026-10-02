import type { ComponentProps } from 'react';

export function navigate(url: string) {
  history.pushState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
export function useRouter() {
  return { push: navigate, refresh: () => {} };
}
export function Link({ href, onClick, ...props }: ComponentProps<'a'>) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && href) {
          event.preventDefault();
          navigate(href);
        }
      }}
    />
  );
}
