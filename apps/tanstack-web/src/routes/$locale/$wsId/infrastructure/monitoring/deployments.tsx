import { createFileRoute } from '@tanstack/react-router';
import { MonitoringObservabilityClient } from '@/components/infrastructure/monitoring-observability';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';

export const Route = createFileRoute(
  '/$locale/$wsId/infrastructure/monitoring/deployments'
)({
  component: InfrastructureMonitoringDeploymentsRoute,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Page through deployment history with build metadata, runtime state, request counts, and rollout stages.',
      locale,
      title: 'Monitoring Deployments',
    });
  },
});

function InfrastructureMonitoringDeploymentsRoute() {
  return <MonitoringObservabilityClient mode="deployments" />;
}
