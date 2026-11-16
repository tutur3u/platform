import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { mailPageHead } from '../runtime/page-head';
import { mailLoaderPath } from '../runtime/loader-path';
import { loadMailPage } from '../runtime/page-loader';
import { PageView } from '../runtime/page-view';
import { AppProviders } from '../runtime/providers';

export const Route = createFileRoute('/$')({
  loader: ({ location }) =>
    loadMailPage({ data: { path: mailLoaderPath(location.href) } }),
  head: ({ loaderData }) => (loaderData ? mailPageHead(loaderData) : {}),
  component: function MailPage(): ReactElement {
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
