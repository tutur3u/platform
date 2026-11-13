import {
  type ErrorComponentProps,
  HeadContent,
  Scripts,
  useRouterState,
} from '@tanstack/react-router';
import { withAppBase } from '@tuturuuu/start-bridge/start/base-path';
import { AppErrorBoundary } from '@tuturuuu/ui/custom/app-error-boundary';
import { StatusPage } from '@tuturuuu/ui/custom/status-page';
import type { ReactElement, ReactNode } from 'react';
import { AppProviders } from './app-providers';
import { reportCalendarSsrError } from './ssr-diagnostics';

function useResolvedLocale(): 'en' | 'vi' {
  return useRouterState({
    select: (state: {
      matches: ReadonlyArray<{ routeId: string; context: unknown }>;
    }): 'en' | 'vi' => {
      const context = state.matches.find(
        (match) => match.routeId === '__root__'
      )?.context;
      return context &&
        typeof context === 'object' &&
        'locale' in context &&
        context.locale === 'vi'
        ? 'vi'
        : 'en';
    },
  });
}

export function Document({ children }: { children: ReactNode }): ReactElement {
  const locale = useResolvedLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="calendar-font overflow-y-auto bg-root-background antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
export function CalendarError({
  error,
  reset,
}: ErrorComponentProps): ReactElement {
  if (import.meta.env.SSR) reportCalendarSsrError(error, 'render-boundary');
  const locale = useResolvedLocale();
  return (
    <AppProviders locale={locale} params={{}} showVersionBadge={false}>
      <AppErrorBoundary
        appName="Calendar"
        chrome="page"
        homeHref={withAppBase('/')}
        locale={locale}
        error={
          error instanceof Error
            ? error
            : new Error('Calendar page failed', { cause: error })
        }
        reset={reset}
      />
    </AppProviders>
  );
}

/** Unknown paths: the shared Tuturuuu status page (served as a 404). */
export function CalendarNotFound(): ReactElement {
  return (
    <StatusPage
      appHref={withAppBase('/')}
      appName="Calendar"
      locale={useResolvedLocale()}
      variant="not-found"
    />
  );
}
