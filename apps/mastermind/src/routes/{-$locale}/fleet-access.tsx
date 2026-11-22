import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { fleetAccessFn } from '../../fleet-access/api';
import { FleetAccessPage } from '../../fleet-access/fleet-access-page';
import { fleetTabs } from '../../fleet-access/model';

// A sibling of the command center page, so its owner-only loader never runs
// for a Fleet grantee here.
export const Route = createFileRoute('/{-$locale}/fleet-access')({
  validateSearch: z.object({
    tab: z.enum(fleetTabs).optional().catch(undefined),
  }),
  loader: () => fleetAccessFn(),
  component: FleetAccessRoute,
});

function FleetAccessRoute() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <FleetAccessPage
      access={Route.useLoaderData()}
      tab={tab}
      onTabChange={(next) => navigate({ search: { tab: next }, replace: true })}
    />
  );
}
