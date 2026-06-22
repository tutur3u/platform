import type { TaskPlanItem } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';
import { getTaskPlanItemScope } from './planner-utils';

interface PlannerScopeBadgeProps {
  item: TaskPlanItem;
  personalWorkspaceId: string;
}

export function PlannerScopeBadge({
  item,
  personalWorkspaceId,
}: PlannerScopeBadgeProps) {
  const t = useTranslations('ws-task-plans');
  const scope = getTaskPlanItemScope(item, personalWorkspaceId);

  if (scope === 'draft') {
    return <Badge variant="secondary">{t('scope_draft')}</Badge>;
  }

  if (scope === 'personal') {
    return <Badge variant="outline">{t('scope_personal')}</Badge>;
  }

  return <Badge>{t('scope_external_workspace')}</Badge>;
}
