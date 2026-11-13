import {
  type ErrorComponentProps,
  useLocation,
  useRouter,
} from '@tanstack/react-router';
import {
  resolveStatusPageLocale,
  StatusPage,
  type StatusPageProps,
} from '@tuturuuu/ui/custom/status-page';
import { runtimeAppBase, withAppBase } from '../core/app-url';

/** App identity for the shared not-found and error pages. */
export interface BridgeStatusOptions {
  /** Product name beside the logo, e.g. `Tasks`. */
  appName?: string;
  /** App-relative search page, when the app has one. */
  searchPath?: string;
  /** App-relative help page, when the app has one. */
  helpPath?: string;
}

/**
 * Locale from the app-relative path's first segment (`/vi/...`), with the
 * mount base (`/tasks`) removed first.
 */
export function bridgeStatusLocale(pathname: string, base = runtimeAppBase()) {
  const relative =
    base && (pathname === base || pathname.startsWith(`${base}/`))
      ? pathname.slice(base.length) || '/'
      : pathname;
  return resolveStatusPageLocale(relative);
}

function useStatusProps(
  options: BridgeStatusOptions
): Omit<StatusPageProps, 'variant'> {
  const pathname = useLocation({ select: (location) => location.pathname });
  return {
    appName: options.appName,
    // A named app links its start page; an unnamed one (marketing) is home.
    appHref: options.appName ? withAppBase('/') : undefined,
    searchHref: options.searchPath
      ? withAppBase(options.searchPath)
      : undefined,
    helpHref: options.helpPath ? withAppBase(options.helpPath) : undefined,
    locale: bridgeStatusLocale(pathname),
  };
}

export function createBridgeStatusComponents(
  options: BridgeStatusOptions = {}
) {
  function BridgeNotFound() {
    return <StatusPage {...useStatusProps(options)} variant="not-found" />;
  }

  function BridgeError({ error, reset }: ErrorComponentProps) {
    const router = useRouter();
    const props = useStatusProps(options);
    if (import.meta.env?.SSR) console.error('Page render failed', error);
    return (
      <StatusPage
        {...props}
        onRetry={() => {
          reset();
          void router.invalidate();
        }}
        variant="error"
      />
    );
  }

  return { BridgeNotFound, BridgeError };
}
