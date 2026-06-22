'use client';

import { Loader2, Plus, Share2 } from '@tuturuuu/icons';
import type { TaskPlan, TaskPlanPeriod } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { getPlanWindowLabel, TASK_PLAN_PERIODS } from './planner-utils';

interface PlannerPlanToolbarProps {
  createPending: boolean;
  mode: TaskPlanPeriod;
  onCreatePlan: () => void;
  onModeChange: (mode: TaskPlanPeriod) => void;
  onPlanTitleChange: (title: string) => void;
  onSelectedPlanChange: (planId: string) => void;
  onSharePlan: () => void;
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

  return (
    <div className="flex flex-col gap-2 xl:flex-row xl:items-start">
      <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[14rem_1fr]">
        <Select
          value={selectedPlan?.id ?? ''}
          onValueChange={onSelectedPlanChange}
          disabled={plansLoading || plans.length === 0}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder={t('plan_switcher_placeholder')} />
          </SelectTrigger>
          <SelectContent>
            {plans.map((plan) => (
              <SelectItem key={plan.id} value={plan.id}>
                {plan.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Input
            value={planTitle}
            onChange={(event) => onPlanTitleChange(event.target.value)}
            placeholder={t('plan_title_placeholder')}
            className="h-9 min-w-40 flex-1"
          />
          <div className="flex rounded-md border bg-muted/30 p-0.5">
            {TASK_PLAN_PERIODS.map((period) => (
              <Button
                key={period}
                type="button"
                size="sm"
                variant={mode === period ? 'secondary' : 'ghost'}
                onClick={() => onModeChange(period)}
                className="h-8 px-2.5"
              >
                {t(`mode_${period}`)}
              </Button>
            ))}
          </div>
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
      </div>

      {selectedPlan && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{getPlanWindowLabel(selectedPlan)}</Badge>
          {selectedPlan.shares?.length ? (
            <Badge variant="secondary">{t('scope_shared_plan')}</Badge>
          ) : null}
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
        </div>
      )}
    </div>
  );
}
