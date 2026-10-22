import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { AppProviders } from '../runtime/app-providers';
import { pageHead } from '../runtime/page-head';
import { loadMeetPage } from '../runtime/page-loader';
import { PageView } from '../runtime/page-view';
import { Pending } from '../runtime/router-shell';

export const Route = createFileRoute('/$')({
  loader: ({ location }) => loadMeetPage({ data: { path: location.href } }),
  head: ({ loaderData }) => (loaderData ? pageHead(loaderData) : {}),
  component: function MeetPage(): ReactElement {
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
  pendingComponent: Pending,
});
