import { notFound } from '@tanstack/react-router';
import { runtimeAppBase } from '@tuturuuu/start-bridge/start/base-path';

/** The app-relative pathname of a router path, without its locale prefix. */
export function appPathname(path: string) {
  const base = runtimeAppBase();
  let pathname = new URL(path, 'http://app.invalid').pathname;
  if (base && (pathname === base || pathname.startsWith(`${base}/`)))
    pathname = pathname.slice(base.length) || '/';
  const localeless = pathname.replace(/^\/(?:en|vi)(?=\/|$)/u, '') || '/';
  return { pathname: localeless, localePrefixed: localeless !== pathname };
}

export function isTaskBoardEntrypoint(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  return (
    segments.length === 0 ||
    (segments.length === 2 &&
      (segments[1] === 'tasks' || segments[1] === 'boards'))
  );
}

/** Skip provisioning routes before the router can share a preload with a click. */
export function skipTaskBoardEntrypointPreload({
  location,
  preload,
}: {
  location: { pathname: string };
  preload: boolean;
}) {
  if (
    preload &&
    isTaskBoardEntrypoint(appPathname(location.pathname).pathname)
  ) {
    throw notFound();
  }
}
