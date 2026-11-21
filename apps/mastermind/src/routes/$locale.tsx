import { createFileRoute, notFound } from '@tanstack/react-router';
import { CommandCenter } from '../components/command-center';
import { LoadingState } from '../components/page-states';
import { loadFleet } from '../fleet/server';
import { I18nProvider, isLocale } from '../i18n';

export const Route = createFileRoute('/$locale')({
  beforeLoad: ({ params }) => {
    if (!isLocale(params.locale)) throw notFound();
  },
  loader: () => loadFleet(),
  // Navigating between /en and /vi reloads the snapshot.
  pendingComponent: Pending,
  component: Page,
});

function Pending() {
  const { locale } = Route.useParams();
  return (
    <I18nProvider locale={isLocale(locale) ? locale : 'en'}>
      <div className="mx-auto max-w-6xl p-4">
        <LoadingState />
      </div>
    </I18nProvider>
  );
}

function Page() {
  const { locale } = Route.useParams();
  return (
    <I18nProvider locale={isLocale(locale) ? locale : 'en'}>
      <CommandCenter initial={Route.useLoaderData()} />
    </I18nProvider>
  );
}
