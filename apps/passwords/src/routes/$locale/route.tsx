import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createFileRoute,
  notFound,
  Outlet,
  useRouter,
} from '@tanstack/react-router';
import { Toaster } from '@tuturuuu/ui/sonner';
import { useState } from 'react';
import { AppError } from '../../components/app-error';
import { isLocale } from '../../i18n/messages';
import { I18nProvider } from '../../i18n/provider';

export const Route = createFileRoute('/$locale')({
  beforeLoad: ({ params }) => {
    if (!isLocale(params.locale)) throw notFound();
  },
  component: LocaleLayout,
  errorComponent: ({ error, reset }) => (
    <LocaleError error={error} reset={reset} />
  ),
});

function LocaleLayout() {
  const { locale } = Route.useParams();
  // One client per mounted tree; mutations never keep revealed bytes (gcTime 0).
  const [client] = useState(() => new QueryClient());
  return (
    <I18nProvider locale={isLocale(locale) ? locale : 'en'}>
      <QueryClientProvider client={client}>
        <Outlet />
        <Toaster />
      </QueryClientProvider>
    </I18nProvider>
  );
}

function LocaleError({ error, reset }: { error: unknown; reset(): void }) {
  const { locale } = Route.useParams();
  const router = useRouter();
  return (
    <I18nProvider locale={isLocale(locale) ? locale : 'en'}>
      <AppError
        error={error}
        reset={() => {
          reset();
          void router.invalidate();
        }}
      />
    </I18nProvider>
  );
}
