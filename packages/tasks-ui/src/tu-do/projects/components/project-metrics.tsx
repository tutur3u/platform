'use client';

import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  FolderKanban,
  Target,
} from '@tuturuuu/icons';
import { Card } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ProjectOperationsStats } from '../types';

interface ProjectMetricsProps {
  stats: ProjectOperationsStats;
}

export function ProjectMetrics({ stats }: ProjectMetricsProps) {
  const t = useTranslations('task-projects.metrics');
  const items = [
    {
      label: t('projects'),
      value: stats.totalProjects,
      detail: t('active_projects', { count: stats.activeProjects }),
      icon: FolderKanban,
      className: 'text-dynamic-blue',
    },
    {
      label: t('linked_tasks'),
      value: stats.linkedTasks,
      detail: t('completed_tasks', { count: stats.completedTasks }),
      icon: Target,
      className: 'text-dynamic-green',
    },
    {
      label: t('linked_documents'),
      value: stats.linkedDocuments,
      detail: t('reference_materials'),
      icon: FileText,
      className: 'text-dynamic-cyan',
    },
    {
      label: t('risk_watch'),
      value: stats.atRiskProjects,
      detail:
        stats.atRiskProjects === 0
          ? t('clear')
          : t('needs_attention', { count: stats.atRiskProjects }),
      icon: stats.atRiskProjects === 0 ? CheckCircle2 : AlertTriangle,
      className:
        stats.atRiskProjects === 0 ? 'text-dynamic-green' : 'text-dynamic-red',
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card
            key={item.label}
            className="rounded-lg border-dynamic-surface/60 bg-background p-4 shadow-none"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-muted-foreground text-xs">{item.label}</p>
                <p className="font-semibold text-2xl tabular-nums">
                  {item.value}
                </p>
              </div>
              <div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-md bg-dynamic-surface/40',
                  item.className
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-3 text-muted-foreground text-xs">{item.detail}</p>
          </Card>
        );
      })}
    </div>
  );
}
