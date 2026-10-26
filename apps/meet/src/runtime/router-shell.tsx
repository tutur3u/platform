import {
  type ErrorComponentProps,
  HeadContent,
  Outlet,
  Scripts,
  useLocation,
  useMatches,
} from '@tanstack/react-router';
import { appPath } from '@tuturuuu/start-bridge/app-url';
import { AppErrorBoundary } from '@tuturuuu/ui/custom/app-error-boundary';
import type { ReactElement } from 'react';
import { AppProviders } from './app-providers';
import { readLoadingLabels } from './loading-labels';
import {
  isRoomPath,
  RoomRouteError,
  RoomRouteFeedback,
} from './room-route-feedback';
import { reportMeetSsr } from './ssr-diagnostics';
import '../app/[locale]/meet.css';
import './typography.css';

type DocumentLocale = 'en' | 'vi';

function selectDocumentLocale(
  matches: readonly { loaderData?: unknown }[]
): DocumentLocale | undefined {
  const data = matches.at(-1)?.loaderData;
  if (typeof data !== 'object' || data === null || !('locale' in data)) return;
  return data.locale === 'en' || data.locale === 'vi' ? data.locale : undefined;
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
      <body className="meet-font overflow-y-auto bg-root-background antialiased">
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}

export function Pending(): ReactElement {
  const pathname = useLocation({ select: (location) => location.pathname });
  if (isRoomPath(pathname))
    return <RoomRouteFeedback pathname={pathname} state="loading" />;
  const labels = readLoadingLabels(pathname);
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6 text-foreground">
      <section className="max-w-sm text-center">
        <img
          src={appPath('/media/branding/brand-mark-light.svg')}
          width="2369"
          height="512"
          alt="Tuturuuu"
          className="mb-9 h-auto w-full dark:hidden"
        />
        <img
          src={appPath('/media/branding/brand-mark-dark.svg')}
          width="2369"
          height="512"
          alt="Tuturuuu"
          className="mb-9 hidden h-auto w-full dark:block"
        />
        <h1 className="font-medium text-4xl">{labels.title}</h1>
        <p className="mt-4 text-muted-foreground">{labels.hint}</p>
        <p role="status" className="mt-8 text-sm">
          {labels.status}
        </p>
      </section>
    </main>
  );
}

export function ErrorPage({ error, reset }: ErrorComponentProps) {
  reportMeetSsr(error, 'render-boundary', 'threw');
  const pathname = useLocation({ select: (location) => location.pathname });
  if (isRoomPath(pathname))
    return <RoomRouteError pathname={pathname} reset={reset} />;
  return (
    <AppProviders
      locale={pathname.startsWith('/vi') ? 'vi' : 'en'}
      showVersionBadge={false}
      params={{}}
    >
      <AppErrorBoundary
        appName="Meet"
        error={
          error instanceof Error
            ? error
            : new Error(String(error), { cause: error })
        }
        reset={reset}
      />
    </AppProviders>
  );
}

export function NotFoundPage() {
  const pathname = useLocation({ select: (location) => location.pathname });
  return isRoomPath(pathname) ? (
    <RoomRouteFeedback pathname={pathname} state="missing" />
  ) : (
    <main className="grid min-h-dvh place-items-center">
      <h1>404</h1>
    </main>
  );
}
