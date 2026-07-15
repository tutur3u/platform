'use client';

import { Progress } from '@tuturuuu/ui/progress';
import { useTranslations } from 'next-intl';

interface ProjectProgressMeterProps {
  completed: number;
  total: number;
  compact?: boolean;
}

export function ProjectProgressMeter({
  completed,
  total,
  compact = false,
}: ProjectProgressMeterProps) {
  const t = useTranslations('task-projects.project_card');
  const value = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{t('completion')}</span>
        <span className="font-medium tabular-nums">
          {compact
            ? `${value}%`
            : t('completion_ratio', { completed, total, value })}
        </span>
      </div>
      <Progress value={value} className="h-1.5" />
    </div>
  );
}
