import { createFileRoute } from '@tanstack/react-router';
import { MonitoringObservabilityClient } from '@/components/infrastructure/monitoring-observability';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';

export const Route = createFileRoute(
  '/$locale/$wsId/infrastructure/monitoring/resources'
)({
  component: InfrastructureMonitoringResourcesRoute,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Review runtime and build resource sampling for containers, CPU, memory, network traffic, and sample health.',
      locale,
      title: 'Monitoring Resources',
    });
  },
});

function InfrastructureMonitoringResourcesRoute() {
  return <MonitoringObservabilityClient mode="resources" />;
}
