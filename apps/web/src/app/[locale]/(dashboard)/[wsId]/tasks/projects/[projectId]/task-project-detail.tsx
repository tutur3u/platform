'use client';

import {
  Calendar,
  Check,
  ChevronRight,
  Edit2,
  Link2,
  Loader2,
  MoreVertical,
  Send,
  Settings,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  User,
  X,
} from '@tuturuuu/icons';
import type {
  Database,
  TaskProjectWithRelations,
  Workspace,
  WorkspaceTaskBoard,
} from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { KanbanBoard } from '@tuturuuu/ui/tu-do/boards/boardId/kanban';
import type { TaskFilters } from '@tuturuuu/ui/tu-do/boards/boardId/task-filter';
import { TimelineBoard } from '@tuturuuu/ui/tu-do/boards/boardId/timeline-board';
import {
  BoardHeader,
  type ListStatusFilter,
} from '@tuturuuu/ui/tu-do/shared/board-header';
import type { ViewType } from '@tuturuuu/ui/tu-do/shared/board-views';
import { ListView } from '@tuturuuu/ui/tu-do/shared/list-view';
import { cn } from '@tuturuuu/utils/format';
import { getDescriptionText } from '@tuturuuu/utils/text-helper';
import type { MotionProps } from 'framer-motion';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface WorkspaceMember {
  id: string;
  display_name: string;
  avatar_url?: string;
  email?: string;
}

interface ProjectUpdate {
  id: string;
  content: string;
  creator_id: string;
  created_at: string | Date;
  updated_at?: string | Date;
  creator?: {
    display_name?: string;
    avatar_url?: string;
  };
  reactionGroups?: Array<{
    emoji: string;
    count: number;
  }>;
}

type ActiveTab = 'overview' | 'updates' | 'tasks';

type TaskPriority = Database['public']['Enums']['task_priority'];
type HealthStatus = 'on_track' | 'at_risk' | 'off_track';

interface TaskProjectDetailProps {
  workspace: Workspace;
  project: TaskProjectWithRelations;
  tasks: Task[];
  lists: TaskList[];
  currentUserId: string;
  wsId: string;
}

// Update Card Component
interface UpdateCardProps {
  update: ProjectUpdate;
  currentUserId: string;
  isEditing: boolean;
  isDeleting: boolean;
  editingContent: string;
  onEdit: () => void;
  onDelete: () => void;
  onSave: () => void;
  onCancel: () => void;
  onContentChange: (content: string) => void;
  fadeInVariant: MotionProps;
}

function UpdateCard({
  update,
  currentUserId,
  isEditing,
  isDeleting,
  editingContent,
  onEdit,
  onDelete,
  onSave,
  onCancel,
  onContentChange,
  fadeInVariant,
}: UpdateCardProps) {
  const isOwnUpdate = update.creator_id === currentUserId;

  return (
    <motion.div {...fadeInVariant}>
      <Card className="group relative border-2 border-dynamic-blue/20 bg-dynamic-blue/5 p-6 transition-all hover:-translate-y-1 hover:border-dynamic-blue/30 hover:shadow-lg">
        <div className="mb-3 flex items-start gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={update.creator?.avatar_url || undefined} />
            <AvatarFallback className="bg-linear-to-br from-dynamic-blue to-dynamic-purple text-white">
              {update.creator?.display_name?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  {update.creator?.display_name || 'Unknown'}
                </span>
                <span className="text-muted-foreground text-xs">
                  {new Date(update.created_at).toLocaleDateString()}{' '}
                  {new Date(update.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {update.updated_at !== update.created_at && (
                  <Badge variant="outline" className="text-xs">
                    Edited
                  </Badge>
                )}
              </div>

              {isOwnUpdate && !isEditing && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                      disabled={isDeleting}
                      aria-label="Update actions"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={onEdit} className="gap-2">
                      <Edit2 className="h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={onDelete}
                      className="gap-2 text-dynamic-red"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {isEditing ? (
              <div className="space-y-2">
                <Textarea
                  value={editingContent}
                  onChange={(e) => onContentChange(e.target.value)}
                  className="min-h-[100px] resize-none"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={onSave}
                    className="bg-linear-to-r from-dynamic-blue to-dynamic-purple"
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onCancel}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/80">
                {update.content}
              </div>
            )}
          </div>
        </div>

        {!isEditing &&
          update.reactionGroups &&
          update.reactionGroups.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
              {update.reactionGroups.map((group: any, idx: number) => (
                <Badge
                  key={idx}
                  variant="outline"
                  className="cursor-pointer border-dynamic-pink/30 bg-dynamic-pink/10 transition-all hover:border-dynamic-pink/50"
                >
                  {group.emoji} {group.count}
                </Badge>
              ))}
            </div>
          )}

        {isDeleting && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/80 backdrop-blur-sm">
            <Loader2 className="h-6 w-6 animate-spin text-dynamic-red" />
          </div>
        )}
      </Card>
    </motion.div>
  );
}

// Project Lead Selector Component
interface ProjectLeadSelectorProps {
  leadId: string | null;
  workspaceMembers: WorkspaceMember[];
  isLoading: boolean;
  onChange: (value: string | null) => void;
  compact?: boolean;
}

function ProjectLeadSelector({
  leadId,
  workspaceMembers,
  isLoading,
  onChange,
  compact = false,
}: ProjectLeadSelectorProps) {
  return (
    <Select
      value={leadId || 'none'}
      onValueChange={(value) => onChange(value === 'none' ? null : value)}
    >
      <SelectTrigger
        className={cn(
          'border-dynamic-purple/30 bg-background/50',
          compact && 'h-9'
        )}
      >
        <SelectValue placeholder={isLoading ? 'Loading...' : 'Select lead'} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">
          <span className="text-muted-foreground italic">No lead</span>
        </SelectItem>
        {workspaceMembers.map((member) => (
          <SelectItem key={member.id} value={member.id}>
            <div className="flex items-center gap-2">
              <Avatar className="h-5 w-5">
                <AvatarImage src={member.avatar_url || undefined} />
                <AvatarFallback className="text-xs">
                  {member.display_name?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm">
                {member.display_name || member.email}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TaskProjectDetail({
  workspace,
  project,
  tasks,
  lists,
  currentUserId,
  wsId,
}: TaskProjectDetailProps) {
  const router = useRouter();

  // Animation and performance state
  const [isMobile, setIsMobile] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    checkMobile();
    window.addEventListener('resize', checkMobile);

    const handleChange = (e: MediaQueryListEvent) =>
      setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      window.removeEventListener('resize', checkMobile);
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  const shouldReduceMotion = isMobile || prefersReducedMotion;

  const fadeInUpVariant = useMemo(
    () =>
      (delay = 0) => ({
        initial: {
          opacity: shouldReduceMotion ? 1 : 0,
          y: shouldReduceMotion ? 0 : 20,
        },
        animate: { opacity: 1, y: 0 },
        transition: {
          duration: shouldReduceMotion ? 0 : 0.6,
          delay: shouldReduceMotion ? 0 : delay,
        },
      }),
    [shouldReduceMotion]
  );

  const fadeInViewVariant = useMemo(
    () =>
      (delay = 0) => ({
        initial: {
          opacity: shouldReduceMotion ? 1 : 0,
          y: shouldReduceMotion ? 0 : 30,
        },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: shouldReduceMotion ? '0px' : '-50px' },
        transition: {
          duration: shouldReduceMotion ? 0 : 0.6,
          delay: shouldReduceMotion ? 0 : delay,
        },
      }),
    [shouldReduceMotion]
  );

  // Editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [editedName, setEditedName] = useState(project.name);
  const [editedDescription, setEditedDescription] = useState(
    project.description || ''
  );
  const [editedPriority, setEditedPriority] = useState(project.priority);
  const [editedHealthStatus, setEditedHealthStatus] = useState(
    project.health_status
  );
  const [editedStatus, setEditedStatus] = useState(project.status);
  const [editedLeadId, setEditedLeadId] = useState(project.lead_id);
  const [editedStartDate, setEditedStartDate] = useState(
    project.start_date
      ? (() => {
          const date = new Date(project.start_date);
          const year = date.getUTCFullYear();
          const month = String(date.getUTCMonth() + 1).padStart(2, '0');
          const day = String(date.getUTCDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        })()
      : ''
  );
  const [editedEndDate, setEditedEndDate] = useState(
    project.end_date
      ? (() => {
          const date = new Date(project.end_date);
          const year = date.getUTCFullYear();
          const month = String(date.getUTCMonth() + 1).padStart(2, '0');
          const day = String(date.getUTCDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        })()
      : ''
  );

  // Task management state
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
    let result = tasks.filter((task) => listIds.has(task.list_id));

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
        return task.projects.some((pt: any) =>
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
  }, [tasks, filters, filteredLists, currentUserId]);

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

  // Save project updates
  const saveProject = async () => {
    setIsSaving(true);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-projects/${project.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: editedName,
            description: editedDescription || null,
            priority: editedPriority || null,
            health_status: editedHealthStatus || null,
            status: editedStatus,
            lead_id: editedLeadId || null,
            start_date: editedStartDate
              ? (() => {
                  const [year, month, day] = editedStartDate
                    .split('-')
                    .map(Number) as [number, number, number];
                  return new Date(Date.UTC(year, month - 1, day)).toISOString();
                })()
              : null,
            end_date: editedEndDate
              ? (() => {
                  const [year, month, day] = editedEndDate
                    .split('-')
                    .map(Number) as [number, number, number];
                  return new Date(Date.UTC(year, month - 1, day)).toISOString();
                })()
              : null,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.error || `Failed to update project (${response.status})`;
        throw new Error(errorMessage);
      }

      toast.success('Project updated successfully');
      setIsEditingName(false);
      setIsEditingDescription(false);
      router.refresh();
    } catch (error) {
      console.error('Error updating project:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to update project'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const cancelEdits = () => {
    setEditedName(project.name);
    setEditedDescription(project.description || '');
    setEditedPriority(project.priority);
    setEditedHealthStatus(project.health_status);
    setEditedStatus(project.status);
    setEditedLeadId(project.lead_id);
    setEditedStartDate(
      project.start_date
        ? (() => {
            const date = new Date(project.start_date);
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const day = String(date.getUTCDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          })()
        : ''
    );
    setEditedEndDate(
      project.end_date
        ? (() => {
            const date = new Date(project.end_date);
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const day = String(date.getUTCDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          })()
        : ''
    );
    setIsEditingName(false);
    setIsEditingDescription(false);
    setShowLeadSelector(false);
  };

  const hasUnsavedChanges =
    editedName !== project.name ||
    editedDescription !== (project.description || '') ||
    editedPriority !== project.priority ||
    editedHealthStatus !== project.health_status ||
    editedStatus !== project.status ||
    editedLeadId !== project.lead_id ||
    editedStartDate !==
      (project.start_date
        ? (() => {
            const date = new Date(project.start_date);
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const day = String(date.getUTCDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          })()
        : '') ||
    editedEndDate !==
      (project.end_date
        ? (() => {
            const date = new Date(project.end_date);
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const day = String(date.getUTCDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          })()
        : '');

  const virtualBoard: Pick<
    WorkspaceTaskBoard,
    'id' | 'name' | 'ws_id' | 'ticket_prefix'
  > = {
    id: project.id,
    name: project.name,
    ws_id: wsId,
    ticket_prefix: null,
  };

  const renderView = () => {
    switch (currentView) {
      // case 'status-grouped':
      //   return (
      //     <StatusGroupedBoard
      //       lists={filteredLists}
      //       tasks={effectiveTasks}
      //       boardId={project.id}
      //       onUpdate={handleUpdate}
      //       hideTasksMode={true}
      //       isPersonalWorkspace={workspace.personal}
      //     />
      //   );
      case 'kanban':
        // Use null boardId to prevent useBoardConfig from querying workspace_boards
        return (
          <KanbanBoard
            workspace={workspace}
            boardId={null}
            tasks={effectiveTasks}
            lists={filteredLists}
            isLoading={false}
          />
        );
      case 'list':
        return (
          <ListView
            boardId={project.id}
            tasks={effectiveTasks}
            lists={filteredLists}
            isPersonalWorkspace={workspace.personal}
          />
        );
      case 'timeline':
        return (
          <TimelineBoard
            tasks={effectiveTasks}
            lists={filteredLists}
            onTaskPartialUpdate={handleTaskPartialUpdate}
          />
        );
      default:
        return (
          <KanbanBoard
            workspace={workspace}
            boardId={null}
            tasks={effectiveTasks}
            lists={filteredLists}
            isLoading={false}
          />
        );
    }
  };

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [showConfiguration, setShowConfiguration] = useState(false);

  // Updates state
  const [newUpdateContent, setNewUpdateContent] = useState('');
  const [isPostingUpdate, setIsPostingUpdate] = useState(false);
  const [updates, setUpdates] = useState<ProjectUpdate[]>([]);
  const [isLoadingUpdates, setIsLoadingUpdates] = useState(false);
  const [editingUpdateId, setEditingUpdateId] = useState<string | null>(null);
  const [editingUpdateContent, setEditingUpdateContent] = useState('');
  const [isDeletingUpdateId, setIsDeletingUpdateId] = useState<string | null>(
    null
  );

  // Recent updates for overview (limit to 3)
  const recentUpdates = useMemo(() => updates.slice(0, 3), [updates]);

  // Recent tasks for overview (limit to 5)
  const recentTasks = useMemo(() => tasks.slice(0, 5), [tasks]);

  // Workspace members for lead selection
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>(
    []
  );
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [showLeadSelector, setShowLeadSelector] = useState(false);

  // Fetch workspace members
  const fetchWorkspaceMembers = useCallback(async () => {
    setIsLoadingMembers(true);
    try {
      const response = await fetch(`/api/v1/workspaces/${wsId}/members`);
      if (response.ok) {
        const data = await response.json();
        setWorkspaceMembers(data || []);
      }
    } catch (error) {
      console.error('Error fetching workspace members:', error);
    } finally {
      setIsLoadingMembers(false);
    }
  }, [wsId]);

  useEffect(() => {
    fetchWorkspaceMembers();
  }, [fetchWorkspaceMembers]);

  // Fetch updates
  const fetchUpdates = useCallback(async () => {
    setIsLoadingUpdates(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-projects/${project.id}/updates`
      );
      if (response.ok) {
        const data = await response.json();
        setUpdates(data.updates || []);
      }
    } catch (error) {
      console.error('Error fetching updates:', error);
    } finally {
      setIsLoadingUpdates(false);
    }
  }, [wsId, project.id]);

  // Post update
  const postUpdate = async () => {
    if (!newUpdateContent.trim()) {
      toast.error('Update content cannot be empty');
      return;
    }

    setIsPostingUpdate(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-projects/${project.id}/updates`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: newUpdateContent }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to post update');
      }

      const newUpdate = await response.json();
      setUpdates([newUpdate, ...updates]);
      setNewUpdateContent('');
      toast.success('Update posted successfully');
    } catch (error) {
      console.error('Error posting update:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to post update'
      );
    } finally {
      setIsPostingUpdate(false);
    }
  };

  // Delete update
  const deleteUpdate = async (updateId: string) => {
    setIsDeletingUpdateId(updateId);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-projects/${project.id}/updates/${updateId}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete update');
      }

      setUpdates((prev) => prev.filter((u) => u.id !== updateId));
      toast.success('Update deleted successfully');
    } catch (error) {
      console.error('Error deleting update:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete update'
      );
    } finally {
      setIsDeletingUpdateId(null);
    }
  };

  // Start editing update
  const startEditingUpdate = (update: ProjectUpdate) => {
    setEditingUpdateId(update.id);
    setEditingUpdateContent(update.content);
  };

  // Cancel editing update
  const cancelEditingUpdate = () => {
    setEditingUpdateId(null);
    setEditingUpdateContent('');
  };

  // Save edited update
  const saveEditedUpdate = async (updateId: string) => {
    if (!editingUpdateContent.trim()) {
      toast.error('Update content cannot be empty');
      return;
    }

    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-projects/${project.id}/updates/${updateId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: editingUpdateContent }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update');
      }

      const updatedUpdate = await response.json();
      setUpdates((prev) =>
        prev.map((u) => (u.id === updateId ? { ...u, ...updatedUpdate } : u))
      );
      setEditingUpdateId(null);
      setEditingUpdateContent('');
      toast.success('Update saved successfully');
    } catch (error) {
      console.error('Error saving update:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save update'
      );
    }
  };

  // Load updates on mount for overview display
  useEffect(() => {
    if (updates.length === 0) fetchUpdates();
  }, [fetchUpdates, updates.length]);

  // Task linking state
  const [showLinkTaskDialog, setShowLinkTaskDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  const [isLinkingTask, setIsLinkingTask] = useState(false);

  // Filter available tasks based on search
  const filteredAvailableTasks = useMemo(() => {
    if (!searchQuery) return [];
    return availableTasks.filter(
      (task) =>
        task.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !tasks.some((t) => t.id === task.id)
    );
  }, [availableTasks, searchQuery, tasks]);

  // Fetch all workspace tasks for linking
  const fetchAvailableTasks = useCallback(async () => {
    try {
      // Get all tasks from all boards in this workspace
      const response = await fetch(`/api/v1/workspaces/${wsId}/tasks`);
      if (response.ok) {
        const data = await response.json();
        setAvailableTasks(data.tasks || []);
      }
    } catch (error) {
      console.error('Error fetching available tasks:', error);
    }
  }, [wsId]);

  // Link task to project
  const linkTaskToProject = async (taskId: string) => {
    setIsLinkingTask(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-projects/${project.id}/tasks`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: taskId,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to link task');
      }

      toast.success('Task linked successfully');
      router.refresh();
      setShowLinkTaskDialog(false);
      setSearchQuery('');
    } catch (error) {
      console.error('Error linking task:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to link task'
      );
    } finally {
      setIsLinkingTask(false);
    }
  };

  useEffect(() => {
    if (showLinkTaskDialog) {
      fetchAvailableTasks();
    }
  }, [showLinkTaskDialog, fetchAvailableTasks]);

  return (
    <div className="relative flex h-full flex-col overflow-x-hidden">
      {/* Simplified Background */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 -left-1/4 h-160 w-160 rounded-full bg-linear-to-br from-dynamic-purple/10 via-dynamic-pink/5 to-transparent blur-3xl" />
        <div className="absolute top-1/3 -right-1/4 h-160 w-160 rounded-full bg-linear-to-br from-dynamic-blue/10 via-dynamic-purple/5 to-transparent blur-3xl" />
      </div>

      {/* Header with gradient and animations */}
      <motion.div
        {...fadeInUpVariant(0)}
        className="relative mx-6 rounded-xl border border-dynamic-gray/20 bg-dynamic-gray/10 bg-linear-to-r p-6"
      >
        <div className="mx-auto max-w-7xl">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-4">
              {/* Project name - editable */}
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="font-bold text-3xl md:text-4xl"
                    placeholder="Project name"
                    autoFocus
                  />
                </div>
              ) : (
                <div className="group flex items-center gap-2">
                  <h1 className="pb-2 font-bold text-3xl md:text-4xl">
                    {project.name}
                  </h1>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => setIsEditingName(true)}
                    aria-label="Edit project name"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Status badges */}
              <div className="flex flex-wrap items-center gap-2">
                {editedStatus && (
                  <Badge
                    variant="secondary"
                    className="border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple"
                  >
                    <Target className="mr-1.5 h-3 w-3" />
                    {editedStatus.replace('_', ' ').toUpperCase()}
                  </Badge>
                )}
                {editedHealthStatus && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'font-semibold',
                      editedHealthStatus === 'on_track'
                        ? 'border-dynamic-green/40 bg-dynamic-green/10 text-dynamic-green'
                        : editedHealthStatus === 'at_risk'
                          ? 'border-dynamic-yellow/40 bg-dynamic-yellow/10 text-dynamic-yellow'
                          : 'border-dynamic-red/40 bg-dynamic-red/10 text-dynamic-red'
                    )}
                  >
                    <TrendingUp className="mr-1.5 h-3 w-3" />
                    {editedHealthStatus === 'on_track'
                      ? 'On Track'
                      : editedHealthStatus === 'at_risk'
                        ? 'At Risk'
                        : 'Off Track'}
                  </Badge>
                )}
              </div>
            </div>

            {/* Save/Cancel buttons */}
            {hasUnsavedChanges && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2"
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={cancelEdits}
                  disabled={isSaving}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={saveProject}
                  disabled={isSaving}
                  className="bg-linear-to-r from-dynamic-purple to-dynamic-pink shadow-lg transition-all hover:shadow-xl"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as ActiveTab)}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <TabsList className="mx-6 mt-4 w-fit justify-start gap-1 rounded-lg border border-border/50 bg-muted/50">
          <TabsTrigger value="overview" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="updates" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Updates
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-2">
            <Target className="h-4 w-4" />
            Tasks ({tasks.length})
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-0 flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-7xl">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Main content area */}
              <div className="space-y-6 lg:col-span-2">
                {/* Description Card */}
                <motion.div {...fadeInViewVariant(0)}>
                  <Card className="group relative border-2 border-dynamic-purple/20 bg-dynamic-purple/5 p-6 transition-all hover:-translate-y-1 hover:border-dynamic-purple/30 hover:shadow-xl">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="bg-linear-to-r from-dynamic-purple to-dynamic-pink bg-clip-text font-bold text-lg text-transparent">
                        Description
                      </h2>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={() => setIsEditingDescription(true)}
                          aria-label="Edit project description"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setShowConfiguration(!showConfiguration)
                          }
                          className="border-dynamic-purple/30 transition-all hover:border-dynamic-purple/50 hover:bg-dynamic-purple/10"
                        >
                          <Settings className="mr-2 h-4 w-4" />
                          {showConfiguration ? 'Hide' : 'Show'} Configuration
                        </Button>
                      </div>
                    </div>

                    {isEditingDescription ? (
                      <div className="space-y-3">
                        <Textarea
                          value={editedDescription}
                          onChange={(e) => setEditedDescription(e.target.value)}
                          placeholder="Describe your project..."
                          className="min-h-[200px] resize-none"
                          autoFocus
                        />
                        <p className="text-muted-foreground text-xs">
                          Note: Rich text editing will be added in a future
                          update
                        </p>
                      </div>
                    ) : editedDescription ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/80">
                        {editedDescription}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm italic">
                        No description provided. Click the edit icon to add one.
                      </p>
                    )}
                  </Card>
                </motion.div>

                {/* Project Configuration - Collapsible */}
                {showConfiguration && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Card className="border-2 border-dynamic-blue/20 bg-dynamic-blue/5 p-6 transition-all hover:-translate-y-1 hover:border-dynamic-blue/30 hover:shadow-xl">
                      <h2 className="mb-6 bg-linear-to-r from-dynamic-blue to-dynamic-cyan bg-clip-text font-bold text-lg text-transparent">
                        Project Configuration
                      </h2>

                      <div className="grid gap-6 md:grid-cols-2">
                        {/* Status */}
                        <div className="space-y-2">
                          <Label className="text-foreground/70 text-sm">
                            Status
                          </Label>
                          <Select
                            value={editedStatus || undefined}
                            onValueChange={(value) => setEditedStatus(value)}
                          >
                            <SelectTrigger className="border-dynamic-purple/30 bg-background/50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="backlog">Backlog</SelectItem>
                              <SelectItem value="planned">Planned</SelectItem>
                              <SelectItem value="in_progress">
                                In Progress
                              </SelectItem>
                              <SelectItem value="in_review">
                                In Review
                              </SelectItem>
                              <SelectItem value="in_testing">
                                In Testing
                              </SelectItem>
                              <SelectItem value="completed">
                                Completed
                              </SelectItem>
                              <SelectItem value="cancelled">
                                Cancelled
                              </SelectItem>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="on_hold">On Hold</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Priority */}
                        <div className="space-y-2">
                          <Label className="text-foreground/70 text-sm">
                            Priority
                          </Label>
                          <Select
                            value={editedPriority || undefined}
                            onValueChange={(value) =>
                              setEditedPriority(value as TaskPriority)
                            }
                          >
                            <SelectTrigger className="border-dynamic-purple/30 bg-background/50">
                              <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="critical">
                                <span className="flex items-center gap-2">
                                  <span className="h-2 w-2 rounded-full bg-dynamic-red" />
                                  Critical
                                </span>
                              </SelectItem>
                              <SelectItem value="high">
                                <span className="flex items-center gap-2">
                                  <span className="h-2 w-2 rounded-full bg-dynamic-orange" />
                                  High
                                </span>
                              </SelectItem>
                              <SelectItem value="normal">
                                <span className="flex items-center gap-2">
                                  <span className="h-2 w-2 rounded-full bg-dynamic-yellow" />
                                  Normal
                                </span>
                              </SelectItem>
                              <SelectItem value="low">
                                <span className="flex items-center gap-2">
                                  <span className="h-2 w-2 rounded-full bg-dynamic-blue" />
                                  Low
                                </span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Health Status */}
                        <div className="space-y-2">
                          <Label className="text-foreground/70 text-sm">
                            Health Status
                          </Label>
                          <Select
                            value={editedHealthStatus || undefined}
                            onValueChange={(value) =>
                              setEditedHealthStatus(value as HealthStatus)
                            }
                          >
                            <SelectTrigger className="border-dynamic-purple/30 bg-background/50">
                              <SelectValue placeholder="Select health status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="on_track">
                                <span className="flex items-center gap-2">
                                  🟢 On Track
                                </span>
                              </SelectItem>
                              <SelectItem value="at_risk">
                                <span className="flex items-center gap-2">
                                  🟡 At Risk
                                </span>
                              </SelectItem>
                              <SelectItem value="off_track">
                                <span className="flex items-center gap-2">
                                  🔴 Off Track
                                </span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Project Lead */}
                        <div className="space-y-2">
                          <Label className="text-foreground/70 text-sm">
                            Project Lead
                          </Label>
                          <ProjectLeadSelector
                            leadId={editedLeadId}
                            workspaceMembers={workspaceMembers}
                            isLoading={isLoadingMembers}
                            onChange={setEditedLeadId}
                          />
                        </div>

                        {/* Start Date */}
                        <div className="space-y-2">
                          <Label className="text-foreground/70 text-sm">
                            Start Date
                          </Label>
                          <Input
                            type="date"
                            value={editedStartDate}
                            onChange={(e) => setEditedStartDate(e.target.value)}
                            className="border-dynamic-purple/30 bg-background/50"
                          />
                        </div>

                        {/* End Date */}
                        <div className="space-y-2">
                          <Label className="text-foreground/70 text-sm">
                            End Date
                          </Label>
                          <Input
                            type="date"
                            value={editedEndDate}
                            onChange={(e) => setEditedEndDate(e.target.value)}
                            className="border-dynamic-purple/30 bg-background/50"
                          />
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                )}

                {/* Recent Updates */}
                <motion.div {...fadeInViewVariant(0.2)}>
                  <Card className="border-2 border-dynamic-pink/20 bg-dynamic-pink/5 p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="bg-linear-to-r from-dynamic-pink to-dynamic-purple bg-clip-text font-bold text-lg text-transparent">
                        Recent Updates
                      </h2>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setActiveTab('updates')}
                        className="gap-1 text-dynamic-pink hover:text-dynamic-pink"
                      >
                        View all
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>

                    {isLoadingUpdates ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-dynamic-pink" />
                      </div>
                    ) : recentUpdates.length > 0 ? (
                      <div className="space-y-3">
                        {recentUpdates.map((update) => (
                          <div
                            key={update.id}
                            className="cursor-pointer rounded-lg border border-dynamic-pink/20 bg-background/50 p-3 transition-all hover:-translate-y-0.5 hover:border-dynamic-pink/30 hover:bg-dynamic-pink/5"
                            onClick={() => setActiveTab('updates')}
                          >
                            <div className="mb-2 flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarImage
                                  src={update.creator?.avatar_url || undefined}
                                />
                                <AvatarFallback className="text-xs">
                                  {update.creator?.display_name?.[0]?.toUpperCase() ||
                                    'U'}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium text-sm">
                                {update.creator?.display_name || 'Unknown'}
                              </span>
                              <span className="text-muted-foreground text-xs">
                                {new Date(
                                  update.created_at
                                ).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="line-clamp-2 text-foreground/70 text-sm">
                              {update.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-8 text-center">
                        <Sparkles className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
                        <p className="text-muted-foreground text-sm">
                          No updates yet. Share the first one!
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setActiveTab('updates')}
                          className="mt-2 text-dynamic-pink hover:text-dynamic-pink"
                        >
                          Post Update
                        </Button>
                      </div>
                    )}
                  </Card>
                </motion.div>

                {/* Recent Tasks */}
                <motion.div {...fadeInViewVariant(0.3)}>
                  <Card className="border-2 border-dynamic-blue/20 bg-dynamic-blue/5 p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="bg-linear-to-r from-dynamic-blue to-dynamic-cyan bg-clip-text font-bold text-lg text-transparent">
                        Linked Tasks
                      </h2>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setActiveTab('tasks')}
                        className="gap-1 text-dynamic-blue hover:text-dynamic-blue"
                      >
                        View all
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>

                    {recentTasks.length > 0 ? (
                      <div className="space-y-2">
                        {recentTasks.map((task) => (
                          <div
                            key={task.id}
                            className="flex items-center justify-between rounded-lg border border-dynamic-blue/20 bg-background/50 p-3 transition-all hover:-translate-y-0.5 hover:border-dynamic-blue/30 hover:bg-dynamic-blue/5"
                          >
                            <div className="flex-1">
                              <h4 className="font-medium text-sm">
                                {task.name}
                              </h4>
                              {task.priority && (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'mt-1 text-xs',
                                    task.priority === 'critical'
                                      ? 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red'
                                      : task.priority === 'high'
                                        ? 'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange'
                                        : task.priority === 'normal'
                                          ? 'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow'
                                          : 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue'
                                  )}
                                >
                                  {task.priority}
                                </Badge>
                              )}
                            </div>
                            {task.closed_at && (
                              <Badge
                                variant="outline"
                                className="border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green"
                              >
                                ✓ Done
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-8 text-center">
                        <Target className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
                        <p className="text-muted-foreground text-sm">
                          No tasks linked yet
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setActiveTab('tasks');
                            setShowLinkTaskDialog(true);
                          }}
                          className="mt-2 text-dynamic-blue hover:text-dynamic-blue"
                        >
                          Link Tasks
                        </Button>
                      </div>
                    )}
                  </Card>
                </motion.div>
              </div>

              {/* Metadata sidebar */}
              <div className="space-y-4">
                {/* Project Lead */}
                <motion.div {...fadeInViewVariant(0.2)}>
                  <Card className="group border-2 border-dynamic-pink/20 bg-dynamic-pink/5 p-4 transition-all hover:-translate-y-1 hover:border-dynamic-pink/30 hover:shadow-lg">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-dynamic-pink to-dynamic-red">
                          <User className="h-4 w-4 text-white" />
                        </div>
                        <h3 className="font-semibold text-sm">Project Lead</h3>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => setShowLeadSelector(!showLeadSelector)}
                        aria-label="Edit project lead"
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    </div>

                    {showLeadSelector ? (
                      <div className="space-y-2">
                        <Label className="text-foreground/70 text-xs">
                          Select Lead
                        </Label>
                        <ProjectLeadSelector
                          leadId={editedLeadId}
                          workspaceMembers={workspaceMembers}
                          isLoading={isLoadingMembers}
                          onChange={(value) => {
                            setEditedLeadId(value);
                            setShowLeadSelector(false);
                          }}
                          compact
                        />
                      </div>
                    ) : editedLeadId ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage
                            src={
                              workspaceMembers.find(
                                (m) => m.id === editedLeadId
                              )?.avatar_url ||
                              project.lead?.avatar_url ||
                              undefined
                            }
                          />
                          <AvatarFallback className="bg-linear-to-br from-dynamic-pink to-dynamic-purple text-white text-xs">
                            {(workspaceMembers.find(
                              (m) => m.id === editedLeadId
                            )?.display_name ||
                              project.lead?.display_name ||
                              'U')?.[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">
                          {workspaceMembers.find((m) => m.id === editedLeadId)
                            ?.display_name ||
                            project.lead?.display_name ||
                            'Unknown'}
                        </span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowLeadSelector(true)}
                        className="w-full rounded-lg border border-dynamic-pink/30 border-dashed p-3 text-center text-muted-foreground text-sm italic transition-colors hover:border-dynamic-pink/50 hover:bg-dynamic-pink/5"
                      >
                        Click to assign a lead
                      </button>
                    )}
                  </Card>
                </motion.div>

                {/* Timeline */}
                <motion.div {...fadeInViewVariant(0.3)}>
                  <Card className="group border-2 border-dynamic-green/20 bg-dynamic-green/5 p-4 transition-all hover:-translate-y-1 hover:border-dynamic-green/30 hover:shadow-lg">
                    <div className="mb-3 flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-dynamic-green to-dynamic-cyan">
                        <Calendar className="h-4 w-4 text-white" />
                      </div>
                      <h3 className="font-semibold text-sm">Timeline</h3>
                    </div>
                    <div className="space-y-2 text-sm">
                      {editedStartDate && (
                        <div className="flex justify-between">
                          <span className="text-foreground/60">Start:</span>
                          <span className="font-medium">
                            {new Date(editedStartDate).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      {editedEndDate && (
                        <div className="flex justify-between">
                          <span className="text-foreground/60">End:</span>
                          <span className="font-medium">
                            {new Date(editedEndDate).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      {!editedStartDate && !editedEndDate && (
                        <p className="text-muted-foreground text-sm italic">
                          No timeline set
                        </p>
                      )}
                    </div>
                  </Card>
                </motion.div>

                {/* Stats */}
                <motion.div {...fadeInViewVariant(0.4)}>
                  <Card className="group border-2 border-dynamic-blue/20 bg-dynamic-blue/5 p-4 transition-all hover:-translate-y-1 hover:border-dynamic-blue/30 hover:shadow-lg">
                    <div className="mb-3 flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-dynamic-blue to-dynamic-purple">
                        <Target className="h-4 w-4 text-white" />
                      </div>
                      <h3 className="font-semibold text-sm">Project Stats</h3>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="text-foreground/60">
                            Total Tasks
                          </span>
                          <span className="font-bold text-lg">
                            {tasks.length}
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-dynamic-blue/10">
                          <div className="h-full rounded-full bg-linear-to-r from-dynamic-blue to-dynamic-cyan" />
                        </div>
                      </div>

                      <div>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="text-foreground/60">Completed</span>
                          <span className="font-bold text-lg">
                            {tasks.filter((t) => t.closed_at).length}
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-dynamic-green/10">
                          <div
                            className="h-full rounded-full bg-linear-to-r from-dynamic-green to-dynamic-cyan"
                            style={{
                              width: `${tasks.length > 0 ? (tasks.filter((t) => t.closed_at).length / tasks.length) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="text-foreground/60">
                            In Progress
                          </span>
                          <span className="font-bold text-lg">
                            {tasks.filter((t) => !t.closed_at).length}
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-dynamic-orange/10">
                          <div
                            className="h-full rounded-full bg-linear-to-r from-dynamic-orange to-dynamic-red"
                            style={{
                              width: `${tasks.length > 0 ? (tasks.filter((t) => !t.closed_at).length / tasks.length) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Updates Tab */}
        <TabsContent value="updates" className="mt-0 flex-1 overflow-auto p-6">
          <div className="mx-auto space-y-6">
            {/* Post Update Form */}
            <motion.div {...fadeInViewVariant(0)}>
              <Card className="border-2 border-dynamic-purple/20 bg-dynamic-purple/5 p-6">
                <h3 className="mb-4 bg-linear-to-r from-dynamic-purple to-dynamic-pink bg-clip-text font-semibold text-lg text-transparent">
                  Share an Update
                </h3>
                <div className="space-y-3">
                  <Textarea
                    value={newUpdateContent}
                    onChange={(e) => setNewUpdateContent(e.target.value)}
                    placeholder="Share progress, celebrate wins, or discuss challenges..."
                    className="min-h-[120px] resize-none border-dynamic-purple/30"
                    disabled={isPostingUpdate}
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-xs">
                      Rich text editor, reactions, and attachments coming soon
                    </p>
                    <Button
                      onClick={postUpdate}
                      disabled={isPostingUpdate || !newUpdateContent.trim()}
                      className="bg-linear-to-r from-dynamic-purple to-dynamic-pink shadow-lg transition-all hover:shadow-xl"
                    >
                      {isPostingUpdate ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Posting...
                        </>
                      ) : (
                        <>
                          <Send className="mr-2 h-4 w-4" />
                          Post Update
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* Updates Feed */}
            {isLoadingUpdates ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-dynamic-purple" />
              </div>
            ) : updates.length > 0 ? (
              <div className="space-y-4">
                {updates.map((update, index) => (
                  <UpdateCard
                    key={update.id}
                    update={update}
                    currentUserId={currentUserId}
                    isEditing={editingUpdateId === update.id}
                    isDeleting={isDeletingUpdateId === update.id}
                    editingContent={editingUpdateContent}
                    onEdit={() => startEditingUpdate(update)}
                    onDelete={() => deleteUpdate(update.id)}
                    onSave={() => saveEditedUpdate(update.id)}
                    onCancel={cancelEditingUpdate}
                    onContentChange={setEditingUpdateContent}
                    fadeInVariant={fadeInViewVariant(index * 0.1)}
                  />
                ))}
              </div>
            ) : (
              <motion.div {...fadeInViewVariant(0.1)}>
                <Card className="border-2 border-muted/20 p-12 text-center">
                  <Sparkles className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mb-2 font-semibold text-lg">No updates yet</h3>
                  <p className="text-muted-foreground text-sm">
                    Be the first to share progress on this project!
                  </p>
                </Card>
              </motion.div>
            )}
          </div>
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="mt-0 flex-1 overflow-hidden">
          {tasks.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
              <Target className="h-16 w-16 text-muted-foreground/50" />
              <div>
                <p className="mb-2 font-semibold text-lg">
                  No tasks linked yet
                </p>
                <p className="text-muted-foreground text-sm">
                  Link existing tasks or create new ones to get started
                </p>
              </div>
              <Button
                onClick={() => setShowLinkTaskDialog(true)}
                className="bg-linear-to-r from-dynamic-blue to-dynamic-purple shadow-lg transition-all hover:shadow-xl"
              >
                <Link2 className="mr-2 h-4 w-4" />
                Link Tasks
              </Button>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-2 border-b px-6 py-3">
                <div className="flex-1">
                  <BoardHeader
                    board={virtualBoard}
                    currentView={currentView}
                    currentUserId={currentUserId}
                    onViewChange={setCurrentView}
                    filters={filters}
                    onFiltersChange={setFilters}
                    listStatusFilter={listStatusFilter}
                    onListStatusFilterChange={setListStatusFilter}
                    isPersonalWorkspace={workspace.personal}
                    backUrl={`/${wsId}/tasks/projects`}
                    hideActions={true}
                  />
                </div>
                <Button
                  onClick={() => setShowLinkTaskDialog(true)}
                  variant="outline"
                  size="sm"
                  className="border-dynamic-purple/30 transition-all hover:border-dynamic-purple/50 hover:bg-dynamic-purple/10"
                >
                  <Link2 className="mr-2 h-4 w-4" />
                  Link Tasks
                </Button>
              </div>
              <div className="h-full overflow-hidden">{renderView()}</div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Link Tasks Dialog */}
      <Dialog open={showLinkTaskDialog} onOpenChange={setShowLinkTaskDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="bg-linear-to-r from-dynamic-purple to-dynamic-pink bg-clip-text text-transparent">
              Link Tasks to Project
            </DialogTitle>
            <DialogDescription>
              Search for existing tasks to link to this project
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Search Input */}
            <div className="relative">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks by title..."
                className="border-dynamic-purple/30"
              />
            </div>

            {/* Results */}
            <div className="max-h-[400px] space-y-2 overflow-auto">
              {searchQuery ? (
                filteredAvailableTasks.length > 0 ? (
                  filteredAvailableTasks.map((task) => (
                    <Card
                      key={task.id}
                      className="group cursor-pointer border-2 border-muted/20 p-4 transition-all hover:-translate-y-1 hover:border-dynamic-purple/30 hover:bg-dynamic-purple/5 hover:shadow-md"
                      onClick={() => linkTaskToProject(task.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <h4 className="mb-1 font-medium">{task.name}</h4>
                          {task.description && (
                            <p className="line-clamp-2 text-muted-foreground text-sm">
                              {getDescriptionText(task.description)}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-2">
                            {task.priority && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-xs',
                                  task.priority === 'critical'
                                    ? 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red'
                                    : task.priority === 'high'
                                      ? 'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange'
                                      : task.priority === 'normal'
                                        ? 'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow'
                                        : 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue'
                                )}
                              >
                                {task.priority}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 transition-opacity group-hover:opacity-100"
                          disabled={isLinkingTask}
                        >
                          <Link2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </Card>
                  ))
                ) : (
                  <div className="py-12 text-center">
                    <p className="text-muted-foreground text-sm">
                      No tasks found matching "{searchQuery}"
                    </p>
                  </div>
                )
              ) : (
                <div className="py-12 text-center">
                  <Target className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
                  <p className="text-muted-foreground text-sm">
                    Start typing to search for tasks
                  </p>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-3">
              <p className="text-foreground/70 text-xs">
                💡 Tip: You can also create new tasks directly in the Tasks tab
                and they will automatically be linked to this project
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
