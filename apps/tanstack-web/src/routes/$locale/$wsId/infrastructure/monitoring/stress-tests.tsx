import { createFileRoute } from '@tanstack/react-router';
import { InfrastructureStressTestsClient } from '@/components/infrastructure/stress-tests';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';

export const Route = createFileRoute(
  '/$locale/$wsId/infrastructure/monitoring/stress-tests'
)({
  component: InfrastructureMonitoringStressTestsRoute,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Run controlled native load checks and inspect capacity history.',
      locale,
      title: 'Stress Tests',
    });
  },
});

function InfrastructureMonitoringStressTestsRoute() {
  const params = Route.useParams();

  return (
    <InfrastructureStressTestsClient
      locale={params.locale}
      wsId={params.wsId}
    />
  );
}
