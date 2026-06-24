import { createFileRoute } from '@tanstack/react-router';
import { MonitoringRolloutsClient } from '@/components/infrastructure/monitoring-rollouts';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';

export const Route = createFileRoute(
  '/$locale/$wsId/infrastructure/monitoring/rollouts'
)({
  component: InfrastructureMonitoringRolloutsRoute,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Track blue-green rollout health, standby sync, deployment pins, watcher events, and deployment history.',
      locale,
      title: 'Deployment Rollouts',
    });
  },
});

function InfrastructureMonitoringRolloutsRoute() {
  return <MonitoringRolloutsClient />;
}
