'use client';

import { useMutation } from '@tanstack/react-query';
import { ClipboardList, Loader2 } from '@tuturuuu/icons';
import {
  getWorkspaceTaskPlanDigest,
  isTaskPlanSchemaUnavailable,
  type TaskPlan,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';

interface PlannerDigestPanelProps {
  plan: TaskPlan;
  workspaceId: string;
}

export function PlannerDigestPanel({
  plan,
  workspaceId,
}: PlannerDigestPanelProps) {
  const t = useTranslations('ws-task-plans');
  const tCommon = useTranslations('common');

  const digestMutation = useMutation({
    mutationFn: () => getWorkspaceTaskPlanDigest(workspaceId, plan.id),
    onError: () => toast.error(tCommon('error')),
  });
  const digest = digestMutation.data;

  return (
    <div className="min-w-0 space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => digestMutation.mutate()}
        disabled={digestMutation.isPending}
        className="h-8 gap-2"
      >
        {digestMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ClipboardList className="h-4 w-4" />
        )}
        {t('generate_digest')}
      </Button>

      {digest && !isTaskPlanSchemaUnavailable(digest) && (
        <Textarea
          readOnly
          value={digest.digest}
          className="h-28 resize-none text-xs"
          aria-label={t('digest')}
        />
      )}
    </div>
  );
}
