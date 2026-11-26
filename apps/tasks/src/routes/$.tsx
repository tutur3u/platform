import { createFileRoute } from '@tanstack/react-router';
import { AppProviders } from '../runtime/app-providers';
import { loadTasksPage } from '../runtime/page-loader';
import { skipTaskBoardEntrypointPreload } from '../runtime/page-path';
import { PageView } from '../runtime/page-view';
import { PageTransition, TasksPageLoading } from '../runtime/page-transition';

// Pin the browser clock for SSR data even if the hydrated route later remounts.
const initialHydratedAt = typeof window === 'undefined' ? 0 : Date.now();

export const Route = createFileRoute('/$')({
  beforeLoad: skipTaskBoardEntrypointPreload,
  loader: async ({ location, preload }) => {
    const requestStartedAt = typeof window === 'undefined' ? null : Date.now();
    return {
      path: location.pathname,
      model: await loadTasksPage({ data: { path: location.href, preload } }),
      requestStartedAt,
    };
  },
  pendingMs: 0,
  pendingMinMs: 0,
  pendingComponent: TasksPageLoading,
  component: function TasksPage() {
    const { model, path, requestStartedAt } = Route.useLoaderData();
    return (
      <PageTransition loadedPath={path}>
        <AppProviders
          locale={model.locale}
          actorId={model.actorId}
          params={model.params}
        >
          <PageView
            model={model}
            snapshotAt={requestStartedAt ?? initialHydratedAt}
          />
        </AppProviders>
      </PageTransition>
    );
  },
});
