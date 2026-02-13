'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogTitle } from '@tuturuuu/ui/dialog';
import { useUserConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { TaskNewLabelDialog } from '@tuturuuu/ui/tu-do/boards/boardId/task-dialogs/TaskNewLabelDialog';
import { TaskNewProjectDialog } from '@tuturuuu/ui/tu-do/boards/boardId/task-dialogs/TaskNewProjectDialog';
import { TaskBoardForm } from '@tuturuuu/ui/tu-do/boards/form';
import { CreateListDialog } from '@tuturuuu/ui/tu-do/shared/create-list-dialog';
import type React from 'react';
import { AiCreditIndicator } from './ai-credit-indicator';
import { BoardSelectorDialog } from './board-selector-dialog';
import { CommandBar } from './command-bar';
import { MyTasksFilters } from './my-tasks-filters';
import { MyTasksHeader } from './my-tasks-header';
import TaskList from './task-list';
import { TaskPreviewDialog } from './task-preview-dialog';
import { useMyTasksState } from './use-my-tasks-state';

interface MyTasksContentProps {
  wsId: string;
  isPersonal: boolean;
}

export default function MyTasksContent({
  wsId,
  isPersonal,
}: MyTasksContentProps) {
  const queryClient = useQueryClient();
  const { data: submitShortcut } = useUserConfig(
    'TASK_SUBMIT_SHORTCUT',
    'enter'
  );
  const state = useMyTasksState({
    wsId,
    isPersonal,
  });

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header with greeting + summary cards */}
      <MyTasksHeader
        overdueCount={state.filteredTasks.overdueTasks?.length ?? 0}
        todayCount={state.filteredTasks.todayTasks?.length ?? 0}
        upcomingCount={state.filteredTasks.upcomingTasks?.length ?? 0}
      />

      {/* Command Bar */}
      <div className="mx-auto max-w-5xl">
        <CommandBar
          value={state.commandBarInput}
          onValueChange={state.setCommandBarInput}
          onCreateTask={state.handleCreateTask}
          onGenerateAI={state.handleGenerateAI}
          onOpenBoardSelector={(title, isAi) => {
            if (title) {
              state.setPendingTaskTitle(title);
              state.setTaskCreatorMode(isAi ? 'ai' : 'simple');
            } else {
              state.setPendingTaskTitle('');
              state.setTaskCreatorMode(null);
            }
            state.setBoardSelectorOpen(true);
          }}
          selectedDestination={state.selectedDestination}
          onClearDestination={state.handleClearDestination}
          isLoading={state.commandBarLoading || state.previewMutation.isPending}
          aiGenerateDescriptions={state.aiGenerateDescriptions}
          aiGeneratePriority={state.aiGeneratePriority}
          aiGenerateLabels={state.aiGenerateLabels}
          onAiGenerateDescriptionsChange={state.setAiGenerateDescriptions}
          onAiGeneratePriorityChange={state.setAiGeneratePriority}
          onAiGenerateLabelsChange={state.setAiGenerateLabels}
          workspaceLabels={state.workspaceLabels}
          workspaceProjects={state.workspaceProjects}
          workspaceMembers={state.workspaceMembers}
          workspaceEstimationConfig={
            state.boardConfig
              ? {
                  estimation_type: state.boardConfig.estimation_type,
                  extended_estimation: state.boardConfig.extended_estimation,
                  allow_zero_estimates: state.boardConfig.allow_zero_estimates,
                }
              : null
          }
          wsId={wsId}
          onCreateNewLabel={() => state.setNewLabelDialogOpen(true)}
          onCreateNewProject={() => state.setNewProjectDialogOpen(true)}
        />
        <div className="mt-2 flex items-center justify-end">
          <AiCreditIndicator />
        </div>
      </div>

      {/* Filters (personal workspace only) */}
      {isPersonal && (
        <MyTasksFilters
          workspacesData={(state.workspacesData || []).map((ws) => ({
            ...ws,
            name: ws.name || 'Unnamed Workspace',
          }))}
          allBoardsData={(state.allBoardsData || []).map((board) => ({
            ...board,
            name: board.name || 'Unnamed Board',
          }))}
          taskFilters={state.taskFilters}
          setTaskFilters={state.setTaskFilters}
          availableLabels={state.availableLabels}
          availableProjects={state.availableProjects}
          workspaceLabels={state.workspaceLabels}
          workspaceProjects={state.workspaceProjects}
          onFilterChange={state.handleFilterChange}
          onLabelFilterChange={state.handleLabelFilterChange}
          onProjectFilterChange={state.handleProjectFilterChange}
          onCreateNewBoard={() => {
            state.setNewBoardName('');
            state.setNewBoardDialogOpen(true);
          }}
        />
      )}

      {/* Task Sections */}
      <TaskList
        wsId={wsId}
        isPersonal={isPersonal}
        commandBarLoading={
          state.commandBarLoading || state.previewMutation.isPending
        }
        isAiGenerating={state.previewMutation.isPending}
        queryLoading={state.queryLoading}
        overdueTasks={state.filteredTasks.overdueTasks}
        todayTasks={state.filteredTasks.todayTasks}
        upcomingTasks={state.filteredTasks.upcomingTasks}
        completedTasks={state.completedTasks}
        totalActiveTasks={state.queryData?.totalActiveTasks ?? 0}
        totalCompletedTasks={state.totalCompletedTasks}
        hasMoreCompleted={state.hasMoreCompleted}
        isFetchingMoreCompleted={state.isFetchingMoreCompleted}
        onFetchMoreCompleted={state.fetchMoreCompleted}
        collapsedSections={state.collapsedSections}
        toggleSection={state.toggleSection}
        handleUpdate={state.handleUpdate}
      />

      {/* Board & List Selection Dialog */}
      <BoardSelectorDialog
        open={state.boardSelectorOpen}
        onOpenChange={state.setBoardSelectorOpen}
        isPersonal={isPersonal}
        workspacesData={state.workspacesData}
        selectedWorkspaceId={state.selectedWorkspaceId}
        onWorkspaceChange={state.setSelectedWorkspaceId}
        boardsData={state.boardsData}
        boardsLoading={state.boardsLoading}
        selectedBoardId={state.selectedBoardId}
        onBoardChange={state.setSelectedBoardId}
        availableLists={state.availableLists}
        selectedListId={state.selectedListId}
        onListChange={state.setSelectedListId}
        taskCreatorMode={state.taskCreatorMode}
        aiFlowStep={state.aiFlowStep}
        onConfirm={state.handleBoardSelectorConfirm}
        onCreateBoard={(name) => {
          state.setNewBoardName(name);
          state.setNewBoardDialogOpen(true);
        }}
        onCreateList={(name) => {
          state.setNewListName(name);
          state.setNewListDialogOpen(true);
        }}
        submitShortcut={(submitShortcut as 'enter' | 'cmd_enter') ?? 'enter'}
      />

      {/* Board Creation Dialog */}
      <Dialog
        open={state.newBoardDialogOpen}
        onOpenChange={state.setNewBoardDialogOpen}
      >
        <DialogContent
          className="p-0"
          style={{ maxWidth: '1200px', width: '85vw' } as React.CSSProperties}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogTitle className="sr-only">Create New Board</DialogTitle>
          <TaskBoardForm
            wsId={state.selectedWorkspaceId}
            data={{ name: state.newBoardName }}
            onFinish={(formData) => {
              state.setNewBoardDialogOpen(false);
              state.setNewBoardName('');
              if (formData?.id) state.setSelectedBoardId(formData.id);
              queryClient.invalidateQueries({
                queryKey: [
                  'workspace',
                  state.selectedWorkspaceId,
                  'boards-with-lists',
                ],
              });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* List Creation Dialog */}
      {state.selectedBoardId && (
        <CreateListDialog
          open={state.newListDialogOpen}
          onOpenChange={state.setNewListDialogOpen}
          boardId={state.selectedBoardId}
          wsId={state.selectedWorkspaceId}
          initialName={state.newListName}
          onSuccess={(listId) => {
            state.setSelectedListId(listId);
            state.setNewListName('');
          }}
        />
      )}

      {/* AI Preview Dialog */}
      <TaskPreviewDialog
        open={state.previewOpen}
        onOpenChange={state.setPreviewOpen}
        previewEntry={state.previewEntry}
        pendingTaskTitle={state.pendingTaskTitle}
        lastResult={state.lastResult}
        workspaceLabels={state.workspaceLabels}
        workspaceProjects={state.workspaceProjects}
        boardConfig={state.boardConfig}
        aiGenerateDescriptions={state.aiGenerateDescriptions}
        aiGeneratePriority={state.aiGeneratePriority}
        aiGenerateLabels={state.aiGenerateLabels}
        clientTimezone={
          Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
        }
        selectedLabelIds={state.selectedLabelIds}
        setSelectedLabelIds={state.setSelectedLabelIds}
        currentPreviewIndex={state.currentPreviewIndex}
        setCurrentPreviewIndex={state.setCurrentPreviewIndex}
        onConfirmReview={state.handleConfirmReview}
        isCreating={state.createTasksMutation.isPending}
        submitShortcut={(submitShortcut as 'enter' | 'cmd_enter') ?? 'enter'}
      />

      {/* Label Creation Dialog */}
      <TaskNewLabelDialog
        open={state.newLabelDialogOpen}
        newLabelName={state.newLabelName}
        newLabelColor={state.newLabelColor}
        creatingLabel={state.creatingLabel}
        onOpenChange={state.setNewLabelDialogOpen}
        onNameChange={state.setNewLabelName}
        onColorChange={state.setNewLabelColor}
        onConfirm={state.handleCreateNewLabel}
      />

      {/* Project Creation Dialog */}
      <TaskNewProjectDialog
        open={state.newProjectDialogOpen}
        newProjectName={state.newProjectName}
        creatingProject={state.creatingProject}
        onOpenChange={state.setNewProjectDialogOpen}
        onNameChange={state.setNewProjectName}
        onConfirm={state.handleCreateNewProject}
      />
    </div>
  );
}
