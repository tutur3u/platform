'use client';

import { CalendarDays } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import { PlannerDigestPanel } from './planner-digest-panel';
import { PlannerItemStrip } from './planner-item-strip';
import {
  PlannerCreatePlanPanel,
  PlannerEditPlanPanel,
  PlannerPlanBrowser,
} from './planner-plan-toolbar';
import { PlannerSection } from './planner-section';
import { PlannerSharePanel } from './planner-share-dialog';
import { PlannerTargetControls } from './planner-target-controls';
import { useKanbanPlannerState } from './use-kanban-planner-state';

interface KanbanPlannerDialogProps {
  boardId: string | null;
  isPersonalWorkspace: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  workspaceId: string;
}

export function KanbanPlannerDialog({
  boardId,
  isPersonalWorkspace,
  onOpenChange,
  open,
  workspaceId,
}: KanbanPlannerDialogProps) {
  const t = useTranslations('ws-task-plans');
  const tCommon = useTranslations('common');
  const planner = useKanbanPlannerState({
    boardId,
    enabled: open,
    isPersonalWorkspace,
    workspaceId,
  });

  if (!isPersonalWorkspace) return null;

  const planCount = planner.plans.length;
  const itemCount = planner.selectedPlan?.items?.length ?? 0;
  const shareCount = planner.selectedPlan?.shares?.length ?? 0;
  const hasSelectedPlan = Boolean(planner.selectedPlan);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(88dvh,720px)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            {t('planner')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('planner')}
          </DialogDescription>
        </DialogHeader>

        {planner.schemaUnavailable ? (
          <div className="rounded-md border border-dashed p-3 text-muted-foreground text-sm">
            {t('schema_unavailable')}
          </div>
        ) : (
          <div className="space-y-2">
            <PlannerSection
              title={t('plan_browser')}
              defaultOpen
              badge={
                <Badge variant="secondary">
                  {planner.plansQuery.isLoading ? t('loading') : planCount}
                </Badge>
              }
            >
              <PlannerPlanBrowser
                onSelectedPlanChange={planner.setSelectedPlanId}
                plans={planner.plans}
                plansLoading={planner.plansQuery.isLoading}
                selectedPlan={planner.selectedPlan}
              />
            </PlannerSection>

            <PlannerSection title={t('new_plan')}>
              <PlannerCreatePlanPanel
                createPending={planner.createPlanMutation.isPending}
                mode={planner.mode}
                onCreatePlan={() => planner.createPlanMutation.mutate()}
                onModeChange={planner.setMode}
                onPlanTitleChange={planner.setPlanTitle}
                planTitle={planner.planTitle}
              />
            </PlannerSection>

            <PlannerSection title={t('edit_plan')} disabled={!hasSelectedPlan}>
              {planner.selectedPlan && (
                <PlannerEditPlanPanel
                  editMode={planner.editMode}
                  editStatus={planner.editStatus}
                  editTitle={planner.editTitle}
                  onEditModeChange={planner.setEditMode}
                  onEditStatusChange={planner.setEditStatus}
                  onEditTitleChange={planner.setEditTitle}
                  onSavePlan={() => planner.updatePlanMutation.mutate()}
                  savePending={planner.updatePlanMutation.isPending}
                />
              )}
            </PlannerSection>

            <PlannerSection
              title={t('target_workspace')}
              disabled={!hasSelectedPlan}
              badge={
                hasSelectedPlan && planner.targetIsIntended ? (
                  <Badge variant="secondary">{t('intended_workspace')}</Badge>
                ) : null
              }
            >
              {planner.selectedPlan && (
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
              )}
            </PlannerSection>

            <PlannerSection
              title={t('planned_tasks')}
              disabled={!hasSelectedPlan}
              badge={<Badge variant="secondary">{itemCount}</Badge>}
            >
              {planner.selectedPlan && (
                <PlannerItemStrip
                  personalWorkspaceId={workspaceId}
                  plan={planner.selectedPlan}
                  plansLoading={planner.plansQuery.isLoading}
                />
              )}
            </PlannerSection>

            <PlannerSection title={t('digest')} disabled={!hasSelectedPlan}>
              {planner.selectedPlan && (
                <PlannerDigestPanel
                  plan={planner.selectedPlan}
                  workspaceId={workspaceId}
                />
              )}
            </PlannerSection>

            <PlannerSection
              title={t('share_plan')}
              disabled={!hasSelectedPlan}
              badge={<Badge variant="secondary">{shareCount}</Badge>}
            >
              {planner.selectedPlan && (
                <PlannerSharePanel
                  onShared={planner.invalidatePlans}
                  plan={planner.selectedPlan}
                  workspaceId={workspaceId}
                  targetWorkspaceId={
                    planner.targetIsIntended ? planner.targetWorkspaceId : null
                  }
                  targetWorkspaceName={planner.targetWorkspace?.name ?? null}
                />
              )}
            </PlannerSection>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
