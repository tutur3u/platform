import { createFileRoute } from '@tanstack/react-router';
import { loadShip } from '../../ship/server';
import { ShipLoading, ShipPage } from '../../ship/ship-page';

// The Worker admits only the owner to this path.
export const Route = createFileRoute('/{-$locale}/ship')({
  loader: async () => ({ read: await loadShip(), now: Date.now() }),
  pendingComponent: Pending,
  component: ShipRoute,
});

function Pending() {
  return (
    <div className="mx-auto max-w-6xl p-4">
      <ShipLoading />
    </div>
  );
}

function ShipRoute() {
  const { read, now } = Route.useLoaderData();
  return <ShipPage initial={read} serverNow={now} />;
}
