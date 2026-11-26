import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { AppProviders } from '../runtime/app-providers';
import { loadTasksPage } from '../runtime/page-loader';
import { PageView } from '../runtime/page-view';
import { PageTransition, TasksPageLoading } from '../runtime/page-transition';

export const Route = createFileRoute('/$')({
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
    const [hydratedAt] = useState(Date.now);
    return (
      <PageTransition loadedPath={path}>
        <AppProviders
          locale={model.locale}
          actorId={model.actorId}
          params={model.params}
        >
          <PageView model={model} snapshotAt={requestStartedAt ?? hydratedAt} />
        </AppProviders>
      </PageTransition>
    );
  },
});
