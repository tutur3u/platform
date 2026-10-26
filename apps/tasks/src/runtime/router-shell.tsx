import {
  type ErrorComponentProps,
  HeadContent,
  Scripts,
  useRouterState,
} from '@tanstack/react-router';
import { AppErrorBoundary } from '@tuturuuu/ui/custom/app-error-boundary';
import type { ReactElement, ReactNode } from 'react';
import { AppProviders } from './app-providers';

function useRootLocale(): 'en' | 'vi' {
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
  return (
    <html lang={useRootLocale()} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="tasks-font overflow-y-auto bg-root-background antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

export function TasksError({
  error,
  reset,
}: ErrorComponentProps): ReactElement {
  if (import.meta.env.SSR) console.error('Tasks render failed', error);
  const locale = useRootLocale();
  return (
    <AppProviders locale={locale} params={{}}>
      <AppErrorBoundary
        appName="Tasks"
        locale={locale}
        error={
          error instanceof Error
            ? error
            : new Error('Tasks page failed', { cause: error })
        }
        reset={reset}
      />
    </AppProviders>
  );
}
