import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { enforceInfrastructureRootWorkspace } from '../enforce-infrastructure-root';
import { BlueGreenMonitoringClient } from './_components/blue-green-monitoring-client';

export const metadata: Metadata = {
  title: 'Blue Green Monitoring',
  description: 'Observe blue/green deployment health and watcher telemetry.',
};

export default async function InfrastructureMonitoringPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  await enforceInfrastructureRootWorkspace(wsId);
  const t = await getTranslations('blue-green-monitoring');

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-bold text-3xl tracking-tight">{t('title')}</h1>
        <p className="max-w-3xl text-muted-foreground">{t('description')}</p>
      </div>
      <BlueGreenMonitoringClient />
    </div>
  );
}
