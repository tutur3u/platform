import { createFileRoute, notFound } from '@tanstack/react-router';
import { I18nProvider, isLocale } from '../i18n';
import { loadShip } from '../ship/server';
import { ShipLoading, ShipPage } from '../ship/ship-page';

// Outside the `$locale` layout so the command center loader never runs here;
// the Worker admits only the owner to this path.
export const Route = createFileRoute('/$locale_/ship')({
  beforeLoad: ({ params }) => {
    if (!isLocale(params.locale)) throw notFound();
  },
  loader: async () => ({ read: await loadShip(), now: Date.now() }),
  pendingComponent: Pending,
  component: ShipRoute,
});

function Pending() {
  const { locale } = Route.useParams();
  return (
    <I18nProvider locale={isLocale(locale) ? locale : 'en'}>
      <div className="mx-auto max-w-6xl p-4">
        <ShipLoading />
      </div>
    </I18nProvider>
  );
}

function ShipRoute() {
  const { locale } = Route.useParams();
  const { read, now } = Route.useLoaderData();
  return (
    <I18nProvider locale={isLocale(locale) ? locale : 'en'}>
      <ShipPage initial={read} serverNow={now} />
    </I18nProvider>
  );
}
