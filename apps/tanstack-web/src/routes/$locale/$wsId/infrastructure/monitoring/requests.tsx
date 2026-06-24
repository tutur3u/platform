import { createFileRoute } from '@tanstack/react-router';
import { MonitoringRequestsArchiveClient } from '@/components/infrastructure/monitoring-requests';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';

export const Route = createFileRoute(
  '/$locale/$wsId/infrastructure/monitoring/requests'
)({
  component: InfrastructureMonitoringRequestsRoute,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Page through retained proxy traffic with route, status, render, traffic, and deployment filters.',
      locale,
      title: 'Request Archive',
    });
  },
});

function InfrastructureMonitoringRequestsRoute() {
  return <MonitoringRequestsArchiveClient />;
}
