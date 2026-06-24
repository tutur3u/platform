import { createFileRoute } from '@tanstack/react-router';
import { MonitoringObservabilityClient } from '@/components/infrastructure/monitoring-observability';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';

export const Route = createFileRoute(
  '/$locale/$wsId/infrastructure/monitoring/projects'
)({
  component: InfrastructureMonitoringProjectsRoute,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage monitored infrastructure projects, repository sync state, auto deployment, and optional service add-ons.',
      locale,
      title: 'Monitoring Projects',
    });
  },
});

function InfrastructureMonitoringProjectsRoute() {
  return <MonitoringObservabilityClient mode="projects" />;
}
