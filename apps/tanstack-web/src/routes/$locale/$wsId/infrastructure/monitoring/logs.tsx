import { createFileRoute } from '@tanstack/react-router';
import { MonitoringObservabilityClient } from '@/components/infrastructure/monitoring-observability';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';

export const Route = createFileRoute(
  '/$locale/$wsId/infrastructure/monitoring/logs'
)({
  component: InfrastructureMonitoringLogsRoute,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Search retained infrastructure logs by level, source, route, status, user, deployment stamp, and request id.',
      locale,
      title: 'Monitoring Logs',
    });
  },
});

function InfrastructureMonitoringLogsRoute() {
  return <MonitoringObservabilityClient mode="logs" />;
}
