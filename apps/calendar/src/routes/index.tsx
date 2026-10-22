import { createFileRoute } from '@tanstack/react-router';
import { AppProviders } from '../runtime/app-providers';
import { loadCalendarPage } from '../runtime/page-loader';
import { PageView } from '../runtime/page-view';
export const Route = createFileRoute('/')({
  loader: ({ location }) => loadCalendarPage({ data: { path: location.href } }),
  component: function Index() {
    const model = Route.useLoaderData();
    return (
      <AppProviders
        locale={model.locale}
        actorId={model.actorId}
        showVersionBadge={model.showVersionBadge}
        params={model.params}
      >
        <PageView model={model} />
      </AppProviders>
    );
  },
});
