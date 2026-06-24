import { createFileRoute } from '@tanstack/react-router';
import { MonitoringObservabilityClient } from '@/components/infrastructure/monitoring-observability';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';

export const Route = createFileRoute(
  '/$locale/$wsId/infrastructure/monitoring/'
)({
  component: InfrastructureMonitoringOverviewRoute,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Review infrastructure observability health, recent errors, request volume, deployments, logs, and resource signals.',
      locale,
      title: 'Infrastructure Monitoring',
    });
  },
});

function InfrastructureMonitoringOverviewRoute() {
  return <MonitoringObservabilityClient mode="overview" />;
}
