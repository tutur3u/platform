'use client';

import { StatusPage } from './status-page/status-page';
import { StatusPageDocument } from './status-page/document';

type BoundaryError = Error & { digest?: string };

interface AppErrorBoundaryProps {
  appName?: string;
  error: BoundaryError;
  global?: boolean;
  /** The current app's start page. */
  homeHref?: string;
  locale?: string;
  reset?: () => void;
  unstable_retry?: () => void;
  /**
   * `page` adds the Tuturuuu header and footer, for app-level boundaries.
   * `inline` (default) keeps a nested boundary inside the app's own shell.
   */
  chrome?: 'page' | 'inline';
}

function browserLocale(): string | undefined {
  if (typeof document !== 'undefined' && document.documentElement.lang) {
    return document.documentElement.lang;
  }
  if (typeof window !== 'undefined') return window.location.pathname;
  return undefined;
}

function statusProps({
  appName,
  error,
  homeHref = '/',
  locale,
  reset,
  unstable_retry,
}: AppErrorBoundaryProps) {
  const retry = unstable_retry ?? reset;
  // The platform itself is not a separate app: no breadcrumb or app link.
  const app = appName && appName !== 'Tuturuuu' ? appName : undefined;
  return {
    variant: 'error' as const,
    appName: app,
    appHref: app ? homeHref : undefined,
    locale: locale ?? browserLocale(),
    onRetry: retry ? () => retry() : undefined,
    reference: error.digest,
    details:
      process.env.NODE_ENV === 'development' && error.message
        ? error.message
        : undefined,
  };
}

/** Error boundary view: the shared Tuturuuu status page, error variant. */
export function AppErrorBoundary(props: AppErrorBoundaryProps) {
  return (
    <StatusPage
      {...statusProps(props)}
      chrome={props.global ? 'page' : (props.chrome ?? 'inline')}
    />
  );
}

/** For Next `global-error`: the status page as the whole document. */
export function GlobalAppErrorBoundary(props: AppErrorBoundaryProps) {
  return <StatusPageDocument {...statusProps(props)} />;
}

export type { AppErrorBoundaryProps, BoundaryError };
