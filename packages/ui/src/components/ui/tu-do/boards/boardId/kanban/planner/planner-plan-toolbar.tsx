'use client';

import { Loader2, Plus, Share2 } from '@tuturuuu/icons';
import type { TaskPlan, TaskPlanPeriod } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { getPlanWindowLabel, TASK_PLAN_PERIODS } from './planner-utils';

interface PlannerPlanToolbarProps {
  createPending: boolean;
  mode: TaskPlanPeriod;
  onCreatePlan: () => void;
  onModeChange: (mode: TaskPlanPeriod) => void;
  onPlanTitleChange: (title: string) => void;
  onSelectedPlanChange: (planId: string) => void;
  onSharePlan?: () => void;
  planTitle: string;
  plans: TaskPlan[];
  plansLoading: boolean;
  selectedPlan: TaskPlan | null;
}

export function PlannerPlanToolbar({
  createPending,
  mode,
  onCreatePlan,
  onModeChange,
  onPlanTitleChange,
  onSelectedPlanChange,
  onSharePlan,
  planTitle,
  plans,
  plansLoading,
  selectedPlan,
}: PlannerPlanToolbarProps) {
  const t = useTranslations('ws-task-plans');
  const planOptions = plans.map((plan) => ({
    value: plan.id,
    label: plan.title,
    description: getPlanWindowLabel(plan),
  }));
  const periodOptions = TASK_PLAN_PERIODS.map((period) => ({
    value: period,
    label: t(`mode_${period}`),
  }));

  return (
    <div className="flex flex-col gap-2 xl:flex-row xl:items-start">
      <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[14rem_9rem_1fr_auto]">
        <Combobox
          mode="single"
          options={planOptions}
          selected={selectedPlan?.id ?? ''}
          onChange={(value) => onSelectedPlanChange(value as string)}
          placeholder={t('plan_switcher_placeholder')}
          searchPlaceholder={t('plan_switcher_placeholder')}
          emptyText={t('no_plans')}
          disabled={plansLoading || plans.length === 0}
          className="[&_button]:h-9"
        />
        <Combobox
          mode="single"
          options={periodOptions}
          selected={mode}
          onChange={(value) => onModeChange(value as TaskPlanPeriod)}
          placeholder={t('mode_week')}
          searchPlaceholder={t('planner')}
          className="[&_button]:h-9"
        />
        <Input
          value={planTitle}
          onChange={(event) => onPlanTitleChange(event.target.value)}
          placeholder={t('plan_title_placeholder')}
          className="h-9 min-w-0"
        />
        <Button
          type="button"
          onClick={onCreatePlan}
          disabled={createPending}
          size="sm"
          className="h-9 gap-2"
        >
          {createPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {t('create_plan')}
        </Button>
      </div>

      {selectedPlan && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{getPlanWindowLabel(selectedPlan)}</Badge>
          {selectedPlan.shares?.length ? (
            <Badge variant="secondary">{t('scope_shared_plan')}</Badge>
          ) : null}
          {onSharePlan && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSharePlan}
              className="h-8 gap-2"
            >
              <Share2 className="h-4 w-4" />
              {t('share_plan')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
