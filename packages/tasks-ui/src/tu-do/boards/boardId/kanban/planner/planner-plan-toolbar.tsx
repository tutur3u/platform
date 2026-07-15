'use client';

import { Loader2, Plus, Save, Share2 } from '@tuturuuu/icons';
import type {
  TaskPlan,
  TaskPlanPeriod,
  TaskPlanStatus,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import {
  getPlanWindowLabel,
  TASK_PLAN_PERIODS,
  TASK_PLAN_STATUSES,
} from './planner-utils';

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

type PlannerPlanBrowserProps = Pick<
  PlannerPlanToolbarProps,
  | 'onSelectedPlanChange'
  | 'onSharePlan'
  | 'plans'
  | 'plansLoading'
  | 'selectedPlan'
>;

function PlannerPlanBrowser({
  onSelectedPlanChange,
  onSharePlan,
  plans,
  plansLoading,
  selectedPlan,
}: PlannerPlanBrowserProps) {
  const t = useTranslations('ws-task-plans');
  const planOptions = plans.map((plan) => ({
    value: plan.id,
    label: plan.title,
    description: getPlanWindowLabel(plan),
  }));

  return (
    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
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

      {onSharePlan && selectedPlan && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onSharePlan}
          className="h-9 gap-2"
        >
          <Share2 className="h-4 w-4" />
          {t('share_plan')}
        </Button>
      )}

      {selectedPlan ? (
        <div className="flex flex-wrap items-center gap-2 md:col-span-2">
          <Badge variant="outline">{getPlanWindowLabel(selectedPlan)}</Badge>
          <Badge variant="secondary">
            {t(`mode_${selectedPlan.period_type}`)}
          </Badge>
          <Badge variant="secondary">
            {t(`plan_status_${selectedPlan.status}`)}
          </Badge>
          <Badge variant="outline">
            {selectedPlan.items?.length ?? 0} {t('planned_tasks')}
          </Badge>
          <Badge variant="outline">
            {selectedPlan.shares?.length ?? 0} {t('share_plan')}
          </Badge>
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-3 text-muted-foreground text-sm md:col-span-2">
          {plansLoading ? t('loading') : t('no_plans')}
        </div>
      )}
    </div>
  );
}

interface PlannerCreatePlanPanelProps {
  createPending: boolean;
  mode: TaskPlanPeriod;
  onCreatePlan: () => void;
  onModeChange: (mode: TaskPlanPeriod) => void;
  onPlanTitleChange: (title: string) => void;
  planTitle: string;
}

export function PlannerCreatePlanPanel({
  createPending,
  mode,
  onCreatePlan,
  onModeChange,
  onPlanTitleChange,
  planTitle,
}: PlannerCreatePlanPanelProps) {
  const t = useTranslations('ws-task-plans');
  const periodOptions = TASK_PLAN_PERIODS.map((period) => ({
    value: period,
    label: t(`mode_${period}`),
  }));

  return (
    <div className="grid min-w-0 gap-2 md:grid-cols-[9rem_minmax(0,1fr)_auto]">
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
  );
}

interface PlannerEditPlanPanelProps {
  editMode: TaskPlanPeriod;
  editStatus: TaskPlanStatus;
  editTitle: string;
  onEditModeChange: (mode: TaskPlanPeriod) => void;
  onEditStatusChange: (status: TaskPlanStatus) => void;
  onEditTitleChange: (title: string) => void;
  onSavePlan: () => void;
  savePending: boolean;
}

export function PlannerEditPlanPanel({
  editMode,
  editStatus,
  editTitle,
  onEditModeChange,
  onEditStatusChange,
  onEditTitleChange,
  onSavePlan,
  savePending,
}: PlannerEditPlanPanelProps) {
  const t = useTranslations('ws-task-plans');
  const periodOptions = TASK_PLAN_PERIODS.map((period) => ({
    value: period,
    label: t(`mode_${period}`),
  }));
  const statusOptions = TASK_PLAN_STATUSES.map((status) => ({
    value: status,
    label: t(`plan_status_${status}`),
  }));

  return (
    <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_9rem_9rem_auto]">
      <Input
        value={editTitle}
        onChange={(event) => onEditTitleChange(event.target.value)}
        placeholder={t('plan_title_placeholder')}
        className="h-9 min-w-0"
      />
      <Combobox
        mode="single"
        options={periodOptions}
        selected={editMode}
        onChange={(value) => onEditModeChange(value as TaskPlanPeriod)}
        placeholder={t('mode_week')}
        searchPlaceholder={t('planner')}
        className="[&_button]:h-9"
      />
      <Combobox
        mode="single"
        options={statusOptions}
        selected={editStatus}
        onChange={(value) => onEditStatusChange(value as TaskPlanStatus)}
        placeholder={t('plan_status_draft')}
        searchPlaceholder={t('planner')}
        className="[&_button]:h-9"
      />
      <Button
        type="button"
        onClick={onSavePlan}
        disabled={savePending}
        size="sm"
        className="h-9 gap-2"
      >
        {savePending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {t('save_plan')}
      </Button>
    </div>
  );
}

export function PlannerPlanToolbar(props: PlannerPlanToolbarProps) {
  return (
    <div className="grid gap-3">
      <PlannerPlanBrowser {...props} />
      <PlannerCreatePlanPanel {...props} />
    </div>
  );
}

export { PlannerPlanBrowser };
