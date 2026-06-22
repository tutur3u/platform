'use client';

import { CalendarDays, ChevronDown, ChevronUp } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PlannerDigestPanel } from './planner-digest-panel';
import { PlannerItemStrip } from './planner-item-strip';
import { PlannerPlanToolbar } from './planner-plan-toolbar';
import { PlannerShareDialog } from './planner-share-dialog';
import { PlannerTargetControls } from './planner-target-controls';
import { useKanbanPlannerState } from './use-kanban-planner-state';

interface KanbanPlannerIslandProps {
  boardId: string | null;
  isPersonalWorkspace: boolean;
  workspaceId: string;
}

export function KanbanPlannerIsland({
  boardId,
  isPersonalWorkspace,
  workspaceId,
}: KanbanPlannerIslandProps) {
  const t = useTranslations('ws-task-plans');
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const planner = useKanbanPlannerState({
    boardId,
    isPersonalWorkspace,
    workspaceId,
  });

  if (!isPersonalWorkspace) return null;
  if (planner.schemaUnavailable) {
    return (
      <div className="border-b bg-background/95 px-3 py-1.5">
        <Button disabled variant="outline" size="sm" className="h-7 gap-2">
          <CalendarDays className="h-4 w-4" />
          {t('schema_unavailable')}
        </Button>
      </div>
    );
  }

  const compactPlanLabel = planner.plansQuery.isLoading
    ? t('loading')
    : (planner.selectedPlan?.title ?? t('no_plans'));

  return (
    <div
      className="border-b bg-background/95 px-3 py-1.5"
      data-testid="kanban-planner-island"
    >
      <div className="flex min-h-8 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="font-medium">{t('planner')}</span>
          <span className="min-w-0 truncate text-muted-foreground">
            {compactPlanLabel}
          </span>
        </div>
        <Button
          type="button"
          variant={plannerOpen ? 'secondary' : 'outline'}
          size="sm"
          className="h-7 shrink-0 gap-1.5 px-2"
          aria-pressed={plannerOpen}
          data-testid="kanban-planner-toggle"
          onClick={() => setPlannerOpen((open) => !open)}
        >
          {plannerOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          {plannerOpen ? t('close_planner') : t('open_planner')}
        </Button>
      </div>

      {plannerOpen && (
        <div className="mt-2 space-y-2">
          <PlannerPlanToolbar
            createPending={planner.createPlanMutation.isPending}
            mode={planner.mode}
            onCreatePlan={() => planner.createPlanMutation.mutate()}
            onModeChange={planner.setMode}
            onPlanTitleChange={planner.setPlanTitle}
            onSelectedPlanChange={planner.setSelectedPlanId}
            onSharePlan={() => setShareOpen(true)}
            planTitle={planner.planTitle}
            plans={planner.plans}
            plansLoading={planner.plansQuery.isLoading}
            selectedPlan={planner.selectedPlan}
          />

          {planner.selectedPlan && (
            <>
              <PlannerTargetControls
                addWorkspacePending={planner.addWorkspaceMutation.isPending}
                boards={planner.boards}
                createItemPending={planner.createItemMutation.isPending}
                lists={planner.lists}
                onAddWorkspace={() => planner.addWorkspaceMutation.mutate()}
                onCreateItem={() => planner.createItemMutation.mutate()}
                onPlannedDateChange={planner.setPlannedDate}
                onTargetBoardChange={planner.setTargetBoardId}
                onTargetListChange={planner.setTargetListId}
                onTargetWorkspaceChange={planner.setTargetWorkspaceId}
                onTaskTitleChange={planner.setTaskTitle}
                plannedDate={planner.plannedDate}
                targetBoardId={planner.targetBoardId}
                targetIsIntended={planner.targetIsIntended}
                targetListId={planner.targetListId}
                targetWorkspaceId={planner.targetWorkspaceId}
                taskTitle={planner.taskTitle}
                workspaces={planner.workspaces}
              />

              <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_22rem]">
                <PlannerItemStrip
                  personalWorkspaceId={workspaceId}
                  plan={planner.selectedPlan}
                  plansLoading={planner.plansQuery.isLoading}
                />
                <PlannerDigestPanel
                  plan={planner.selectedPlan}
                  workspaceId={workspaceId}
                />
              </div>

              <PlannerShareDialog
                open={shareOpen}
                onOpenChange={setShareOpen}
                onShared={planner.invalidatePlans}
                plan={planner.selectedPlan}
                workspaceId={workspaceId}
                targetWorkspaceId={
                  planner.targetIsIntended ? planner.targetWorkspaceId : null
                }
                targetWorkspaceName={planner.targetWorkspace?.name ?? null}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
