import {
  type ErrorComponentProps,
  HeadContent,
  Outlet,
  Scripts,
  useLocation,
  useMatches,
} from '@tanstack/react-router';
import {
  AppErrorBoundary,
  type BoundaryError,
} from '@tuturuuu/ui/custom/app-error-boundary';
import type { ReactElement } from 'react';
import { AppProviders } from './providers';
import '@tuturuuu/ui/globals.css';
import './typography.css';

type DocumentLocale = 'en' | 'vi';

function selectDocumentLocale(
  matches: readonly { loaderData?: unknown }[]
): DocumentLocale | undefined {
  const data = matches.at(-1)?.loaderData;
  if (typeof data !== 'object' || data === null || !('locale' in data)) return;
  return data.locale === 'en' || data.locale === 'vi' ? data.locale : undefined;
}

function normalizeBoundaryError(error: unknown): BoundaryError {
  if (error instanceof Error) return error;
  const message =
    typeof error === 'string'
      ? error
      : typeof error === 'object' &&
          error !== null &&
          'message' in error &&
          typeof error.message === 'string'
        ? error.message
        : 'Unknown error';
  const normalized = new Error(message, { cause: error });
  return typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof error.digest === 'string'
    ? Object.assign(normalized, { digest: error.digest })
    : normalized;
}

export function Document(): ReactElement {
  const pathname = useLocation({ select: (location) => location.pathname });
  const matchedLocale = useMatches({ select: selectDocumentLocale });
  const locale = matchedLocale ?? (pathname.startsWith('/vi') ? 'vi' : 'en');
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="mail-font overflow-hidden bg-root-background antialiased">
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorPage({ error, reset }: ErrorComponentProps) {
  const pathname = useLocation({ select: (location) => location.pathname });
  return (
    <AppProviders
      locale={pathname.startsWith('/vi') ? 'vi' : 'en'}
      showVersionBadge={false}
      params={{}}
    >
      <AppErrorBoundary
        appName="Mail"
        error={normalizeBoundaryError(error)}
        reset={reset}
      />
    </AppProviders>
  );
}
