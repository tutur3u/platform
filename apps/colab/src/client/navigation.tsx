import {
  type AnchorHTMLAttributes,
  type MouseEvent,
  useSyncExternalStore,
} from 'react';

const navigationEvent = 'colab:navigate';
const snapshot = () => location.pathname + location.search + location.hash;
const subscribe = (notify: () => void) => {
  window.addEventListener(navigationEvent, notify);
  window.addEventListener('popstate', notify);
  window.addEventListener('hashchange', notify);
  return () => {
    window.removeEventListener(navigationEvent, notify);
    window.removeEventListener('popstate', notify);
    window.removeEventListener('hashchange', notify);
  };
};

export const useWorkspaceLocation = () =>
  useSyncExternalStore(subscribe, snapshot, () => '/');

export function navigateWorkspace(href: string, replace = false) {
  const target = new URL(href, location.origin);
  if (target.pathname === '/join' || target.pathname === '/host') {
    const dialog = target.pathname.slice(1);
    target.pathname = ['/join', '/host'].includes(location.pathname)
      ? '/'
      : location.pathname;
    target.search = location.search;
    target.hash = location.hash;
    target.searchParams.delete('join');
    target.searchParams.delete('host');
    target.searchParams.set(dialog, '1');
  }
  const next = target.pathname + target.search + target.hash;
  if (next === snapshot()) return;
  if (replace) history.replaceState(null, '', next);
  else history.pushState(null, '', next);
  window.dispatchEvent(new Event(navigationEvent));
}

export function closeWorkspaceDialog() {
  const target = new URL(location.href);
  if (['/join', '/host'].includes(target.pathname)) target.pathname = '/';
  target.searchParams.delete('join');
  target.searchParams.delete('host');
  navigateWorkspace(target.pathname + target.search + target.hash, true);
}

export function handleWorkspaceLink(
  event: MouseEvent<HTMLAnchorElement>,
  href: string
) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.currentTarget.target === '_blank' ||
    event.currentTarget.hasAttribute('download') ||
    href.startsWith('#')
  )
    return;
  const target = new URL(href, location.origin);
  if (
    target.origin !== location.origin ||
    !['/', '/host', '/guide', '/join'].includes(target.pathname)
  )
    return;
  event.preventDefault();
  navigateWorkspace(href);
}

export function WorkspaceLink({
  href,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        handleWorkspaceLink(event, href);
      }}
    />
  );
}
