import { createFileRoute } from '@tanstack/react-router';
import { CronMonitoringClient } from '@/components/infrastructure/cron-monitoring';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';

export const Route = createFileRoute(
  '/$locale/$wsId/infrastructure/monitoring/cron'
)({
  component: InfrastructureCronMonitoringRoute,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Track the native Docker cron runner, queued manual runs, and route-level console output.',
      locale,
      title: 'Cron Jobs',
    });
  },
});

function InfrastructureCronMonitoringRoute() {
  return <CronMonitoringClient />;
}
