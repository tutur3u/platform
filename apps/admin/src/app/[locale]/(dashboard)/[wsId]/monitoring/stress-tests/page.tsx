import { InfrastructureStressTestsClient } from '../_components/infrastructure-stress-tests-client';

export default async function InfrastructureMonitoringStressTestsPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  return <InfrastructureStressTestsClient wsId={wsId} />;
}
