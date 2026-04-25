import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { enforceInfrastructureRootWorkspace } from '../enforce-infrastructure-root';
import { BlueGreenMonitoringSectionNav } from './_components/blue-green-monitoring-section-nav';

export const metadata: Metadata = {
  title: 'Blue Green Monitoring',
  description:
    'Observe blue/green deployment health, rollout telemetry, request traffic, and watcher logs.',
};

export default async function InfrastructureMonitoringLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  await enforceInfrastructureRootWorkspace(wsId);
  const t = await getTranslations('blue-green-monitoring');
  const baseHref = `/${wsId}/infrastructure/monitoring`;

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border/60 bg-background p-4">
        <div className="space-y-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-2">
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.28em]">
                {t('hero.kicker')}
              </p>
              <div>
                <h1 className="font-semibold text-2xl tracking-tight">
                  {t('title')}
                </h1>
                <p className="mt-2 text-muted-foreground text-sm">
                  {t('description')}
                </p>
              </div>
            </div>
          </div>

          <BlueGreenMonitoringSectionNav baseHref={baseHref} />
        </div>
      </section>

      {children}
    </div>
  );
}
