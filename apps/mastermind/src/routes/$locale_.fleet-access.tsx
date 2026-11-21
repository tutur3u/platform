import { createFileRoute, notFound } from '@tanstack/react-router';
import { z } from 'zod';
import { fleetAccessFn } from '../fleet-access/api';
import { FleetAccessPage } from '../fleet-access/fleet-access-page';
import { fleetTabs } from '../fleet-access/model';
import { I18nProvider, isLocale } from '../i18n';

// Outside the `$locale` layout, so the owner-only command center loader never
// runs for this route.
export const Route = createFileRoute('/$locale_/fleet-access')({
  beforeLoad: ({ params }) => {
    if (!isLocale(params.locale)) throw notFound();
  },
  validateSearch: z.object({
    tab: z.enum(fleetTabs).optional().catch(undefined),
  }),
  loader: () => fleetAccessFn(),
  component: FleetAccessRoute,
});

function FleetAccessRoute() {
  const { locale } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <I18nProvider locale={isLocale(locale) ? locale : 'en'}>
      <FleetAccessPage
        access={Route.useLoaderData()}
        tab={tab}
        onTabChange={(next) =>
          navigate({ search: { tab: next }, replace: true })
        }
      />
    </I18nProvider>
  );
}
