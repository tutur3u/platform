'use client';

import { useQuery } from '@tanstack/react-query';
import { Sparkles, Target, TrendingUp } from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { useWorkspaceMembers } from '@tuturuuu/ui/hooks/use-workspace-members';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { TaskDialogProvider } from '@tuturuuu/ui/tu-do/providers/task-dialog-provider';
import type { TaskFilters } from '@tuturuuu/ui/tu-do/boards/boardId/task-filter';
import type { ListStatusFilter } from '@tuturuuu/ui/tu-do/shared/board-header';
import type { ViewType } from '@tuturuuu/ui/tu-do/shared/board-views';
import { TaskDialogManager } from '@tuturuuu/ui/tu-do/shared/task-dialog-manager';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

import { OverviewTab, ProjectHeader, TasksTab, UpdatesTab } from './components';
import { ProjectOverviewProvider } from './components/project-overview-context';
import { LinkTaskDialog } from './dialogs';
import {
  useAnimationVariants,
  useProjectForm,
  useProjectUpdates,
  useTaskLinking,
} from './hooks';
import type { ActiveTab, TaskProjectDetailProps } from './types';

export function TaskProjectDetail({
  workspace,
  project,
  tasks,
  lists,
  currentUserId,
  wsId,
}: TaskProjectDetailProps) {
  const router = useRouter();
  const t = useTranslations('task_project_detail.tabs');

  // Animation variants
  const { fadeInUpVariant, fadeInViewVariant } = useAnimationVariants();

  // Project form state
  const projectForm = useProjectForm({ wsId, project });

  // Project updates
  const projectUpdates = useProjectUpdates({ wsId, projectId: project.id });

  // Task linking
  const taskLinking = useTaskLinking({
    wsId,
    projectId: project.id,
    linkedTasks: tasks,
  });

  // Workspace members
  const { data: workspaceMembers = [], isLoading: isLoadingMembers } =
    useWorkspaceMembers(wsId);

  // Virtual board ID for project-scoped task caching
  const projectBoardId = `project:${project.id}`;

  // Use TanStack Query for client-side task caching
  const { data: cachedTasks } = useQuery({
    queryKey: ['tasks', projectBoardId],
    queryFn: () => Promise.resolve(tasks),
    initialData: tasks,
    staleTime: Infinity,
  });

  // Handle task updates - refresh server data
  const handleUpdate = useCallback(() => {
    router.refresh();
  }, [router]);

  // Task management state
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [currentView, setCurrentView] = useState<ViewType>('kanban');
  const [filters, setFilters] = useState<TaskFilters>({
    labels: [],
    assignees: [],
    projects: [],
    priorities: [],
    dueDateRange: null,
    estimationRange: null,
    includeMyTasks: false,
    includeUnassigned: false,
  });
  const [listStatusFilter, setListStatusFilter] =
    useState<ListStatusFilter>('all');
  const [taskOverrides, setTaskOverrides] = useState<
    Record<string, Partial<Task>>
  >({});

  // Filter lists based on selected status filter
  const filteredLists = useMemo(() => {
    if (listStatusFilter === 'all') {
      return lists;
    }
    return lists.filter((list) => list.status === listStatusFilter);
  }, [lists, listStatusFilter]);

  // Filter tasks based on filters AND filtered lists
  const filteredTasks = useMemo(() => {
    const listIds = new Set(filteredLists.map((list) => list.id));
    const tasksToFilter = cachedTasks ?? tasks;
    let result = tasksToFilter.filter((task) => listIds.has(task.list_id));

    // Filter by labels
    if (filters.labels.length > 0) {
      result = result.filter((task) => {
        if (!task.labels || task.labels.length === 0) return false;
        return filters.labels.some((selectedLabel) =>
          task.labels?.some((taskLabel) => taskLabel.id === selectedLabel.id)
        );
      });
    }

    // Filter by assignees or "my tasks"
    if (filters.includeMyTasks && currentUserId) {
      result = result.filter((task) =>
        task.assignees?.some((a) => a.id === currentUserId)
      );
    } else if (filters.assignees.length > 0) {
      result = result.filter((task) =>
        task.assignees?.some((a) =>
          filters.assignees.some((fa) => fa.id === a.id)
        )
      );
    }

    // Filter by projects
    if (filters.projects.length > 0) {
      result = result.filter((task) => {
        if (!task.projects || task.projects.length === 0) return false;
        return task.projects.some((pt: { id: string }) =>
          filters.projects.some((p) => p.id === pt.id)
        );
      });
    }

    // Filter by priorities
    if (filters.priorities.length > 0) {
      result = result.filter((task) =>
        task.priority ? filters.priorities.includes(task.priority) : false
      );
    }

    // Filter by due date range
    if (filters.dueDateRange?.from) {
      result = result.filter((task) => {
        if (!task.end_date) return false;
        const taskDate = new Date(task.end_date);
        const fromDate = filters.dueDateRange!.from!;
        const toDate = filters.dueDateRange!.to;
        return taskDate >= fromDate && (!toDate || taskDate <= toDate);
      });
    }

    return result;
  }, [cachedTasks, tasks, filters, filteredLists, currentUserId]);

  // Apply optimistic overrides
  const effectiveTasks = useMemo(() => {
    if (!Object.keys(taskOverrides).length) return filteredTasks;
    return filteredTasks.map((t) => {
      const o = taskOverrides[t.id];
      return o ? ({ ...t, ...o } as Task) : t;
    });
  }, [filteredTasks, taskOverrides]);

  const handleTaskPartialUpdate = (taskId: string, partial: Partial<Task>) => {
    setTaskOverrides((prev) => ({
      ...prev,
      [taskId]: { ...(prev[taskId] || {}), ...partial },
    }));
  };

  return (
    <TaskDialogProvider
      onUpdate={handleUpdate}
      isPersonalWorkspace={workspace.personal}
    >
      <div className="relative flex h-full flex-col overflow-x-hidden">
        {/* Task Dialog Manager for centralized task editing */}
        <TaskDialogManager wsId={wsId} />

        {/* Background */}
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute top-0 -left-1/4 h-160 w-160 rounded-full bg-linear-to-br from-dynamic-purple/10 via-dynamic-pink/5 to-transparent blur-3xl" />
          <div className="absolute top-1/3 -right-1/4 h-160 w-160 rounded-full bg-linear-to-br from-dynamic-blue/10 via-dynamic-purple/5 to-transparent blur-3xl" />
        </div>

        {/* Header */}
        <ProjectHeader
          projectName={project.name}
          editedName={projectForm.editedName}
          setEditedName={projectForm.setEditedName}
          isEditingName={projectForm.isEditingName}
          setIsEditingName={projectForm.setIsEditingName}
          editedStatus={projectForm.editedStatus}
          editedHealthStatus={projectForm.editedHealthStatus}
          hasUnsavedChanges={projectForm.hasUnsavedChanges}
          isSaving={projectForm.isSaving}
          onSave={projectForm.saveProject}
          onCancel={projectForm.cancelEdits}
          fadeInUpVariant={fadeInUpVariant}
        />

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as ActiveTab)}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <TabsList className="mt-4 mb-2">
            <TabsTrigger value="overview" className="gap-2">
              <Sparkles className="h-4 w-4" />
              {t('overview')}
            </TabsTrigger>
            <TabsTrigger value="updates" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              {t('updates')}
            </TabsTrigger>
            <TabsTrigger value="tasks" className="gap-2">
              <Target className="h-4 w-4" />
              {t('tasks')} ({tasks.length})
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-0 flex-1 overflow-auto">
            <ProjectOverviewProvider
              value={{
                project,
                tasks,
                recentUpdates: projectUpdates.recentUpdates,
                isLoadingUpdates: projectUpdates.isLoadingUpdates,
                setActiveTab,
                setShowLinkTaskDialog: taskLinking.setShowLinkTaskDialog,
                editedDescription: projectForm.editedDescription,
                setEditedDescription: projectForm.setEditedDescription,
                isEditingDescription: projectForm.isEditingDescription,
                setIsEditingDescription: projectForm.setIsEditingDescription,
                showConfiguration: projectForm.showConfiguration,
                setShowConfiguration: projectForm.setShowConfiguration,
                editedStatus: projectForm.editedStatus,
                setEditedStatus: projectForm.setEditedStatus,
                editedPriority: projectForm.editedPriority,
                setEditedPriority: projectForm.setEditedPriority,
                editedHealthStatus: projectForm.editedHealthStatus,
                setEditedHealthStatus: projectForm.setEditedHealthStatus,
                editedLeadId: projectForm.editedLeadId,
                setEditedLeadId: projectForm.setEditedLeadId,
                editedStartDate: projectForm.editedStartDate,
                setEditedStartDate: projectForm.setEditedStartDate,
                editedEndDate: projectForm.editedEndDate,
                setEditedEndDate: projectForm.setEditedEndDate,
                editedArchived: projectForm.editedArchived,
                setEditedArchived: projectForm.setEditedArchived,
                showLeadSelector: projectForm.showLeadSelector,
                setShowLeadSelector: projectForm.setShowLeadSelector,
                showTimelineEditor: projectForm.showTimelineEditor,
                setShowTimelineEditor: projectForm.setShowTimelineEditor,
                workspaceMembers,
                isLoadingMembers,
                fadeInViewVariant,
              }}
            >
              <OverviewTab />
            </ProjectOverviewProvider>
          </TabsContent>

          {/* Updates Tab */}
          <TabsContent value="updates" className="mt-0 flex-1 overflow-auto">
            <UpdatesTab
              updates={projectUpdates.updates}
              isLoadingUpdates={projectUpdates.isLoadingUpdates}
              newUpdateContent={projectUpdates.newUpdateContent}
              setNewUpdateContent={projectUpdates.setNewUpdateContent}
              isPostingUpdate={projectUpdates.isPostingUpdate}
              postUpdate={projectUpdates.postUpdate}
              currentUserId={currentUserId}
              editingUpdateId={projectUpdates.editingUpdateId}
              editingUpdateContent={projectUpdates.editingUpdateContent}
              setEditingUpdateContent={projectUpdates.setEditingUpdateContent}
              isDeletingUpdateId={projectUpdates.isDeletingUpdateId}
              startEditingUpdate={projectUpdates.startEditingUpdate}
              deleteUpdate={projectUpdates.deleteUpdate}
              saveEditedUpdate={projectUpdates.saveEditedUpdate}
              cancelEditingUpdate={projectUpdates.cancelEditingUpdate}
              fadeInViewVariant={fadeInViewVariant}
            />
          </TabsContent>

          {/* Tasks Tab */}
          <TabsContent value="tasks" className="mt-0 flex-1 overflow-hidden">
            <TasksTab
              workspace={workspace}
              wsId={wsId}
              projectId={project.id}
              projectName={project.name}
              tasks={effectiveTasks}
              lists={filteredLists}
              currentUserId={currentUserId}
              currentView={currentView}
              setCurrentView={setCurrentView}
              filters={filters}
              setFilters={setFilters}
              listStatusFilter={listStatusFilter}
              setListStatusFilter={setListStatusFilter}
              setShowLinkTaskDialog={taskLinking.setShowLinkTaskDialog}
              onTaskPartialUpdate={handleTaskPartialUpdate}
            />
          </TabsContent>
        </Tabs>

        {/* Link Tasks Dialog */}
        <LinkTaskDialog
          open={taskLinking.showLinkTaskDialog}
          onOpenChange={taskLinking.setShowLinkTaskDialog}
          searchQuery={taskLinking.searchQuery}
          setSearchQuery={taskLinking.setSearchQuery}
          filteredTasks={taskLinking.filteredAvailableTasks}
          isLinking={taskLinking.isLinkingTask}
          onLinkTask={taskLinking.linkTaskToProject}
        />
      </div>
    </TaskDialogProvider>
  );
}
