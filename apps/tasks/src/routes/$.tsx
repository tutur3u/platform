import { createFileRoute } from '@tanstack/react-router';
import { AppProviders } from '../runtime/app-providers';
import { loadTasksPage } from '../runtime/page-loader';
import { PageView } from '../runtime/page-view';
import { PageTransition, TasksPageLoading } from '../runtime/page-transition';

export const Route = createFileRoute('/$')({
  loader: async ({ location }) => ({
    path: location.pathname,
    model: await loadTasksPage({ data: { path: location.href } }),
  }),
  pendingMs: 0,
  pendingMinMs: 0,
  pendingComponent: TasksPageLoading,
  component: function TasksPage() {
    const { model, path } = Route.useLoaderData();
    return (
      <PageTransition loadedPath={path}>
        <AppProviders
          locale={model.locale}
          actorId={model.actorId}
          params={model.params}
        >
          <PageView model={model} />
        </AppProviders>
      </PageTransition>
    );
  },
});
