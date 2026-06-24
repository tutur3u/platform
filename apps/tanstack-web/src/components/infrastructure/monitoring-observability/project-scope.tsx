'use client';

import { formatDateTime } from './formatters';
import { MetricCard, ToneBadge } from './primitives';
import type { MonitoringTranslator } from './types';

export function ProjectScope({
  project,
  t,
  watcherHealth,
  watcherLastCheckAt,
}: {
  project: {
    deploymentStatus: string;
    hostnames: string[];
    id: string;
    isBuiltin: boolean;
    latestCommitShortHash: string | null;
    latestSyncedAt: number | null;
    name: string;
    selectedBranch: string;
  };
  t: MonitoringTranslator;
  watcherHealth: string | undefined;
  watcherLastCheckAt: number | null | undefined;
}) {
  return (
    <section className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-xs uppercase">
              {t('scope.title')}
            </span>
            <ToneBadge tone="blue">{project.selectedBranch}</ToneBadge>
            <ToneBadge tone="muted">
              {t('watcher.badge', { health: watcherHealth ?? 'missing' })}
            </ToneBadge>
            {project.isBuiltin ? (
              <ToneBadge tone="green">{t('projects.builtin')}</ToneBadge>
            ) : null}
          </div>
          <h3 className="mt-2 truncate font-semibold text-base">
            {project.name}
          </h3>
          <p className="mt-1 truncate text-muted-foreground text-xs">
            {t('scope.meta', { project: project.id })}
          </p>
        </div>
        <div className="grid gap-2 text-xs sm:grid-cols-2 lg:min-w-[560px] lg:grid-cols-4">
          <MetricCard
            label={t('projects.latest_commit')}
            value={project.latestCommitShortHash ?? '-'}
          />
          <MetricCard
            label={t('projects.synced')}
            value={formatDateTime(project.latestSyncedAt)}
          />
          <MetricCard
            label={t('projects.hostnames')}
            value={project.hostnames.join(', ') || '-'}
          />
          <MetricCard
            label={t('watcher.title')}
            value={formatDateTime(watcherLastCheckAt)}
          />
        </div>
      </div>
    </section>
  );
}
