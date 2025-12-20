'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Archive,
  Calendar,
  ChevronDown,
  Edit3,
  ExternalLink,
  Filter,
  Grid3x3,
  Link,
  List,
  Loader2,
  MoreVertical,
  Plus,
  Target,
  Trash2,
  TrendingUp,
  X,
} from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
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
import { cn } from '@tuturuuu/utils/format';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

interface LinkedTask {
  id: string;
  name: string;
  completed_at: string | null;
  priority: string | null;
  listName: string | null;
}

interface TaskProject {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  priority: string | null;
  health_status: string | null;
  lead_id: string | null;
  lead?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  creator_id: string;
  creator?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  tasksCount: number;
  completedTasksCount: number;
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
  completed_at: string | null;
  listName: string | null;
}

type ViewMode = 'grid' | 'list';
type SortBy =
  | 'created_at'
  | 'name'
  | 'status'
  | 'priority'
  | 'health_status'
  | 'tasks_count';
type SortOrder = 'asc' | 'desc';

export function TaskProjectsClient({
  wsId,
  initialProjects,
}: TaskProjectsClientProps) {
  const t = useTranslations('dashboard.bucket_dump');

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortBy, setSortBy] = useState<SortBy>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [healthFilter, setHealthFilter] = useState<string[]>([]);

  // Dialog state
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
    data: projects,
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
          completed_at:
            typeof task.completed_at === 'string' ? task.completed_at : null,
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

  // Filtered and sorted projects
  const filteredProjects = useMemo(() => {
    let result = projects;

    // Search filter
    if (searchQuery) {
      result = result.filter(
        (project) =>
          project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          project.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter.length > 0) {
      result = result.filter((project) =>
        project.status ? statusFilter.includes(project.status) : false
      );
    }

    // Priority filter
    if (priorityFilter.length > 0) {
      result = result.filter((project) =>
        project.priority ? priorityFilter.includes(project.priority) : false
      );
    }

    // Health filter
    if (healthFilter.length > 0) {
      result = result.filter((project) =>
        project.health_status
          ? healthFilter.includes(project.health_status)
          : false
      );
    }

    const priorityOrder = { critical: 4, high: 3, normal: 2, low: 1 };
    const healthOrder = { off_track: 3, at_risk: 2, on_track: 1 };
    // Sort
    result = [...result].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortBy) {
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'status':
          aVal = a.status ?? '';
          bVal = b.status ?? '';
          break;
        case 'priority':
          aVal = a.priority
            ? (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 0)
            : 0;
          bVal = b.priority
            ? (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 0)
            : 0;
          break;
        case 'health_status':
          aVal = a.health_status
            ? (healthOrder[a.health_status as keyof typeof healthOrder] ?? 0)
            : 0;
          bVal = b.health_status
            ? (healthOrder[b.health_status as keyof typeof healthOrder] ?? 0)
            : 0;
          break;
        case 'tasks_count':
          aVal = a.tasksCount;
          bVal = b.tasksCount;
          break;
        case 'created_at':
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
          break;
      }

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });

    return result;
  }, [
    projects,
    searchQuery,
    statusFilter,
    priorityFilter,
    healthFilter,
    sortBy,
    sortOrder,
  ]);

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

  const getHealthStatusBadge = (health: string | null) => {
    if (!health) return null;
    const config = {
      on_track: {
        label: 'On Track',
        className:
          'border-dynamic-green/40 bg-dynamic-green/10 text-dynamic-green',
        icon: '🟢',
      },
      at_risk: {
        label: 'At Risk',
        className:
          'border-dynamic-yellow/40 bg-dynamic-yellow/10 text-dynamic-yellow',
        icon: '🟡',
      },
      off_track: {
        label: 'Off Track',
        className: 'border-dynamic-red/40 bg-dynamic-red/10 text-dynamic-red',
        icon: '🔴',
      },
    };
    const { label, className, icon } =
      config[health as keyof typeof config] || config.on_track;
    return (
      <Badge variant="outline" className={cn('text-xs', className)}>
        <TrendingUp className="mr-1 h-3 w-3" />
        {icon} {label}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: string | null) => {
    if (!priority) return null;
    const config = {
      critical: {
        label: 'Critical',
        className: 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red',
      },
      high: {
        label: 'High',
        className:
          'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange',
      },
      normal: {
        label: 'Normal',
        className:
          'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow',
      },
      low: {
        label: 'Low',
        className:
          'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue',
      },
    };
    const { label, className } =
      config[priority as keyof typeof config] || config.normal;
    return (
      <Badge variant="outline" className={cn('text-xs', className)}>
        {label}
      </Badge>
    );
  };

  const getStatusBadge = (status: string | null) => {
    if (!status) return null;
    return (
      <Badge variant="secondary" className="text-xs">
        <Target className="mr-1 h-3 w-3" />
        {status.replaceAll('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  const hasActiveFilters =
    statusFilter.length > 0 ||
    priorityFilter.length > 0 ||
    healthFilter.length > 0;

  const clearFilters = () => {
    setStatusFilter([]);
    setPriorityFilter([]);
    setHealthFilter([]);
  };

  return (
    <>
      {/* Header with controls */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-semibold text-lg">All Projects</h2>
          <p className="text-muted-foreground text-sm">
            {filteredProjects.length} of {projects.length} project
            {projects.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full md:w-64"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2"
                onClick={() => setSearchQuery('')}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Filters */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  hasActiveFilters &&
                    'border-dynamic-purple/50 bg-dynamic-purple/10'
                )}
              >
                <Filter className="mr-2 h-4 w-4" />
                Filters
                {hasActiveFilters && (
                  <Badge
                    variant="secondary"
                    className="ml-2 h-5 w-5 rounded-full p-0 text-xs"
                  >
                    {statusFilter.length +
                      priorityFilter.length +
                      healthFilter.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {/* Status Filter */}
              <div className="px-2 py-1.5">
                <p className="mb-2 font-medium text-sm">Status</p>
                {[
                  'backlog',
                  'planned',
                  'in_progress',
                  'in_review',
                  'completed',
                  'cancelled',
                  'active',
                  'on_hold',
                ].map((status) => (
                  <DropdownMenuCheckboxItem
                    key={status}
                    checked={statusFilter.includes(status)}
                    onCheckedChange={(checked) => {
                      setStatusFilter((prev) =>
                        checked
                          ? [...prev, status]
                          : prev.filter((s) => s !== status)
                      );
                    }}
                  >
                    {status.replace('_', ' ').toUpperCase()}
                  </DropdownMenuCheckboxItem>
                ))}
              </div>

              <DropdownMenuSeparator />

              {/* Priority Filter */}
              <div className="px-2 py-1.5">
                <p className="mb-2 font-medium text-sm">Priority</p>
                {['critical', 'high', 'normal', 'low'].map((priority) => (
                  <DropdownMenuCheckboxItem
                    key={priority}
                    checked={priorityFilter.includes(priority)}
                    onCheckedChange={(checked) => {
                      setPriorityFilter((prev) =>
                        checked
                          ? [...prev, priority]
                          : prev.filter((p) => p !== priority)
                      );
                    }}
                  >
                    {priority.charAt(0).toUpperCase() + priority.slice(1)}
                  </DropdownMenuCheckboxItem>
                ))}
              </div>

              <DropdownMenuSeparator />

              {/* Health Filter */}
              <div className="px-2 py-1.5">
                <p className="mb-2 font-medium text-sm">Health</p>
                {['on_track', 'at_risk', 'off_track'].map((health) => (
                  <DropdownMenuCheckboxItem
                    key={health}
                    checked={healthFilter.includes(health)}
                    onCheckedChange={(checked) => {
                      setHealthFilter((prev) =>
                        checked
                          ? [...prev, health]
                          : prev.filter((h) => h !== health)
                      );
                    }}
                  >
                    {health === 'on_track'
                      ? '🟢 On Track'
                      : health === 'at_risk'
                        ? '🟡 At Risk'
                        : '🔴 Off Track'}
                  </DropdownMenuCheckboxItem>
                ))}
              </div>

              {hasActiveFilters && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={clearFilters}
                    >
                      Clear all filters
                    </Button>
                  </div>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sort */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <ChevronDown className="mr-2 h-4 w-4" />
                Sort
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSortBy('created_at')}>
                <Calendar className="mr-2 h-4 w-4" />
                Created Date
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('name')}>
                Name
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('status')}>
                Status
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('priority')}>
                Priority
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('health_status')}>
                Health Status
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('tasks_count')}>
                Task Count
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
                }
              >
                {sortOrder === 'asc' ? 'Ascending' : 'Descending'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* View Mode Toggle */}
          <div className="flex rounded-md border">
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              className="rounded-r-none"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              className="rounded-l-none"
              onClick={() => setViewMode('grid')}
            >
              <Grid3x3 className="h-4 w-4" />
            </Button>
          </div>

          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </div>
      </div>

      {projectsLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-dynamic-purple" />
        </div>
      ) : filteredProjects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Archive className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 font-semibold text-lg">
              {searchQuery || hasActiveFilters
                ? 'No projects found'
                : 'No projects yet'}
            </h3>
            <p className="text-center text-muted-foreground">
              {searchQuery || hasActiveFilters
                ? 'Try adjusting your search or filters'
                : 'Create your first project to start organizing tasks across boards.'}
            </p>
            {!searchQuery && !hasActiveFilters && (
              <Button
                className="mt-4"
                onClick={() => setIsCreateDialogOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create Project
              </Button>
            )}
          </CardContent>
        </Card>
      ) : viewMode === 'list' ? (
        <div className="space-y-3">
          {filteredProjects.map((project) => {
            const progressPercent =
              project.tasksCount > 0
                ? Math.round(
                    (project.completedTasksCount / project.tasksCount) * 100
                  )
                : 0;
            return (
              <Card
                key={project.id}
                className="group overflow-hidden border-dynamic-purple/20 bg-linear-to-br from-dynamic-purple/5 to-transparent transition-all hover:border-dynamic-purple/30 hover:shadow-lg"
              >
                <div className="flex">
                  {/* Left Accent Bar with Progress */}
                  <div className="relative flex w-24 flex-col items-center justify-center gap-3 border-dynamic-purple/20 border-r bg-dynamic-purple/10 p-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-dynamic-purple/30 to-dynamic-indigo/30 shadow-sm">
                      <Target className="h-7 w-7 text-dynamic-purple" />
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-2xl text-dynamic-purple">
                        {progressPercent}%
                      </p>
                      <p className="text-muted-foreground text-xs">Complete</p>
                    </div>
                  </div>

                  {/* Main Content */}
                  <div className="flex-1 space-y-4 p-5">
                    <div className="flex items-center justify-between">
                      {/* Title Row with Badges */}
                      <div className="flex flex-wrap items-center gap-3">
                        <NextLink
                          href={`/${wsId}/tasks/projects/${project.id}`}
                          className="group/link"
                        >
                          <h3 className="inline-flex items-center gap-2 font-bold text-xl transition-colors hover:text-dynamic-purple">
                            {project.name}
                            <ExternalLink className="h-4 w-4 opacity-0 transition-opacity group-hover/link:opacity-100" />
                          </h3>
                        </NextLink>
                        {getStatusBadge(project.status)}
                        {getPriorityBadge(project.priority)}
                        {getHealthStatusBadge(project.health_status)}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isUpdating || isDeleting}
                            className="h-9 w-9 p-0"
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
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1 space-y-3">
                        {/* Description */}
                        {project.description && (
                          <p className="line-clamp-3 text-muted-foreground leading-relaxed">
                            {project.description}
                          </p>
                        )}

                        {/* Horizontal Info Bar */}
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                          {/* Project Lead */}
                          {project.lead && (
                            <div className="flex items-center gap-2.5">
                              <Avatar className="h-9 w-9 ring-2 ring-dynamic-blue/30 ring-offset-2 ring-offset-background">
                                <AvatarImage
                                  src={project.lead.avatar_url || undefined}
                                />
                                <AvatarFallback className="bg-linear-to-br from-dynamic-blue/30 to-dynamic-purple/20 font-semibold text-dynamic-blue">
                                  {project.lead.display_name?.[0]?.toUpperCase() ||
                                    'U'}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-muted-foreground text-xs">
                                  Project Lead
                                </p>
                                <p className="font-semibold">
                                  {project.lead.display_name || 'Unknown'}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Task Stats */}
                          <div className="flex items-center gap-2">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-dynamic-indigo/20 to-dynamic-cyan/10">
                              <Target className="h-4 w-4 text-dynamic-indigo" />
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">
                                Tasks
                              </p>
                              <p className="font-semibold">
                                {project.completedTasksCount} of{' '}
                                {project.tasksCount}
                              </p>
                            </div>
                          </div>

                          {/* Timeline */}
                          {(project.start_date || project.end_date) && (
                            <div className="flex items-center gap-2">
                              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-dynamic-purple/20 to-dynamic-pink/10">
                                <Calendar className="h-4 w-4 text-dynamic-purple" />
                              </div>
                              <div>
                                <p className="text-muted-foreground text-xs">
                                  Timeline
                                </p>
                                <p className="font-semibold">
                                  {project.start_date &&
                                    new Date(
                                      project.start_date
                                    ).toLocaleDateString('en-GB', {
                                      day: 'numeric',
                                      month: 'numeric',
                                      year: 'numeric',
                                    })}
                                  {project.start_date &&
                                    project.end_date &&
                                    ' → '}
                                  {project.end_date &&
                                    new Date(
                                      project.end_date
                                    ).toLocaleDateString('en-GB', {
                                      day: 'numeric',
                                      month: 'numeric',
                                      year: 'numeric',
                                    })}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Linked Tasks Count */}
                          {project.linkedTasks.length > 0 && (
                            <div className="flex items-center gap-2">
                              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-dynamic-cyan/20 to-dynamic-teal/10">
                                <Link className="h-4 w-4 text-dynamic-cyan" />
                              </div>
                              <div>
                                <p className="text-muted-foreground text-xs">
                                  Linked
                                </p>
                                <p className="font-semibold">
                                  {project.linkedTasks.length} task
                                  {project.linkedTasks.length !== 1 ? 's' : ''}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Linked Tasks Pills */}
                        {project.linkedTasks.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {project.linkedTasks.slice(0, 3).map((task) => (
                              <Badge
                                key={task.id}
                                variant="outline"
                                className="border-dynamic-cyan/30 bg-dynamic-cyan/10 text-dynamic-cyan text-xs"
                              >
                                {task.name}
                              </Badge>
                            ))}
                            {project.linkedTasks.length > 3 && (
                              <Badge
                                variant="outline"
                                className="border-dynamic-cyan/30 bg-dynamic-cyan/10 text-dynamic-cyan text-xs"
                              >
                                +{project.linkedTasks.length - 3} more
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right Actions Column */}
                      <div className="flex shrink-0 flex-col gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenManageTasks(project)}
                          disabled={isLinking || isUnlinking}
                          className="whitespace-nowrap"
                        >
                          <Link className="mr-2 h-3.5 w-3.5" />
                          Manage
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <Card
              key={project.id}
              className="group flex flex-col border-dynamic-purple/20 bg-dynamic-purple/5 transition-all hover:border-dynamic-purple/30 hover:shadow-md"
            >
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base">{project.name}</CardTitle>
                    {project.description && (
                      <CardDescription className="mt-2 line-clamp-3 leading-relaxed">
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
                        className="h-8 w-8 shrink-0 p-0 opacity-0 group-hover:opacity-100"
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
              <CardContent className="flex flex-1 flex-col space-y-3 pt-0">
                {/* Status Badges */}
                <div className="flex flex-wrap gap-2">
                  {getStatusBadge(project.status)}
                  {getPriorityBadge(project.priority)}
                  {getHealthStatusBadge(project.health_status)}
                </div>

                {/* Info Cards */}
                <div className="space-y-2">
                  {/* Project Lead */}
                  {project.lead && (
                    <div className="flex items-center gap-2.5 rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/10 p-2.5">
                      <Avatar className="h-7 w-7">
                        <AvatarImage
                          src={project.lead.avatar_url || undefined}
                        />
                        <AvatarFallback className="bg-dynamic-blue/20 text-dynamic-blue text-xs">
                          {project.lead.display_name?.[0]?.toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-muted-foreground text-xs">
                          Project Lead
                        </p>
                        <p className="truncate font-medium text-sm">
                          {project.lead.display_name || 'Unknown'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Task Progress */}
                  <div className="flex items-center gap-2.5 rounded-lg border border-dynamic-indigo/20 bg-dynamic-indigo/10 p-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-dynamic-indigo/20">
                      <Target className="h-3.5 w-3.5 text-dynamic-indigo" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-muted-foreground text-xs">
                        Task Progress
                      </p>
                      <p className="font-medium text-sm">
                        {project.completedTasksCount}/{project.tasksCount}{' '}
                        completed
                      </p>
                    </div>
                  </div>

                  {/* Timeline */}
                  {(project.start_date || project.end_date) && (
                    <div className="flex items-center gap-2.5 rounded-lg border border-dynamic-purple/20 bg-dynamic-purple/10 p-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-dynamic-purple/20">
                        <Calendar className="h-3.5 w-3.5 text-dynamic-purple" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-muted-foreground text-xs">
                          Timeline
                        </p>
                        <p className="truncate font-medium text-sm">
                          {project.start_date &&
                            new Date(project.start_date).toLocaleDateString(
                              'en-US',
                              {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              }
                            )}
                          {project.start_date && project.end_date && ' → '}
                          {project.end_date &&
                            new Date(project.end_date).toLocaleDateString(
                              'en-US',
                              {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              }
                            )}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Linked Tasks Preview */}
                {project.linkedTasks.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">Linked Tasks</p>
                      <Badge
                        variant="outline"
                        className="border-dynamic-cyan/30 bg-dynamic-cyan/10 text-dynamic-cyan text-xs"
                      >
                        {project.linkedTasks.length}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {project.linkedTasks.slice(0, 3).map((task) => (
                        <Badge
                          key={task.id}
                          variant="outline"
                          className="border-dynamic-cyan/30 bg-dynamic-cyan/10 text-dynamic-cyan text-xs"
                        >
                          {task.name}
                        </Badge>
                      ))}
                      {project.linkedTasks.length > 3 && (
                        <Badge
                          variant="outline"
                          className="border-dynamic-cyan/30 bg-dynamic-cyan/10 text-dynamic-cyan text-xs"
                        >
                          +{project.linkedTasks.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-auto flex flex-col gap-2 pt-2">
                  <NextLink href={`/${wsId}/tasks/projects/${project.id}`}>
                    <Button size="sm" variant="default" className="w-full">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View Details
                    </Button>
                  </NextLink>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenManageTasks(project)}
                    disabled={isLinking || isUnlinking}
                    className="w-full"
                  >
                    <Link className="mr-2 h-4 w-4" />
                    Manage Tasks
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
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

      {/* Edit Dialog */}
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

      {/* Manage Tasks Dialog */}
      <Dialog
        open={Boolean(managingProject)}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseManageTasks();
          }
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col">
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
                  <div className="max-h-[300px] space-y-2 overflow-y-auto pr-2">
                    {managingProject.linkedTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-dynamic-surface/40 bg-dynamic-surface/25 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-sm">
                            {task.name}
                          </p>
                          <p className="truncate text-muted-foreground text-xs">
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
