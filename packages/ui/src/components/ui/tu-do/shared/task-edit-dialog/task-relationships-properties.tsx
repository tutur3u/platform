'use client';

import {
  ArrowUpCircle,
  Ban,
  ChevronDown,
  Link2,
  ListTree,
  Loader2,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { TabButton } from './relationships/components/tab-button';
import { DependenciesSection } from './relationships/dependencies-section';
import { ParentSection } from './relationships/parent-section';
import { RelatedSection } from './relationships/related-section';
import { SubtasksSection } from './relationships/subtasks-section';
import type {
  RelationshipTab,
  TaskRelationshipsPropertiesProps,
} from './relationships/types/task-relationships.types';

export function TaskRelationshipsProperties({
  wsId,
  taskId,
  boardId,
  listId,
  initialActiveTab,
  initialDependencySubTab,
  parentTask,
  childTasks,
  blockingTasks,
  blockedByTasks,
  relatedTasks,
  isLoading,
  onSetParent,
  onRemoveParent,
  onAddBlockingTask,
  onRemoveBlockingTask,
  onAddBlockedByTask,
  onRemoveBlockedByTask,
  onAddRelatedTask,
  onRemoveRelatedTask,
  onNavigateToTask,
  onAddSubtask,
  onAddParentTask,
  onAddBlockingTaskDialog,
  onAddBlockedByTaskDialog,
  onAddRelatedTaskDialog,
  onAddExistingAsSubtask,
  isSaving,
  savingTaskId,
  disabled,
}: TaskRelationshipsPropertiesProps) {
  const t = useTranslations();
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<RelationshipTab>(
    initialActiveTab ?? 'parent'
  );

  // Tab configuration
  const tabs = React.useMemo(
    () => [
      {
        id: 'parent' as const,
        label: t('ws-task-boards.dialog.parent'),
        icon: <ArrowUpCircle className="h-3.5 w-3.5" />,
        count: parentTask ? 1 : 0,
        color: 'purple' as const,
      },
      {
        id: 'subtasks' as const,
        label: t('ws-task-boards.dialog.sub_tasks'),
        icon: <ListTree className="h-3.5 w-3.5" />,
        count: childTasks.length,
        color: 'green' as const,
      },
      {
        id: 'dependencies' as const,
        label: t('ws-task-boards.dialog.dependencies'),
        icon: <Ban className="h-3.5 w-3.5" />,
        count: blockingTasks.length + blockedByTasks.length,
        color: 'red' as const,
      },
      {
        id: 'related' as const,
        label: t('ws-task-boards.dialog.related'),
        icon: <Link2 className="h-3.5 w-3.5" />,
        count: relatedTasks.length,
        color: 'blue' as const,
      },
    ],
    [
      parentTask,
      childTasks.length,
      blockingTasks.length,
      blockedByTasks.length,
      relatedTasks.length,
      t,
    ]
  );

  // Count totals for summary (derived from tabs)
  const totalCount = tabs.reduce((sum, tab) => sum + tab.count, 0);
  const dependencyCount = blockingTasks.length + blockedByTasks.length;

  return (
    <div className="border-b bg-linear-to-b from-muted/30 via-muted/15 to-transparent">
      {/* Header with toggle button */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-background/40 md:px-8"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
              !isExpanded && '-rotate-90'
            )}
          />
          <span className="shrink-0 font-semibold text-foreground text-sm">
            {t('ws-task-boards.dialog.relationships')}
          </span>

          {/* Summary badges when collapsed */}
          {!isExpanded && totalCount > 0 && (
            <div className="ml-2 flex items-center gap-1.5">
              {parentTask && (
                <Badge
                  variant="secondary"
                  className="h-5 shrink-0 gap-1 rounded-full border border-dynamic-purple/30 bg-dynamic-purple/10 px-2 font-medium text-[10px] text-dynamic-purple"
                >
                  <ArrowUpCircle className="h-2.5 w-2.5" />
                  {t('ws-task-boards.dialog.parent')}
                  <span className="rounded-full bg-background/80 px-1.5 py-0.5 leading-none">
                    1
                  </span>
                </Badge>
              )}
              {childTasks.length > 0 && (
                <Badge
                  variant="secondary"
                  className="h-5 shrink-0 gap-1 rounded-full border border-dynamic-green/30 bg-dynamic-green/10 px-2 font-medium text-[10px] text-dynamic-green"
                >
                  <ListTree className="h-2.5 w-2.5" />
                  {childTasks.length}
                </Badge>
              )}
              {dependencyCount > 0 && (
                <Badge
                  variant="secondary"
                  className="h-5 shrink-0 gap-1 rounded-full border border-dynamic-red/30 bg-dynamic-red/10 px-2 font-medium text-[10px] text-dynamic-red"
                >
                  <Ban className="h-2.5 w-2.5" />
                  {dependencyCount}
                </Badge>
              )}
              {relatedTasks.length > 0 && (
                <Badge
                  variant="secondary"
                  className="h-5 shrink-0 gap-1 rounded-full border border-dynamic-blue/30 bg-dynamic-blue/10 px-2 font-medium text-[10px] text-dynamic-blue"
                >
                  <Link2 className="h-2.5 w-2.5" />
                  {relatedTasks.length}
                </Badge>
              )}
            </div>
          )}
        </div>

        {isLoading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="space-y-3 px-4 pb-4 md:px-8">
          {/* Tab navigation */}
          <div className="flex gap-2 overflow-x-auto rounded-full border border-border/60 bg-muted/15 p-1">
            {tabs.map((tab) => (
              <TabButton
                key={tab.id}
                active={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                icon={tab.icon}
                label={tab.label}
                count={tab.count}
                color={tab.color}
              />
            ))}
          </div>

          {/* Tab content */}
          <div className="min-h-30 rounded-2xl border border-border/60 bg-background/70 p-3 md:p-4">
            {activeTab === 'parent' && (
              <ParentSection
                wsId={wsId}
                taskId={taskId}
                parentTask={parentTask}
                childTaskIds={childTasks.map((t) => t.id)}
                isSaving={isSaving}
                savingTaskId={savingTaskId}
                onSetParent={onSetParent}
                onRemoveParent={onRemoveParent}
                onNavigateToTask={onNavigateToTask}
                onAddParentTask={onAddParentTask}
                disabled={disabled}
              />
            )}

            {activeTab === 'subtasks' && (
              <SubtasksSection
                wsId={wsId}
                taskId={taskId}
                boardId={boardId}
                listId={listId}
                parentTaskId={parentTask?.id ?? null}
                childTasks={childTasks}
                onNavigateToTask={onNavigateToTask}
                onAddSubtask={onAddSubtask}
                onAddExistingAsSubtask={onAddExistingAsSubtask}
                isSaving={isSaving}
                disabled={disabled}
              />
            )}

            {activeTab === 'dependencies' && (
              <DependenciesSection
                wsId={wsId}
                taskId={taskId}
                initialSubTab={initialDependencySubTab}
                blockingTasks={blockingTasks}
                blockedByTasks={blockedByTasks}
                isSaving={isSaving}
                savingTaskId={savingTaskId}
                onAddBlocking={onAddBlockingTask}
                onRemoveBlocking={onRemoveBlockingTask}
                onAddBlockedBy={onAddBlockedByTask}
                onRemoveBlockedBy={onRemoveBlockedByTask}
                onNavigateToTask={onNavigateToTask}
                onAddBlockingTaskDialog={onAddBlockingTaskDialog}
                onAddBlockedByTaskDialog={onAddBlockedByTaskDialog}
                disabled={disabled}
              />
            )}

            {activeTab === 'related' && (
              <RelatedSection
                wsId={wsId}
                taskId={taskId}
                relatedTasks={relatedTasks}
                isSaving={isSaving}
                savingTaskId={savingTaskId}
                onAddRelated={onAddRelatedTask}
                onRemoveRelated={onRemoveRelatedTask}
                onNavigateToTask={onNavigateToTask}
                onAddRelatedTaskDialog={onAddRelatedTaskDialog}
                disabled={disabled}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Re-export types for backward compatibility
export type { TaskRelationshipsPropertiesProps } from './relationships/types/task-relationships.types';
