'use client';

import type { TaskPlan } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';
import { PlannerScopeBadge } from './planner-scope-badge';

interface PlannerItemStripProps {
  personalWorkspaceId: string;
  plan: TaskPlan;
  plansLoading: boolean;
}

export function PlannerItemStrip({
  personalWorkspaceId,
  plan,
  plansLoading,
}: PlannerItemStripProps) {
  const t = useTranslations('ws-task-plans');
  const items = plan.items ?? [];

  return (
    <div className="flex min-h-20 gap-2 overflow-x-auto">
      {items.length === 0 ? (
        <div className="flex min-h-16 items-center rounded-md border border-dashed px-3 text-muted-foreground text-sm">
          {plansLoading ? t('loading') : t('no_items')}
        </div>
      ) : (
        items.map((item) => (
          <div
            key={item.id}
            className="min-w-56 max-w-72 rounded-md border bg-card p-2 text-sm"
          >
            <div className="truncate font-medium">
              {item.task?.name ?? item.snapshot_title ?? t('untitled_task')}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {item.task_id ? (
                <Badge variant="outline">{t('scope_team_source')}</Badge>
              ) : null}
              <PlannerScopeBadge
                item={item}
                personalWorkspaceId={personalWorkspaceId}
              />
              {item.notes ? (
                <Badge variant="secondary">{t('scope_my_override')}</Badge>
              ) : null}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
