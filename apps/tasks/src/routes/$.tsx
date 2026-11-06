import { createFileRoute } from '@tanstack/react-router';
import { AppProviders } from '../runtime/app-providers';
import { loadTasksPage } from '../runtime/page-loader';
import { PageView } from '../runtime/page-view';

export const Route = createFileRoute('/$')({
  loader: ({ location }) => loadTasksPage({ data: { path: location.href } }),
  component: function TasksPage() {
    const model = Route.useLoaderData();
    return (
      <AppProviders
        locale={model.locale}
        actorId={model.actorId}
        params={model.params}
      >
        <PageView model={model} />
      </AppProviders>
    );
  },
});
