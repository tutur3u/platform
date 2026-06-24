import { createFileRoute } from '@tanstack/react-router';
import { MonitoringObservabilityClient } from '@/components/infrastructure/monitoring-observability';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';

export const Route = createFileRoute(
  '/$locale/$wsId/infrastructure/monitoring/observability'
)({
  component: InfrastructureMonitoringObservabilityRoute,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Inspect the combined observability console for requests, logs, cron runs, deployments, resources, and recovery controls.',
      locale,
      title: 'Observability Console',
    });
  },
});

function InfrastructureMonitoringObservabilityRoute() {
  return <MonitoringObservabilityClient mode="observability" />;
}
