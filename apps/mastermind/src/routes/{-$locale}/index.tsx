import { createFileRoute } from '@tanstack/react-router';
import { CommandCenter } from '../../components/command-center';
import { LoadingState } from '../../components/page-states';
import { loadFleet } from '../../fleet/server';

export const Route = createFileRoute('/{-$locale}/')({
  loader: () => loadFleet(),
  // Navigating between locales reloads the snapshot.
  pendingComponent: Pending,
  component: Page,
});

function Pending() {
  return (
    <div className="mx-auto max-w-6xl p-4">
      <LoadingState />
    </div>
  );
}

function Page() {
  return <CommandCenter initial={Route.useLoaderData()} />;
}
