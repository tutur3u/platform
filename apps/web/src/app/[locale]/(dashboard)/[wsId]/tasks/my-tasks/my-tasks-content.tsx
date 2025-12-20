'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Calendar,
  Clock,
  Flag,
  LayoutDashboard,
  ListTodo,
  Tag,
  Users,
  X,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskWithRelations } from '@tuturuuu/types';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { TaskNewLabelDialog } from '@tuturuuu/ui/tu-do/boards/boardId/task-dialogs/TaskNewLabelDialog';
import { TaskNewProjectDialog } from '@tuturuuu/ui/tu-do/boards/boardId/task-dialogs/TaskNewProjectDialog';
import { TaskBoardForm } from '@tuturuuu/ui/tu-do/boards/form';
import { useTaskDialog } from '@tuturuuu/ui/tu-do/hooks/useTaskDialog';
import { CreateListDialog } from '@tuturuuu/ui/tu-do/shared/create-list-dialog';
import { useBoardConfig } from '@tuturuuu/utils/task-helper';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CommandBar, type TaskOptions } from './command-bar';
import { LabelProjectFilter } from './label-project-filter';
import { TaskFilter } from './task-filter';
import TaskList from './task-list';
import type { JournalTaskResponse } from './task-preview-dialog';
import { TaskPreviewDialog } from './task-preview-dialog';

dayjs.extend(utc);
dayjs.extend(timezone);

interface MyTasksContentProps {
  wsId: string;
  isPersonal: boolean;
  overdueTasks: TaskWithRelations[] | undefined;
  todayTasks: TaskWithRelations[] | undefined;
  upcomingTasks: TaskWithRelations[] | undefined;
  totalActiveTasks: number;
  overdueCount: number;
  todayCount: number;
  upcomingCount: number;
}

export default function MyTasksContent({
  wsId,
  isPersonal,
  overdueTasks,
  todayTasks,
  upcomingTasks,
  totalActiveTasks,
  overdueCount,
  todayCount,
  upcomingCount,
}: MyTasksContentProps) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { onUpdate, openTaskById } = useTaskDialog();
  const [boardSelectorOpen, setBoardSelectorOpen] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(wsId);
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [newBoardDialogOpen, setNewBoardDialogOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState<string>('');
  const [newListDialogOpen, setNewListDialogOpen] = useState(false);
  const [newListName, setNewListName] = useState<string>('');
  const [commandBarLoading, setCommandBarLoading] = useState(false);
  const [commandBarInput, setCommandBarInput] = useState('');

  const [taskFilters, setTaskFilters] = useState<{
    workspaceIds: string[];
    boardIds: string[];
    labelIds: string[];
    projectIds: string[];
  }>({
    workspaceIds: ['all'],
    boardIds: ['all'],
    labelIds: [],
    projectIds: [],
  });

  // Task creation state
  const [pendingTaskTitle, setPendingTaskTitle] = useState<string>('');
  const [taskCreatorMode, setTaskCreatorMode] = useState<
    'simple' | 'ai' | null
  >(null);

  // AI Generation settings
  const [aiGenerateDescriptions, setAiGenerateDescriptions] = useState(true);
  const [aiGeneratePriority, setAiGeneratePriority] = useState(true);
  const [aiGenerateLabels, setAiGenerateLabels] = useState(true);

  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<any | null>(null);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);

  // Collapsible sections state
  const [collapsedSections, setCollapsedSections] = useState({
    overdue: false,
    today: false,
    upcoming: false,
  });

  const toggleSection = (section: 'overdue' | 'today' | 'upcoming') => {
    setCollapsedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Label creation dialog state
  const [newLabelDialogOpen, setNewLabelDialogOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#3b82f6'); // Default blue
  const [creatingLabel, setCreatingLabel] = useState(false);

  // Project creation dialog state
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  const clientTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
    } catch {
      return 'UTC';
    }
  }, []);

  const handleUpdate = useCallback(() => {
    console.log('🔄 Refreshing My Tasks page...');

    // Invalidate React Query caches for client-side data
    queryClient.invalidateQueries({ queryKey: ['user-workspaces'] });
    queryClient.invalidateQueries({ queryKey: ['workspace', wsId] });

    // Use router.push to navigate back and refresh the page
    // This ensures we're at the correct URL when the refresh happens
    setTimeout(() => {
      const currentPath = window.location.pathname;
      console.log('🔄 Current path:', currentPath);

      // Check if we're on My Tasks page or elsewhere
      if (
        currentPath.includes('/tasks/') &&
        currentPath.match(/\/tasks\/[^/]+$/)
      ) {
        // On a task detail page - navigate back to tasks
        console.log('🔄 Navigating back to Tasks...');
        router.push(`/${wsId}/tasks`);
      } else {
        // Fallback: just refresh
        console.log('🔄 Fallback refresh...');
        router.refresh();
      }
    }, 150);
  }, [router, queryClient, wsId]);

  // Connect the centralized task dialog's onUpdate to page refresh
  useEffect(() => {
    console.log('✅ Registering My Tasks update callback');
    onUpdate(handleUpdate);
  }, [onUpdate, handleUpdate]);

  // Fetch user's workspaces (only if in personal workspace)
  const { data: workspacesData } = useQuery({
    queryKey: ['user-workspaces'],
    queryFn: async () => {
      const supabase = createClient();

      // Get user's workspace IDs first
      const { data: memberData, error: memberError } = await supabase
        .from('workspace_members')
        .select('ws_id');

      if (memberError) throw memberError;

      const workspaceIds = memberData?.map((m) => m.ws_id) || [];
      if (workspaceIds.length === 0) return [];

      // Fetch unique workspaces
      const { data, error } = await supabase
        .from('workspaces')
        .select('id, name, personal')
        .in('id', workspaceIds)
        .order('name', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: isPersonal,
  });

  const { data: allBoardsData = [] } = useQuery({
    queryKey: ['all-user-boards'],
    queryFn: async () => {
      const supabase = createClient();
      const { data: memberData, error: memberError } = await supabase
        .from('workspace_members')
        .select('ws_id');

      if (memberError) throw memberError;

      const workspaceIds = memberData?.map((m) => m.ws_id) || [];
      if (workspaceIds.length === 0) return [];

      const { data, error } = await supabase
        .from('workspace_boards')
        .select('id, name, ws_id')
        .in('ws_id', workspaceIds)
        .is('deleted_at', null);

      if (error) throw error;
      return data || [];
    },
    enabled: isPersonal,
  });

  // Fetch all boards with their lists for selected workspace
  const { data: boardsDataRaw, isLoading: boardsLoading } = useQuery({
    queryKey: ['workspace', selectedWorkspaceId, 'boards-with-lists'],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('workspace_boards')
        .select(
          `
          id,
          name,
          task_lists(id, name, status, position, deleted)
        `
        )
        .eq('ws_id', selectedWorkspaceId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: boardSelectorOpen && !!selectedWorkspaceId,
  });

  // Ensure boardsData is always an array
  // Handle case where response might be wrapped in { boards: [...] }
  const boardsData = Array.isArray(boardsDataRaw)
    ? boardsDataRaw
    : ((boardsDataRaw as any)?.boards ?? []);

  const allWorkspaceIds = useMemo(
    () => workspacesData?.map((ws) => ws.id) || [],
    [workspacesData]
  );

  // Fetch workspace labels (always fetch for CommandBar)
  const { data: workspaceLabels = [] } = useQuery({
    queryKey: ['workspaceLabels', JSON.stringify(allWorkspaceIds)],
    queryFn: async () => {
      if (allWorkspaceIds.length === 0) return [];
      const promises = allWorkspaceIds.map((wsId) =>
        fetch(`/api/v1/workspaces/${wsId}/labels`).then((res) => res.json())
      );
      const results = await Promise.all(promises);
      return results.flat().filter(Boolean);
    },
    enabled: isPersonal && allWorkspaceIds.length > 0,
  });

  // Fetch workspace projects for CommandBar
  const { data: workspaceProjects = [] } = useQuery({
    queryKey: ['workspaceProjects', JSON.stringify(allWorkspaceIds)],
    queryFn: async () => {
      if (allWorkspaceIds.length === 0) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from('task_projects')
        .select('id, name, ws_id')
        .in('ws_id', allWorkspaceIds)
        .order('name', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: isPersonal && allWorkspaceIds.length > 0,
  });

  // Fetch workspace members for CommandBar
  const { data: workspaceMembers = [] } = useQuery({
    queryKey: ['workspace', wsId, 'members'],
    queryFn: async () => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/members`);
      if (!response.ok) {
        throw new Error('Failed to fetch members');
      }
      const data = await response.json();

      // Map the workspace_members data to the expected format
      // The API returns workspace_members with nested user data
      return (data || []).map((member: any) => ({
        id: member.id || member.user_id,
        display_name: member.display_name,
        email: member.email,
        avatar_url: member.avatar_url,
      }));
    },
  });

  // Fetch board config for selected board (needed for estimation options in preview)
  const { data: boardConfig } = useBoardConfig(selectedBoardId || undefined);

  // Get available lists for selected board
  const availableLists = useMemo(() => {
    if (!selectedBoardId) return [];
    const board = boardsData.find((b: any) => b.id === selectedBoardId);
    if (!board?.task_lists) return [];
    return (board.task_lists as any[])
      .filter((l: any) => !l.deleted)
      .sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
  }, [selectedBoardId, boardsData]);

  // Auto-select first workspace when dialog opens (personal workspace only)
  useMemo(() => {
    if (
      isPersonal &&
      boardSelectorOpen &&
      workspacesData &&
      workspacesData.length > 0 &&
      !selectedWorkspaceId
    ) {
      setSelectedWorkspaceId(workspacesData?.[0]?.id || '');
    }
  }, [isPersonal, boardSelectorOpen, workspacesData, selectedWorkspaceId]);

  // Auto-select first board and list when dialog opens or workspace changes
  useMemo(() => {
    if (
      boardSelectorOpen &&
      boardsData &&
      boardsData.length > 0 &&
      !selectedBoardId
    ) {
      const firstBoard = boardsData[0] as any;
      setSelectedBoardId(firstBoard.id);

      const lists = (firstBoard.task_lists as any[]) || [];
      const firstList = lists
        .filter((l: any) => !l.deleted)
        .sort((a: any, b: any) => (a.position || 0) - (b.position || 0))[0];

      if (firstList) {
        setSelectedListId(firstList.id);
      }
    }
  }, [boardSelectorOpen, boardsData, selectedBoardId]);

  // Auto-select first list when board changes
  useMemo(() => {
    if (selectedBoardId && availableLists.length > 0) {
      const currentListExists = availableLists.some(
        (l: any) => l.id === selectedListId
      );
      if (!currentListExists) {
        setSelectedListId(availableLists[0].id);
      }
    }
  }, [selectedBoardId, availableLists, selectedListId]);

  // Preview mutation
  const previewMutation = useMutation<
    JournalTaskResponse,
    Error,
    {
      entry: string;
      generateDescriptions: boolean;
      generatePriority: boolean;
      generateLabels: boolean;
      clientTimezone: string;
      clientTimestamp: string;
    }
  >({
    mutationFn: async ({
      entry: previewText,
      generateDescriptions: shouldGenerateDescriptions,
      generatePriority: shouldGeneratePriority,
      generateLabels: shouldGenerateLabels,
      clientTimezone: timezone,
      clientTimestamp,
    }: {
      entry: string;
      generateDescriptions: boolean;
      generatePriority: boolean;
      generateLabels: boolean;
      clientTimezone: string;
      clientTimestamp: string;
    }) => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/tasks/journal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entry: previewText,
          previewOnly: true,
          generateDescriptions: shouldGenerateDescriptions,
          generatePriority: shouldGeneratePriority,
          generateLabels: shouldGenerateLabels,
          clientTimezone: timezone,
          clientTimestamp,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          payload && typeof payload === 'object' && 'error' in payload
            ? (payload as { error?: string }).error
            : undefined;

        throw new Error(message || 'Failed to generate preview');
      }

      return payload;
    },
    onSuccess: (
      payload: JournalTaskResponse,
      variables: {
        entry: string;
        generateDescriptions: boolean;
        generatePriority: boolean;
        generateLabels: boolean;
        clientTimezone: string;
        clientTimestamp: string;
      }
    ) => {
      setLastResult(payload ?? null);
      setPreviewEntry(variables.entry);
      setSelectedLabelIds([]);
      setCurrentPreviewIndex(0);
      setPreviewOpen(true);
    },
    onError: (mutationError: Error) => {
      toast.error(mutationError.message || 'Failed to generate preview');
    },
  });

  // Create tasks from preview mutation
  const createTasksMutation = useMutation({
    mutationFn: async (payload: {
      entry: string;
      listId: string;
      tasks: Array<{
        title: string;
        description: string | null;
        priority: TaskPriority | null;
        labels: Array<{ id?: string; name: string }>;
        dueDate: string | null;
        estimationPoints?: number | null;
        projectIds?: string[];
      }>;
      labelIds: string[];
      generatedWithAI: boolean;
      generateDescriptions: boolean;
      generatePriority: boolean;
      generateLabels: boolean;
      clientTimezone: string;
      clientTimestamp: string;
    }) => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/tasks/journal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || 'Failed to create tasks');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Tasks created successfully!');
      setPreviewOpen(false);
      setLastResult(null);
      setPreviewEntry(null);
      setPendingTaskTitle('');
      setCommandBarInput('');
      setTaskCreatorMode(null);
      handleUpdate();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create tasks');
    },
  });

  const handleCreateTask = async (
    title: string,
    options?: TaskOptions
  ): Promise<boolean> => {
    // If destination is not yet confirmed, open selector first
    if (!selectedBoardId || !selectedListId) {
      setPendingTaskTitle(title);
      setBoardSelectorOpen(true);
      return false;
    }

    // Create task directly without opening dialog
    setCommandBarLoading(true);
    try {
      const supabase = createClient();
      const { createTask: createTaskFn } = await import(
        '@tuturuuu/utils/task-helper'
      );

      const newTask = await createTaskFn(supabase, selectedListId, {
        name: title.trim(),
        description: undefined,
        priority: options?.priority || undefined,
        start_date: undefined,
        end_date: options?.dueDate?.toISOString() || undefined,
        estimation_points: options?.estimationPoints || undefined,
      });

      // Link labels if provided
      if (options?.labelIds && options.labelIds.length > 0 && newTask?.id) {
        await supabase.from('task_labels').insert(
          options.labelIds.map((labelId) => ({
            task_id: newTask.id,
            label_id: labelId,
          }))
        );
      }

      // Link projects if provided
      if (options?.projectIds && options.projectIds.length > 0 && newTask?.id) {
        await supabase.from('task_project_tasks').insert(
          options.projectIds.map((projectId) => ({
            task_id: newTask.id,
            project_id: projectId,
          }))
        );
      }

      // Link assignees if provided
      if (
        options?.assigneeIds &&
        options.assigneeIds.length > 0 &&
        newTask?.id
      ) {
        await supabase.from('task_assignees').insert(
          options.assigneeIds.map((assigneeId) => ({
            task_id: newTask.id,
            user_id: assigneeId,
          }))
        );
      }

      if (newTask) {
        toast.success(
          <div className="flex flex-col">
            <span>Task created successfully!</span>
            <button
              type="button"
              onClick={() => openTaskById(newTask.id)}
              className="mt-1 text-left font-bold text-dynamic-blue text-sm hover:underline"
            >
              Go to task
            </button>
          </div>
        );
        setPendingTaskTitle('');
        setCommandBarInput('');
        // Refresh the page data
        handleUpdate();
        return true;
      } else {
        toast.error('Fail to create task');
        return false;
      }
    } catch (error: any) {
      console.error('Error creating task:', error);
      toast.error(error.message || 'Failed to create task');
      return false;
    } finally {
      setCommandBarLoading(false);
    }
  };

  const handleGenerateAI = (entry: string) => {
    const trimmedEntry = entry.trim();
    if (!trimmedEntry) {
      toast.error(t('ws-tasks.errors.missing_task_description'));
      return;
    }

    // If destination is not yet confirmed, store entry and open selector
    if (!selectedBoardId || !selectedListId) {
      setPendingTaskTitle(trimmedEntry);
      setTaskCreatorMode('ai');
      setBoardSelectorOpen(true);
      return;
    }

    // Generate preview with AI
    let timestampMoment = dayjs().tz(clientTimezone);
    if (!timestampMoment.isValid()) {
      timestampMoment = dayjs();
    }
    const clientTimestamp = timestampMoment.toISOString();

    previewMutation.mutate({
      entry: trimmedEntry,
      generateDescriptions: aiGenerateDescriptions,
      generatePriority: aiGeneratePriority,
      generateLabels: aiGenerateLabels,
      clientTimezone,
      clientTimestamp,
    });
  };

  const handleBoardSelectorConfirm = async () => {
    setBoardSelectorOpen(false);

    if (pendingTaskTitle && taskCreatorMode === 'ai') {
      // Generate AI preview
      handleGenerateAI(pendingTaskTitle);
    } else if (pendingTaskTitle && taskCreatorMode === 'simple') {
      // Create task directly
      const success = await handleCreateTask(pendingTaskTitle);
      if (success) {
        setCommandBarInput('');
      }
    }
  };

  // Get selected destination details for CommandBar
  const selectedDestination = useMemo(() => {
    if (!selectedBoardId || !selectedListId) return null;

    const board = boardsData.find((b: any) => b.id === selectedBoardId);
    const lists = (board?.task_lists as any[]) || [];
    const list = lists.find((l: any) => l.id === selectedListId);

    return {
      boardName: board?.name || 'Unknown Board',
      listName: list?.name || 'Unknown List',
    };
  }, [selectedBoardId, selectedListId, boardsData]);

  const handleClearDestination = () => {
    setSelectedBoardId('');
    setSelectedListId('');
    setPendingTaskTitle('');
    setTaskCreatorMode(null);
  };

  const handleFilterChange = useCallback(
    (newFilters: Partial<typeof taskFilters>) => {
      setTaskFilters((prev) => ({ ...prev, ...newFilters }));
    },
    []
  );

  const handleLabelFilterChange = useCallback((ids: string[]) => {
    setTaskFilters((prev) => ({ ...prev, labelIds: ids }));
  }, []);

  const handleProjectFilterChange = useCallback((ids: string[]) => {
    setTaskFilters((prev) => ({ ...prev, projectIds: ids }));
  }, []);

  // Label creation handlers
  const handleCreateNewLabel = async () => {
    if (!newLabelName.trim()) return;

    setCreatingLabel(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from('workspace_task_labels').insert({
        ws_id: wsId,
        name: newLabelName.trim(),
        color: newLabelColor,
      });

      if (error) throw error;

      // Invalidate labels query to refresh the list
      queryClient.invalidateQueries({
        queryKey: ['workspace', wsId, 'labels'],
      });

      toast.success('Label created successfully!');
      setNewLabelDialogOpen(false);
      setNewLabelName('');
      setNewLabelColor('#3b82f6');
    } catch (error: any) {
      console.error('Error creating label:', error);
      toast.error(error.message || 'Failed to create label');
    } finally {
      setCreatingLabel(false);
    }
  };

  // Project creation handlers
  const handleCreateNewProject = async () => {
    if (!newProjectName.trim()) return;

    setCreatingProject(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from('task_projects').insert({
        ws_id: wsId,
        name: newProjectName.trim(),
      });

      if (error) throw error;

      // Invalidate projects query to refresh the list
      queryClient.invalidateQueries({
        queryKey: ['workspace', wsId, 'projects'],
      });

      toast.success('Project created successfully!');
      setNewProjectDialogOpen(false);
      setNewProjectName('');
    } catch (error: any) {
      console.error('Error creating project:', error);
      toast.error(error.message || 'Failed to create project');
    } finally {
      setCreatingProject(false);
    }
  };

  // Reset board selection when workspace changes
  useMemo(() => {
    if (selectedWorkspaceId && boardSelectorOpen) {
      setSelectedBoardId('');
      setSelectedListId('');
    }
  }, [selectedWorkspaceId, boardSelectorOpen]);

  const allVisibleTasks = useMemo(() => {
    return [
      ...(overdueTasks || []),
      ...(todayTasks || []),
      ...(upcomingTasks || []),
    ];
  }, [overdueTasks, todayTasks, upcomingTasks]);

  const allVisibleLabels = useMemo(() => {
    const labelIds = new Set<string>();
    allVisibleTasks.forEach((task) => {
      task.labels?.forEach((l) => {
        if (l.label) {
          labelIds.add(l.label.id);
        }
      });
    });
    return workspaceLabels.filter((label) => labelIds.has(label.id));
  }, [allVisibleTasks, workspaceLabels]);

  const allVisibleProjects = useMemo(() => {
    const projectIds = new Set<string>();
    allVisibleTasks.forEach((task) => {
      task.projects?.forEach((p) => {
        if (p.project) {
          projectIds.add(p.project.id);
        }
      });
    });
    return workspaceProjects.filter((project) => projectIds.has(project.id));
  }, [allVisibleTasks, workspaceProjects]);

  const tasksFilteredByWorkspaceAndBoard = useMemo(() => {
    const { workspaceIds, boardIds } = taskFilters;

    if (workspaceIds.includes('all') && boardIds.includes('all')) {
      return { overdueTasks, todayTasks, upcomingTasks };
    }

    const filterFn = (task: TaskWithRelations) => {
      const wsOk =
        workspaceIds.includes('all') ||
        workspaceIds.includes(task.list?.board?.ws_id ?? '');
      const boardOk =
        boardIds.includes('all') ||
        boardIds.includes(task.list?.board?.id ?? '');
      return wsOk && boardOk;
    };

    return {
      overdueTasks: overdueTasks?.filter(filterFn),
      todayTasks: todayTasks?.filter(filterFn),
      upcomingTasks: upcomingTasks?.filter(filterFn),
    };
  }, [taskFilters, overdueTasks, todayTasks, upcomingTasks]);

  const availableLabels = useMemo(() => {
    const { workspaceIds, boardIds } = taskFilters;
    if (workspaceIds.includes('all') && boardIds.includes('all')) {
      return allVisibleLabels;
    }

    const allTasks = [
      ...(tasksFilteredByWorkspaceAndBoard.overdueTasks || []),
      ...(tasksFilteredByWorkspaceAndBoard.todayTasks || []),
      ...(tasksFilteredByWorkspaceAndBoard.upcomingTasks || []),
    ];
    const labelIds = new Set<string>();
    allTasks.forEach((task) => {
      task.labels?.forEach((l) => {
        if (l.label) {
          labelIds.add(l.label.id);
        }
      });
    });
    return allVisibleLabels.filter((label) => labelIds.has(label.id));
  }, [tasksFilteredByWorkspaceAndBoard, allVisibleLabels, taskFilters]);

  const availableProjects = useMemo(() => {
    const { workspaceIds, boardIds } = taskFilters;
    if (workspaceIds.includes('all') && boardIds.includes('all')) {
      return allVisibleProjects;
    }

    const allTasks = [
      ...(tasksFilteredByWorkspaceAndBoard.overdueTasks || []),
      ...(tasksFilteredByWorkspaceAndBoard.todayTasks || []),
      ...(tasksFilteredByWorkspaceAndBoard.upcomingTasks || []),
    ];
    const projectIds = new Set<string>();
    allTasks.forEach((task) => {
      task.projects?.forEach((p) => {
        if (p.project) {
          projectIds.add(p.project.id);
        }
      });
    });
    return allVisibleProjects.filter((project) => projectIds.has(project.id));
  }, [tasksFilteredByWorkspaceAndBoard, allVisibleProjects, taskFilters]);

  const filteredTasks = useMemo(() => {
    const { workspaceIds, boardIds, labelIds, projectIds } = taskFilters;

    if (
      workspaceIds.includes('all') &&
      boardIds.includes('all') &&
      labelIds.length === 0 &&
      projectIds.length === 0
    ) {
      return { overdueTasks, todayTasks, upcomingTasks };
    }

    const filterFn = (task: TaskWithRelations) => {
      const wsOk =
        workspaceIds.includes('all') ||
        workspaceIds.includes(task.list?.board?.ws_id ?? '');
      const boardOk =
        boardIds.includes('all') ||
        boardIds.includes(task.list?.board?.id ?? '');
      const labelOk =
        labelIds.length === 0 ||
        task.labels?.some((l) => l.label && labelIds.includes(l.label.id));
      const projectOk =
        projectIds.length === 0 ||
        task.projects?.some(
          (p) => p.project && projectIds.includes(p.project.id)
        );

      return wsOk && boardOk && labelOk && projectOk;
    };

    return {
      overdueTasks: overdueTasks?.filter(filterFn),
      todayTasks: todayTasks?.filter(filterFn),
      upcomingTasks: upcomingTasks?.filter(filterFn),
    };
  }, [taskFilters, overdueTasks, todayTasks, upcomingTasks]);

  // Auto-select first board and list when dialog opens or workspace changes

  return (
    <div className="space-y-6">
      {/* Header with stats */}
      <div className="flex min-h-[72px] flex-col items-center justify-between gap-2 px-1 md:flex-row md:gap-4">
        <div className="fade-in slide-in-from-left-2 animate-in space-y-1 duration-300">
          <h1 className="font-bold text-xl tracking-tight md:text-4xl">
            {t('sidebar_tabs.my_tasks')}
          </h1>
        </div>
        <div className="fade-in slide-in-from-right-2 flex animate-in items-center gap-2 duration-300">
          <Badge
            variant="destructive"
            className="gap-1.5 rounded-full px-3 py-1.5 font-semibold shadow-sm"
          >
            <Clock className="h-3.5 w-3.5" />
            <span className="hidden text-sm lg:inline">Overdue: </span>
            <span className="text-sm">{overdueCount}</span>
          </Badge>
          <Badge
            variant="secondary"
            className="gap-1.5 rounded-full bg-dynamic-orange/10 px-3 py-1.5 font-semibold text-dynamic-orange shadow-sm"
          >
            <Calendar className="h-3.5 w-3.5" />
            <span className="hidden text-sm lg:inline">Today: </span>
            <span className="text-sm">{todayCount}</span>
          </Badge>
          <Badge
            variant="secondary"
            className="gap-1.5 rounded-full bg-dynamic-blue/10 px-3 py-1.5 font-semibold text-dynamic-blue shadow-sm"
          >
            <Flag className="h-3.5 w-3.5" />
            <span className="hidden text-sm lg:inline">Upcoming: </span>
            <span className="text-sm">{upcomingCount}</span>
          </Badge>
        </div>
      </div>

      {/* Command Bar - The single entry point for task creation */}
      <div className="mx-auto max-w-5xl">
        <CommandBar
          value={commandBarInput}
          onValueChange={setCommandBarInput}
          onCreateTask={handleCreateTask}
          onGenerateAI={handleGenerateAI}
          onOpenBoardSelector={(title, isAi) => {
            if (title) {
              setPendingTaskTitle(title);
              setTaskCreatorMode(isAi ? 'ai' : 'simple');
            } else {
              setPendingTaskTitle('');
              setTaskCreatorMode(null);
            }
            setBoardSelectorOpen(true);
          }}
          selectedDestination={selectedDestination}
          onClearDestination={handleClearDestination}
          isLoading={commandBarLoading || previewMutation.isPending}
          aiGenerateDescriptions={aiGenerateDescriptions}
          aiGeneratePriority={aiGeneratePriority}
          aiGenerateLabels={aiGenerateLabels}
          onAiGenerateDescriptionsChange={setAiGenerateDescriptions}
          onAiGeneratePriorityChange={setAiGeneratePriority}
          onAiGenerateLabelsChange={setAiGenerateLabels}
          workspaceLabels={workspaceLabels}
          workspaceProjects={workspaceProjects}
          workspaceMembers={workspaceMembers}
          workspaceEstimationConfig={
            boardConfig
              ? {
                  estimation_type: boardConfig.estimation_type,
                  extended_estimation: boardConfig.extended_estimation,
                  allow_zero_estimates: boardConfig.allow_zero_estimates,
                }
              : null
          }
          wsId={wsId}
          onCreateNewLabel={() => setNewLabelDialogOpen(true)}
          onCreateNewProject={() => setNewProjectDialogOpen(true)}
        />
        <p className="mt-2 text-muted-foreground text-xs">
          Pro tip: You can further configure your task after selecting a
          location
        </p>
      </div>

      {/* Spacer for breathing room */}
      <div className="h-4" />

      {isPersonal && (
        <div className="space-y-2">
          <div className="flex flex-nowrap justify-start gap-2">
            <TaskFilter
              workspaces={(workspacesData || []).map((ws) => ({
                ...ws,
                name: ws.name || 'Unnamed Workspace',
              }))}
              boards={(allBoardsData || []).map((board) => ({
                ...board,
                name: board.name || 'Unnamed Board',
              }))}
              onFilterChange={handleFilterChange}
              onCreateNewBoard={() => {
                setNewBoardName('');
                setNewBoardDialogOpen(true);
              }}
            />
            <LabelProjectFilter
              labels={availableLabels || []}
              projects={availableProjects || []}
              selectedLabelIds={taskFilters.labelIds}
              selectedProjectIds={taskFilters.projectIds}
              onSelectedLabelIdsChange={handleLabelFilterChange}
              onSelectedProjectIdsChange={handleProjectFilterChange}
            />

            {/* Filter Chips */}
            {(taskFilters.workspaceIds.length > 1 ||
              !taskFilters.workspaceIds.includes('all') ||
              taskFilters.boardIds.length > 1 ||
              !taskFilters.boardIds.includes('all') ||
              taskFilters.labelIds.length > 0 ||
              taskFilters.projectIds.length > 0) && (
              <div className="flex items-center gap-2">
                {(!taskFilters.workspaceIds.includes('all') ||
                  !taskFilters.boardIds.includes('all')) && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Badge
                          variant="secondary"
                          className="group/chip flex items-center gap-x-1.5 rounded-md bg-dynamic-blue/10 px-2.5 py-1 font-medium text-dynamic-blue text-sm"
                        >
                          <span>
                            {(() => {
                              const selectedWorkspaces = workspacesData?.filter(
                                (ws) => taskFilters.workspaceIds.includes(ws.id)
                              );
                              const selectedBoards = allBoardsData?.filter(
                                (b) => taskFilters.boardIds.includes(b.id)
                              );

                              const workspaceText =
                                !taskFilters.workspaceIds.includes('all')
                                  ? taskFilters.workspaceIds.length > 1
                                    ? `${taskFilters.workspaceIds.length} Workspaces`
                                    : selectedWorkspaces?.[0]?.name
                                  : '';

                              const boardText = !taskFilters.boardIds.includes(
                                'all'
                              )
                                ? taskFilters.boardIds.length > 1
                                  ? `${taskFilters.boardIds.length} Boards`
                                  : selectedBoards?.[0]?.name
                                : '';

                              if (workspaceText && boardText) {
                                return `${workspaceText} / ${boardText}`;
                              } else if (workspaceText) {
                                return workspaceText;
                              } else if (boardText) {
                                return boardText;
                              }
                              return '';
                            })()}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setTaskFilters((prev) => ({
                                ...prev,
                                workspaceIds: ['all'],
                                boardIds: ['all'],
                              }))
                            }
                            className="h-full w-0 overflow-hidden pr-0 opacity-0 transition-all group-hover/chip:w-4 group-hover/chip:pr-1 group-hover/chip:opacity-100"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </Badge>
                      </TooltipTrigger>
                      {(taskFilters.workspaceIds.length > 1 ||
                        taskFilters.boardIds.length > 1) && (
                        <TooltipContent>
                          {!taskFilters.workspaceIds.includes('all') &&
                            workspacesData
                              ?.filter((ws) =>
                                taskFilters.workspaceIds.includes(ws.id)
                              )
                              .map((ws) => <div key={ws.id}>{ws.name}</div>)}
                          {!taskFilters.boardIds.includes('all') &&
                            allBoardsData
                              ?.filter((b) =>
                                taskFilters.boardIds.includes(b.id)
                              )
                              .map((b) => <div key={b.id}>{b.name}</div>)}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                )}
                {taskFilters.labelIds.length > 0 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Badge
                          variant="secondary"
                          className="group/chip flex items-center gap-x-1.5 rounded-md bg-dynamic-blue/10 px-2.5 py-1 font-medium text-dynamic-blue text-sm"
                        >
                          <Tag className="h-3.5 w-3.5" />
                          <span>
                            {taskFilters.labelIds.length > 1
                              ? `${taskFilters.labelIds.length} Labels`
                              : workspaceLabels?.find(
                                  (l) => l.id === taskFilters.labelIds[0]
                                )?.name}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setTaskFilters((prev) => ({
                                ...prev,
                                labelIds: [],
                              }))
                            }
                            className="h-full w-0 overflow-hidden pr-0 opacity-0 transition-all group-hover/chip:w-4 group-hover/chip:pr-1 group-hover/chip:opacity-100"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </Badge>
                      </TooltipTrigger>
                      {taskFilters.labelIds.length > 1 && (
                        <TooltipContent>
                          {workspaceLabels
                            ?.filter((l) => taskFilters.labelIds.includes(l.id))
                            .map((l) => (
                              <div key={l.id}>{l.name}</div>
                            ))}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                )}
                {taskFilters.projectIds.length > 0 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Badge
                          variant="secondary"
                          className="group/chip flex items-center gap-x-1.5 rounded-md bg-dynamic-blue/10 px-2.5 py-1 font-medium text-dynamic-blue text-sm"
                        >
                          <Box className="h-3.5 w-3.5" />
                          <span>
                            {taskFilters.projectIds.length > 1
                              ? `${taskFilters.projectIds.length} Projects`
                              : workspaceProjects?.find(
                                  (p) => p.id === taskFilters.projectIds[0]
                                )?.name}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setTaskFilters((prev) => ({
                                ...prev,
                                projectIds: [],
                              }))
                            }
                            className="h-full w-0 overflow-hidden pr-0 opacity-0 transition-all group-hover/chip:w-4 group-hover/chip:pr-1 group-hover/chip:opacity-100"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </Badge>
                      </TooltipTrigger>
                      {taskFilters.projectIds.length > 1 && (
                        <TooltipContent>
                          {workspaceProjects
                            ?.filter((p) =>
                              taskFilters.projectIds.includes(p.id)
                            )
                            .map((p) => (
                              <div key={p.id}>{p.name}</div>
                            ))}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content Area - Task List */}
      <div className="fade-in mt-6 animate-in space-y-6 duration-300">
        <TaskList
          wsId={wsId}
          isPersonal={isPersonal}
          commandBarLoading={commandBarLoading || previewMutation.isPending}
          isAiGenerating={previewMutation.isPending}
          overdueTasks={filteredTasks.overdueTasks}
          todayTasks={filteredTasks.todayTasks}
          upcomingTasks={filteredTasks.upcomingTasks}
          totalActiveTasks={totalActiveTasks}
          collapsedSections={collapsedSections}
          toggleSection={toggleSection}
          handleUpdate={handleUpdate}
        />
      </div>

      {/* Board & List Selection Dialog */}
      <Dialog open={boardSelectorOpen} onOpenChange={setBoardSelectorOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-orange/10">
                <LayoutDashboard className="h-4 w-4 text-dynamic-orange" />
              </div>
              Select Board & List
            </DialogTitle>
            <DialogDescription>
              Choose where to create your new task
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Workspace Selection (Personal workspace only) */}
            {isPersonal && workspacesData && workspacesData.length > 0 && (
              <div className="space-y-2">
                <Label
                  htmlFor="workspace-select"
                  className="flex items-center gap-2"
                >
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Workspace
                </Label>
                <Select
                  value={selectedWorkspaceId}
                  onValueChange={setSelectedWorkspaceId}
                >
                  <SelectTrigger id="workspace-select" className="w-full">
                    <SelectValue placeholder="Select a workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    {workspacesData.map((workspace: any) => (
                      <SelectItem key={workspace.id} value={workspace.id}>
                        {workspace.name || 'Unnamed Workspace'}
                        {workspace.personal && ' (Personal)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Board Selection */}
            <div className="space-y-2">
              <Label htmlFor="board-select" className="flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                Board
              </Label>
              <Combobox
                t={t}
                mode="single"
                options={boardsData.map((board: any) => ({
                  value: board.id,
                  label: board.name || 'Unnamed Board',
                }))}
                label={boardsLoading ? 'Loading...' : undefined}
                placeholder="Select a board"
                selected={selectedBoardId}
                onChange={(value) => setSelectedBoardId(value as string)}
                onCreate={(name) => {
                  setNewBoardName(name);
                  setNewBoardDialogOpen(true);
                }}
                disabled={boardsLoading}
                className="w-full"
              />
            </div>

            {/* List Selection */}
            <div className="space-y-2">
              <Label htmlFor="list-select" className="flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-muted-foreground" />
                List
              </Label>
              <Combobox
                t={t}
                mode="single"
                options={availableLists.map((list: any) => ({
                  value: list.id,
                  label: list.name || 'Unnamed List',
                }))}
                placeholder={
                  !selectedBoardId
                    ? 'Select a board first'
                    : 'Select or create a list'
                }
                selected={selectedListId}
                onChange={(value) => setSelectedListId(value as string)}
                onCreate={(name) => {
                  setNewListName(name);
                  setNewListDialogOpen(true);
                }}
                disabled={!selectedBoardId}
                className="w-full"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBoardSelectorOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleBoardSelectorConfirm}
              disabled={!selectedListId}
            >
              {taskCreatorMode ? 'Create task' : 'Continue'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Board Creation Dialog */}
      <Dialog open={newBoardDialogOpen} onOpenChange={setNewBoardDialogOpen}>
        <DialogContent
          className="p-0"
          style={
            {
              maxWidth: '1200px',
              width: '85vw',
            } as React.CSSProperties
          }
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <TaskBoardForm
            wsId={selectedWorkspaceId}
            data={{ name: newBoardName }}
            onFinish={(formData) => {
              setNewBoardDialogOpen(false);
              setNewBoardName('');
              // Auto-select the newly created board
              if (formData?.id) {
                setSelectedBoardId(formData.id);
              }
              queryClient.invalidateQueries({
                queryKey: [
                  'workspace',
                  selectedWorkspaceId,
                  'boards-with-lists',
                ],
              });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* List Creation Dialog */}
      {selectedBoardId && (
        <CreateListDialog
          open={newListDialogOpen}
          onOpenChange={setNewListDialogOpen}
          boardId={selectedBoardId}
          wsId={selectedWorkspaceId}
          initialName={newListName}
          onSuccess={(listId) => {
            setSelectedListId(listId);
            setNewListName('');
          }}
        />
      )}

      {/* AI Preview Dialog */}
      <TaskPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        previewEntry={previewEntry}
        pendingTaskTitle={pendingTaskTitle}
        lastResult={lastResult}
        selectedListId={selectedListId}
        boardsData={boardsData}
        workspaceLabels={workspaceLabels}
        workspaceProjects={workspaceProjects}
        boardConfig={boardConfig}
        aiGenerateDescriptions={aiGenerateDescriptions}
        aiGeneratePriority={aiGeneratePriority}
        aiGenerateLabels={aiGenerateLabels}
        clientTimezone={clientTimezone}
        selectedLabelIds={selectedLabelIds}
        setSelectedLabelIds={setSelectedLabelIds}
        currentPreviewIndex={currentPreviewIndex}
        setCurrentPreviewIndex={setCurrentPreviewIndex}
        createTasksMutation={createTasksMutation}
      />

      {/* Label Creation Dialog */}
      <TaskNewLabelDialog
        open={newLabelDialogOpen}
        newLabelName={newLabelName}
        newLabelColor={newLabelColor}
        creatingLabel={creatingLabel}
        onOpenChange={setNewLabelDialogOpen}
        onNameChange={setNewLabelName}
        onColorChange={setNewLabelColor}
        onConfirm={handleCreateNewLabel}
      />

      {/* Project Creation Dialog */}
      <TaskNewProjectDialog
        open={newProjectDialogOpen}
        newProjectName={newProjectName}
        creatingProject={creatingProject}
        onOpenChange={setNewProjectDialogOpen}
        onNameChange={setNewProjectName}
        onConfirm={handleCreateNewProject}
      />
    </div>
  );
}
