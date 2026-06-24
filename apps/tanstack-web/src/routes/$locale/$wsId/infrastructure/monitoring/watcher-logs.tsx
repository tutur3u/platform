import { createFileRoute } from '@tanstack/react-router';
import { MonitoringWatcherLogsClient } from '@/components/infrastructure/monitoring-watcher-logs';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';

export const Route = createFileRoute(
  '/$locale/$wsId/infrastructure/monitoring/watcher-logs'
)({
  component: InfrastructureMonitoringWatcherLogsRoute,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Inspect retained watcher logs by deployment scope, level, rollout status, and commit context.',
      locale,
      title: 'Watcher Logs',
    });
  },
});

function InfrastructureMonitoringWatcherLogsRoute() {
  return <MonitoringWatcherLogsClient />;
}
