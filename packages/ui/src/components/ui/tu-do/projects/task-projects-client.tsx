'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { useTasksHref } from '../tasks-route-context';
import {
  ProjectGridCard,
  ProjectListItem,
  ProjectsEmptyState,
  ProjectsLoadingState,
  ProjectsToolbar,
} from './components';
import {
  CreateProjectDialog,
  EditProjectDialog,
  ManageTasksDialog,
} from './dialogs';
import { useProjectFilters, useTaskProjects } from './hooks';
import type { TaskProject, TaskProjectsClientProps } from './types';

export function TaskProjectsClient({
  wsId,
  initialProjects,
}: TaskProjectsClientProps) {
  const router = useRouter();
  const tasksHref = useTasksHref();

  // Dialog state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<TaskProject | null>(
    null
  );
  const [managingProject, setManagingProject] = useState<TaskProject | null>(
    null
  );

  // Custom hooks
  const taskProjects = useTaskProjects({
    wsId,
    initialProjects,
    managingProject,
  });

  const filters = useProjectFilters(taskProjects.projects);

  const stats = useMemo(
    () =>
      taskProjects.projects.reduce(
        (acc, project) => {
          acc.totalProjects += 1;
          acc.linkedTasks += project.linkedTasks.length;
          acc.linkedDocuments += project.linkedDocuments.length;
          acc.completedTasks += project.completedTasksCount;
          if (!['completed', 'cancelled'].includes(project.status ?? '')) {
            acc.activeProjects += 1;
          }
          if (
            project.health_status === 'at_risk' ||
            project.health_status === 'off_track'
          ) {
            acc.atRiskProjects += 1;
          }
          return acc;
        },
        {
          totalProjects: 0,
          activeProjects: 0,
          linkedTasks: 0,
          linkedDocuments: 0,
          completedTasks: 0,
          atRiskProjects: 0,
        }
      ),
    [taskProjects.projects]
  );

  // Handlers
  const handleEditProject = (project: TaskProject) => {
    setEditingProject(project);
    setIsEditDialogOpen(true);
  };

  const handleUpdateProject = (data: {
    name: string;
    description?: string;
  }) => {
    if (!editingProject) return;
    taskProjects.updateProject({
      projectId: editingProject.id,
      ...data,
    });
    setIsEditDialogOpen(false);
    setEditingProject(null);
  };

  const handleOpenManageTasks = (project: TaskProject) => {
    setManagingProject(project);
  };

  const handleCloseManageTasks = () => {
    setManagingProject(null);
  };

  const handleLinkTask = (taskId: string) => {
    if (!managingProject) return;
    taskProjects.linkTask({
      projectId: managingProject.id,
      taskId,
    });
  };

  const handleUnlinkTask = (taskId: string) => {
    if (!managingProject) return;
    taskProjects.unlinkTask({
      projectId: managingProject.id,
      taskId,
    });
  };

  const navigateToProject = useCallback(
    (projectId: string) => {
      router.push(`/${wsId}${tasksHref(`/projects/${projectId}`)}`);
    },
    [router, wsId, tasksHref]
  );

  return (
    <>
      <ProjectsToolbar
        viewMode={filters.viewMode}
        setViewMode={filters.setViewMode}
        sortBy={filters.sortBy}
        setSortBy={filters.setSortBy}
        sortOrder={filters.sortOrder}
        setSortOrder={filters.setSortOrder}
        searchQuery={filters.searchQuery}
        setSearchQuery={filters.setSearchQuery}
        statusFilter={filters.statusFilter}
        setStatusFilter={filters.setStatusFilter}
        priorityFilter={filters.priorityFilter}
        setPriorityFilter={filters.setPriorityFilter}
        healthFilter={filters.healthFilter}
        setHealthFilter={filters.setHealthFilter}
        hasActiveFilters={filters.hasActiveFilters}
        clearFilters={filters.clearFilters}
        projectCount={taskProjects.projects.length}
        filteredCount={filters.filteredProjects.length}
        stats={stats}
        onCreateClick={() => setIsCreateDialogOpen(true)}
      />

      {taskProjects.projectsLoading ? (
        <ProjectsLoadingState />
      ) : filters.filteredProjects.length === 0 ? (
        <ProjectsEmptyState
          hasFilters={filters.hasActiveFilters || !!filters.searchQuery}
          onCreateClick={() => setIsCreateDialogOpen(true)}
        />
      ) : filters.viewMode === 'list' ? (
        <div className="space-y-3">
          {filters.filteredProjects.map((project) => (
            <ProjectListItem
              key={project.id}
              project={project}
              wsId={wsId}
              onEdit={handleEditProject}
              onDelete={taskProjects.deleteProject}
              onManageTasks={handleOpenManageTasks}
              onNavigate={navigateToProject}
              isUpdating={taskProjects.isUpdating}
              isDeleting={taskProjects.isDeleting}
              isLinking={taskProjects.isLinking}
              isUnlinking={taskProjects.isUnlinking}
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filters.filteredProjects.map((project) => (
            <ProjectGridCard
              key={project.id}
              project={project}
              wsId={wsId}
              onEdit={handleEditProject}
              onDelete={taskProjects.deleteProject}
              onManageTasks={handleOpenManageTasks}
              onNavigate={navigateToProject}
              isUpdating={taskProjects.isUpdating}
              isDeleting={taskProjects.isDeleting}
              isLinking={taskProjects.isLinking}
              isUnlinking={taskProjects.isUnlinking}
            />
          ))}
        </div>
      )}

      <CreateProjectDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSubmit={taskProjects.createProject}
        isCreating={taskProjects.isCreating}
      />

      <EditProjectDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        project={editingProject}
        onSubmit={handleUpdateProject}
        isUpdating={taskProjects.isUpdating}
      />

      <ManageTasksDialog
        project={managingProject}
        onClose={handleCloseManageTasks}
        availableTaskOptions={taskProjects.availableTaskOptions}
        tasksLoading={taskProjects.tasksLoading}
        tasksError={taskProjects.tasksError}
        onLinkTask={handleLinkTask}
        onUnlinkTask={handleUnlinkTask}
        isLinking={taskProjects.isLinking}
        isUnlinking={taskProjects.isUnlinking}
      />
    </>
  );
}
