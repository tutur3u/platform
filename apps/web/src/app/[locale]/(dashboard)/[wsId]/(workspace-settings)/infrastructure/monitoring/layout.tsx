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
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(24,144,255,0.16),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.14),transparent_34%),linear-gradient(140deg,rgba(255,255,255,0.96),rgba(248,250,252,0.9))] p-6 shadow-sm dark:bg-[radial-gradient(circle_at_top_left,rgba(24,144,255,0.22),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.18),transparent_34%),linear-gradient(140deg,rgba(10,14,24,0.96),rgba(15,23,42,0.9))]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:24px_24px] opacity-40" />
        <div className="relative space-y-6">
          <div className="max-w-3xl space-y-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.28em]">
              {t('hero.kicker')}
            </p>
            <div>
              <h1 className="font-semibold text-3xl tracking-tight md:text-4xl">
                {t('title')}
              </h1>
              <p className="mt-3 text-base text-muted-foreground md:text-lg">
                {t('description')}
              </p>
            </div>
          </div>

          <BlueGreenMonitoringSectionNav baseHref={baseHref} />
        </div>
      </section>

      {children}
    </div>
  );
}
