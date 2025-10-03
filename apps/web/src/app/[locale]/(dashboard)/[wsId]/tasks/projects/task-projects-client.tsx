'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  Archive,
  Calendar,
  Edit3,
  ExternalLink,
  Link,
  Loader2,
  MoreVertical,
  Plus,
  Trash2,
  User,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import NextLink from 'next/link';
import { useEffect, useMemo, useState } from 'react';

interface LinkedTask {
  id: string;
  name: string;
  completed: boolean | null;
  listName: string | null;
}

interface TaskProject {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  creator_id: string;
  creator?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  tasksCount: number;
  linkedTasks: LinkedTask[];
}

interface TaskProjectsClientProps {
  wsId: string;
  initialProjects: TaskProject[];
  currentUserId: string;
}

interface TaskOption {
  id: string;
  name: string;
  completed: boolean | null;
  listName: string | null;
}

export function TaskProjectsClient({
  wsId,
  initialProjects,
}: TaskProjectsClientProps) {
  const t = useTranslations('dashboard.bucket_dump');

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<TaskProject | null>(
    null
  );
  const [managingProject, setManagingProject] = useState<TaskProject | null>(
    null
  );

  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectDescription, setEditProjectDescription] = useState('');
  const [taskToLink, setTaskToLink] = useState('');

  const {
    data: projects = initialProjects,
    isLoading: projectsLoading,
    refetch: refetchProjects,
  } = useQuery<TaskProject[]>({
    queryKey: ['workspace', wsId, 'task-projects'],
    queryFn: async () => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/task-projects`);
      if (!response.ok) {
        throw new Error(t('errors.fetch_projects'));
      }
      return response.json();
    },
    initialData: initialProjects,
  });

  const {
    data: availableTaskOptions = [],
    isLoading: tasksLoading,
    error: tasksError,
  } = useQuery<TaskOption[]>({
    queryKey: ['workspace', wsId, 'tasks-for-projects'],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/tasks?limit=200`
      );
      if (!response.ok) {
        throw new Error(t('errors.fetch_tasks'));
      }

      const payload = await response.json();
      const rawTasks = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.tasks)
          ? payload.tasks
          : [];

      return rawTasks
        .map((task: Record<string, unknown>) => ({
          id: String(task.id ?? ''),
          name:
            typeof task.name === 'string' && task.name.trim().length > 0
              ? task.name
              : 'Untitled task',
          completed:
            typeof task.completed === 'boolean' ? task.completed : null,
          listName: typeof task.list_name === 'string' ? task.list_name : null,
        }))
        .filter((task: TaskOption) => Boolean(task.id));
    },
    enabled: Boolean(managingProject),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!managingProject) {
      return;
    }
    const updated = projects.find(
      (project) => project.id === managingProject.id
    );
    if (updated && updated !== managingProject) {
      setManagingProject(updated);
    }
  }, [projects, managingProject]);

  useEffect(() => {
    if (availableTaskOptions.length === 0) {
      setTaskToLink('');
    }
  }, [availableTaskOptions.length]);

  const createProjectMutation = useMutation({
    mutationFn: async ({
      name,
      description,
    }: {
      name: string;
      description?: string;
    }) => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/task-projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t('errors.create_project'));
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success(t('success.project_created'));
      setIsCreateDialogOpen(false);
      setNewProjectName('');
      setNewProjectDescription('');
      refetchProjects();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('errors.create_project'));
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: async ({
      projectId,
      name,
      description,
    }: {
      projectId: string;
      name: string;
      description?: string;
    }) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-projects/${projectId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t('errors.update_project'));
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success(t('success.project_updated'));
      setIsEditDialogOpen(false);
      setEditingProject(null);
      setEditProjectName('');
      setEditProjectDescription('');
      refetchProjects();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('errors.update_project'));
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-projects/${projectId}`,
        {
          method: 'DELETE',
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t('errors.delete_project'));
      }
    },
    onSuccess: () => {
      toast.success(t('success.project_deleted'));
      refetchProjects();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('errors.delete_project'));
    },
  });

  const linkTaskMutation = useMutation({
    mutationFn: async ({
      projectId,
      taskId,
    }: {
      projectId: string;
      taskId: string;
    }) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-projects/${projectId}/tasks`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || t('errors.link_task'));
      }
      return response.json() as Promise<{ linkedTask: LinkedTask }>;
    },
    onSuccess: (data) => {
      toast.success(t('success.task_linked'));
      setTaskToLink('');
      setManagingProject((previous) =>
        previous
          ? {
              ...previous,
              tasksCount: previous.tasksCount + 1,
              linkedTasks: [...previous.linkedTasks, data.linkedTask],
            }
          : previous
      );
      refetchProjects();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('errors.link_task'));
    },
  });

  const unlinkTaskMutation = useMutation({
    mutationFn: async ({
      projectId,
      taskId,
    }: {
      projectId: string;
      taskId: string;
    }) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-projects/${projectId}/tasks/${taskId}`,
        {
          method: 'DELETE',
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || t('errors.unlink_task'));
      }
      return response.json();
    },
    onSuccess: (_data, variables) => {
      toast.success(t('success.task_unlinked'));
      setManagingProject((previous) =>
        previous
          ? {
              ...previous,
              tasksCount: Math.max(previous.tasksCount - 1, 0),
              linkedTasks: previous.linkedTasks.filter(
                (task) => task.id !== variables.taskId
              ),
            }
          : previous
      );
      refetchProjects();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('errors.unlink_task'));
    },
  });

  const handleCreateProject = () => {
    if (!newProjectName.trim()) {
      toast.error(t('errors.empty_project_name'));
      return;
    }
    createProjectMutation.mutate({
      name: newProjectName.trim(),
      description: newProjectDescription.trim() || undefined,
    });
  };

  const handleEditProject = (project: TaskProject) => {
    setEditingProject(project);
    setEditProjectName(project.name);
    setEditProjectDescription(project.description || '');
    setIsEditDialogOpen(true);
  };

  const handleUpdateProject = () => {
    if (!editingProject || !editProjectName.trim()) {
      toast.error(t('errors.empty_project_name'));
      return;
    }
    updateProjectMutation.mutate({
      projectId: editingProject.id,
      name: editProjectName.trim(),
      description: editProjectDescription.trim() || undefined,
    });
  };

  const handleDeleteProject = (projectId: string) => {
    deleteProjectMutation.mutate(projectId);
  };

  const handleOpenManageTasks = (project: TaskProject) => {
    setManagingProject(project);
    setTaskToLink('');
  };

  const handleCloseManageTasks = () => {
    setManagingProject(null);
    setTaskToLink('');
  };

  const handleLinkTask = () => {
    if (!managingProject) {
      return;
    }
    if (!taskToLink) {
      toast.error(t('errors.no_task_selected'));
      return;
    }
    linkTaskMutation.mutate({
      projectId: managingProject.id,
      taskId: taskToLink,
    });
  };

  const handleUnlinkTask = (taskId: string) => {
    if (!managingProject) {
      return;
    }
    unlinkTaskMutation.mutate({
      projectId: managingProject.id,
      taskId,
    });
  };

  const isCreating = createProjectMutation.isPending;
  const isUpdating = updateProjectMutation.isPending;
  const isDeleting = deleteProjectMutation.isPending;
  const isLinking = linkTaskMutation.isPending;
  const isUnlinking = unlinkTaskMutation.isPending;

  const filteredTaskOptions = useMemo(() => {
    if (!managingProject) {
      return [] as TaskOption[];
    }
    const linkedIds = new Set(
      managingProject.linkedTasks.map((task) => task.id)
    );
    return availableTaskOptions.filter((task) => !linkedIds.has(task.id));
  }, [availableTaskOptions, managingProject]);

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-lg">All Projects</h2>
          <p className="text-muted-foreground text-sm">
            {projects.length} project{projects.length === 1 ? '' : 's'} total
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>

      {projectsLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-dynamic-purple" />
        </div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Archive className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 font-semibold text-lg">No projects yet</h3>
            <p className="text-center text-muted-foreground">
              Create your first project to start organizing tasks across boards.
            </p>
            <Button
              className="mt-4"
              onClick={() => setIsCreateDialogOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id} className="group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base">{project.name}</CardTitle>
                    {project.description && (
                      <CardDescription className="mt-1">
                        {project.description}
                      </CardDescription>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isUpdating || isDeleting}
                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleEditProject(project)}
                        disabled={isUpdating}
                      >
                        <Edit3 className="mr-2 h-4 w-4 text-dynamic-blue" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDeleteProject(project.id)}
                        disabled={isDeleting}
                        className="text-dynamic-red focus:text-dynamic-red"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="flex flex-wrap items-center gap-4 text-muted-foreground text-sm">
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span>{project.creator?.display_name || 'Unknown'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {new Date(project.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {project.tasksCount} linked task
                    {project.tasksCount === 1 ? '' : 's'}
                  </Badge>
                </div>

                {project.linkedTasks.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-xs">
                      {project.linkedTasks.length > 3
                        ? `Showing 3 of ${project.linkedTasks.length} tasks`
                        : 'Linked tasks:'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {project.linkedTasks.slice(0, 3).map((task) => (
                        <Badge
                          key={task.id}
                          variant="outline"
                          className="text-xs"
                        >
                          {task.name}
                        </Badge>
                      ))}
                      {project.linkedTasks.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{project.linkedTasks.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No tasks linked yet.
                  </p>
                )}

                <div className="flex gap-2">
                  <NextLink
                    href={`/${wsId}/tasks/projects/${project.id}`}
                    className="flex-1"
                  >
                    <Button size="sm" variant="default" className="w-full">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View Project
                    </Button>
                  </NextLink>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenManageTasks(project)}
                    disabled={isLinking || isUnlinking}
                  >
                    <Link className="mr-2 h-4 w-4" />
                    Link Tasks
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Create a new task project to organize tasks across multiple
              boards.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="project-name" className="font-medium text-sm">
                Project Name
              </Label>
              <Input
                id="project-name"
                placeholder="Enter project name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                disabled={isCreating}
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="project-description"
                className="font-medium text-sm"
              >
                Description (Optional)
              </Label>
              <Textarea
                id="project-description"
                placeholder="Enter project description"
                value={newProjectDescription}
                onChange={(e) => setNewProjectDescription(e.target.value)}
                disabled={isCreating}
                className="min-h-[80px]"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setIsCreateDialogOpen(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateProject} disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Project'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>Update the project details.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label
                htmlFor="edit-project-name"
                className="font-medium text-sm"
              >
                Project Name
              </Label>
              <Input
                id="edit-project-name"
                placeholder="Enter project name"
                value={editProjectName}
                onChange={(e) => setEditProjectName(e.target.value)}
                disabled={isUpdating}
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="edit-project-description"
                className="font-medium text-sm"
              >
                Description (Optional)
              </Label>
              <Textarea
                id="edit-project-description"
                placeholder="Enter project description"
                value={editProjectDescription}
                onChange={(e) => setEditProjectDescription(e.target.value)}
                disabled={isUpdating}
                className="min-h-[80px]"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdateProject} disabled={isUpdating}>
              {isUpdating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Project'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(managingProject)}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseManageTasks();
          }
        }}
      >
        <DialogContent className="max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Manage Linked Tasks</DialogTitle>
            <DialogDescription>
              Link existing tasks to this project or remove them.
            </DialogDescription>
          </DialogHeader>

          {managingProject ? (
            <div className="flex-1 space-y-4 overflow-y-auto py-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="font-medium text-sm">Linked Tasks</Label>
                  {managingProject.linkedTasks.length > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {managingProject.linkedTasks.length} task
                      {managingProject.linkedTasks.length === 1 ? '' : 's'}
                    </Badge>
                  )}
                </div>
                {managingProject.linkedTasks.length > 0 ? (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                    {managingProject.linkedTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-dynamic-surface/40 bg-dynamic-surface/25 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">
                            {task.name}
                          </p>
                          <p className="text-muted-foreground text-xs truncate">
                            {task.listName ?? 'Unassigned list'}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 text-dynamic-red hover:text-dynamic-red focus-visible:text-dynamic-red"
                          onClick={() => handleUnlinkTask(task.id)}
                          disabled={isUnlinking}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Remove</span>
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-24 items-center justify-center rounded-md border border-dashed">
                    <p className="text-center text-muted-foreground text-sm">
                      No tasks linked yet.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="font-medium text-sm">Link a Task</Label>
                <Select
                  value={taskToLink}
                  onValueChange={setTaskToLink}
                  disabled={
                    tasksLoading ||
                    filteredTaskOptions.length === 0 ||
                    isLinking
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select task to link" />
                  </SelectTrigger>
                  <SelectContent>
                    {tasksLoading ? (
                      <SelectItem disabled value="loading">
                        Loading tasks...
                      </SelectItem>
                    ) : filteredTaskOptions.length === 0 ? (
                      <SelectItem disabled value="none">
                        No available tasks
                      </SelectItem>
                    ) : (
                      filteredTaskOptions.map((task) => (
                        <SelectItem key={task.id} value={task.id}>
                          <div className="flex items-center gap-2">
                            <span className="truncate">{task.name}</span>
                            {task.listName && (
                              <span className="text-muted-foreground text-xs">
                                · {task.listName}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {tasksError ? (
                  <p className="text-dynamic-red text-sm">
                    {(tasksError as Error).message}
                  </p>
                ) : filteredTaskOptions.length === 0 && !tasksLoading ? (
                  <p className="text-muted-foreground text-sm">
                    All workspace tasks are already linked to this project.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={handleCloseManageTasks}>
              Close
            </Button>
            <Button
              onClick={handleLinkTask}
              disabled={
                !taskToLink || isLinking || filteredTaskOptions.length === 0
              }
            >
              {isLinking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Linking...
                </>
              ) : (
                'Link Task'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
