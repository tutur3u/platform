import { createFileRoute } from '@tanstack/react-router';
import { MonitoringObservabilityClient } from '@/components/infrastructure/monitoring-observability';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';

export const Route = createFileRoute(
  '/$locale/$wsId/infrastructure/monitoring/analytics'
)({
  component: InfrastructureMonitoringAnalyticsRoute,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Inspect request, error, status-family, route, and cron-job trends across infrastructure telemetry.',
      locale,
      title: 'Monitoring Analytics',
    });
  },
});

function InfrastructureMonitoringAnalyticsRoute() {
  return <MonitoringObservabilityClient mode="analytics" />;
}
