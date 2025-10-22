'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/react';
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Flag,
  LayoutDashboard,
  ListTodo,
  Loader2,
  MoreHorizontal,
  Plus,
  Trash2,
  Users,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskWithRelations } from '@tuturuuu/types/db';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
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
import { TaskEstimationMenu } from '@tuturuuu/ui/tu-do/boards/boardId/menus/task-estimation-menu';
import { TaskLabelsMenu } from '@tuturuuu/ui/tu-do/boards/boardId/menus/task-labels-menu';
import { TaskPriorityMenu } from '@tuturuuu/ui/tu-do/boards/boardId/menus/task-priority-menu';
import { TaskProjectsMenu } from '@tuturuuu/ui/tu-do/boards/boardId/menus/task-projects-menu';
import { TaskNewLabelDialog } from '@tuturuuu/ui/tu-do/boards/boardId/task-dialogs/TaskNewLabelDialog';
import { TaskNewProjectDialog } from '@tuturuuu/ui/tu-do/boards/boardId/task-dialogs/TaskNewProjectDialog';
import { TaskBoardForm } from '@tuturuuu/ui/tu-do/boards/form';
import { useTaskDialog } from '@tuturuuu/ui/tu-do/hooks/useTaskDialog';
import { TaskEstimationDisplay } from '@tuturuuu/ui/tu-do/shared/task-estimation-display';
import { cn } from '@tuturuuu/utils/format';
import { useBoardConfig } from '@tuturuuu/utils/task-helper';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TaskListWithCompletion from '../../(dashboard)/tasks/task-list-with-completion';
import { CommandBar, type CommandMode, type TaskOptions } from './command-bar';
import NotesList from './notes-list';

dayjs.extend(utc);
dayjs.extend(timezone);

const MAX_LABEL_SUGGESTIONS = 6;
const MAX_VISIBLE_PREVIEW_LABELS = 3;
const MAX_VISIBLE_WORKSPACE_LABELS = 12;

const normalizeLabel = (value: string) => value.trim().toLowerCase();

const formatLabel = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(' ');

// Helper to convert plain text to TipTap JSONContent
const textToJSONContent = (text: string): JSONContent => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text,
        },
      ],
    },
  ],
});

const adjustDateToEndOfDay = (value: Date) => {
  const next = new Date(value);
  if (
    next.getHours() === 0 &&
    next.getMinutes() === 0 &&
    next.getSeconds() === 0 &&
    next.getMilliseconds() === 0
  ) {
    next.setHours(23, 59, 59, 999);
  }
  return next;
};

const parseDueDateToState = (value: string | null | undefined) => {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return adjustDateToEndOfDay(parsed);
};

const formatDueDateForPayload = (value: Date | undefined) =>
  value ? adjustDateToEndOfDay(value).toISOString() : null;

const priorityBadgeClass = (priority: TaskPriority | null) => {
  switch (priority) {
    case 'critical':
      return 'border-dynamic-red/60 bg-dynamic-red/15 text-dynamic-red';
    case 'high':
      return 'border-dynamic-orange/60 bg-dynamic-orange/15 text-dynamic-orange';
    case 'normal':
      return 'border-dynamic-yellow/60 bg-dynamic-yellow/15 text-dynamic-yellow';
    case 'low':
      return 'border-dynamic-blue/60 bg-dynamic-blue/15 text-dynamic-blue';
    default:
      return 'border-dynamic-muted/60 bg-dynamic-muted/15 text-muted-foreground';
  }
};

const getPriorityCopy = (priority: TaskPriority | null) => {
  switch (priority) {
    case 'critical':
      return 'Urgent';
    case 'high':
      return 'High';
    case 'normal':
      return 'Medium';
    case 'low':
      return 'Low';
    default:
      return 'No Priority';
  }
};

const LABEL_COLOR_CLASSES: Record<string, string> = {
  gray: 'border-dynamic-gray/60 bg-dynamic-gray/15 text-dynamic-gray',
  red: 'border-dynamic-red/60 bg-dynamic-red/15 text-dynamic-red',
  orange: 'border-dynamic-orange/60 bg-dynamic-orange/15 text-dynamic-orange',
  yellow: 'border-dynamic-yellow/60 bg-dynamic-yellow/15 text-dynamic-yellow',
  green: 'border-dynamic-green/60 bg-dynamic-green/15 text-dynamic-green',
  blue: 'border-dynamic-blue/60 bg-dynamic-blue/15 text-dynamic-blue',
  purple: 'border-dynamic-purple/60 bg-dynamic-purple/15 text-dynamic-purple',
  pink: 'border-dynamic-pink/60 bg-dynamic-pink/15 text-dynamic-pink',
};

interface JournalTaskResponse {
  tasks?: Array<{
    id: string;
    name: string;
    description: string | null;
    priority: TaskPriority | null;
    labelSuggestions?: string[];
    dueDate?: string | null;
    labels?: ProvidedTaskLabelPayload[];
    estimationPoints?: number | null;
    projectIds?: string[];
  }>;
  metadata?: {
    generatedWithAI?: boolean;
    totalTasks?: number;
  };
}

interface ProvidedTaskLabelPayload {
  id?: string;
  name: string;
}

interface TaskLabelOption {
  id: string | null;
  name: string;
  displayName: string;
  isNew: boolean;
  selected: boolean;
}

interface TaskLabelSelection {
  suggestions: TaskLabelOption[];
}

interface WorkspaceLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

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
  const { createTask, onUpdate } = useTaskDialog();
  const [activeMode, setActiveMode] = useState<CommandMode>('task');
  const [boardSelectorOpen, setBoardSelectorOpen] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(wsId);
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [newBoardDialogOpen, setNewBoardDialogOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState<string>('');
  const [commandBarLoading, setCommandBarLoading] = useState(false);

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
  const [lastResult, setLastResult] = useState<JournalTaskResponse | null>(
    null
  );
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [taskLabelSelections, setTaskLabelSelections] = useState<
    TaskLabelSelection[]
  >([]);
  const [taskDueDates, setTaskDueDates] = useState<(Date | undefined)[]>([]);
  const [expandedLabelCards, setExpandedLabelCards] = useState<
    Record<number, boolean>
  >({});
  const [workspaceLabelsExpanded, setWorkspaceLabelsExpanded] = useState(false);
  const lastInitializedLabelsKey = useRef<string | null>(null);
  const lastInitializedDueDatesKey = useRef<string | null>(null);

  // Inline editing state for preview tasks
  const [previewTaskMenuOpen, setPreviewTaskMenuOpen] = useState<
    Record<number, boolean>
  >({});
  const [previewTaskNames, setPreviewTaskNames] = useState<
    Record<number, string>
  >({});
  const [previewTaskDescriptions, setPreviewTaskDescriptions] = useState<
    Record<number, string | null>
  >({});
  const [previewTaskPriorities, setPreviewTaskPriorities] = useState<
    Record<number, TaskPriority | null>
  >({});
  const [previewTaskProjects, setPreviewTaskProjects] = useState<
    Record<number, string[]>
  >({});
  const [previewTaskEstimations, setPreviewTaskEstimations] = useState<
    Record<number, number | null>
  >({});
  const [removedTaskIndices, setRemovedTaskIndices] = useState<Set<number>>(
    new Set()
  );
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const [editingTaskTitle, setEditingTaskTitle] = useState<number | null>(null);
  const [editingTaskDescription, setEditingTaskDescription] = useState<
    number | null
  >(null);

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
      if (currentPath.endsWith('/my-tasks')) {
        // Already on my-tasks, just refresh
        console.log('🔄 Refreshing current page...');
        router.refresh();
      } else if (
        currentPath.includes('/tasks/') &&
        currentPath.match(/\/tasks\/[^/]+$/)
      ) {
        // On a task detail page - navigate back to my-tasks
        console.log('🔄 Navigating back to My Tasks...');
        router.push(`/${wsId}/tasks/my-tasks`);
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
    enabled: isPersonal && boardSelectorOpen,
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
        .eq('deleted', false)
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

  // Fetch workspace labels (always fetch for CommandBar)
  const { data: workspaceLabels = [] } = useQuery({
    queryKey: ['workspace', wsId, 'labels'],
    queryFn: async () => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/labels`);
      if (!response.ok) {
        throw new Error('Failed to fetch labels');
      }
      return (await response.json()) as WorkspaceLabel[];
    },
  });

  // Fetch workspace projects for CommandBar
  const { data: workspaceProjects = [] } = useQuery({
    queryKey: ['workspace', wsId, 'projects'],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('task_projects')
        .select('id, name')
        .eq('ws_id', wsId)
        .order('name', { ascending: true });

      if (error) throw error;
      return data || [];
    },
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

  const sortedLabels = useMemo(
    () =>
      aiGenerateLabels
        ? [...workspaceLabels].sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
          )
        : [],
    [workspaceLabels, aiGenerateLabels]
  );

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

  // Create note mutation (for CommandBar)
  const createNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      const jsonContent = textToJSONContent(content);
      const response = await fetch(`/api/v1/workspaces/${wsId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: jsonContent }),
      });
      if (!response.ok) throw new Error('Failed to create note');
      return response.json();
    },
    onSuccess: () => {
      toast.success('Note created successfully');
      queryClient.invalidateQueries({ queryKey: ['workspace', wsId, 'notes'] });
    },
    onError: () => {
      toast.error('Failed to create note');
    },
  });

  const handleCreateNote = async (content: string) => {
    setCommandBarLoading(true);
    try {
      await createNoteMutation.mutateAsync(content);
    } finally {
      setCommandBarLoading(false);
    }
  };

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
      setTaskCreatorMode(null);
      handleUpdate();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create tasks');
    },
  });

  const handleCreateTask = async (title: string, options?: TaskOptions) => {
    // If destination is not yet confirmed, open selector first
    if (!selectedBoardId || !selectedListId) {
      setPendingTaskTitle(title);
      setTaskCreatorMode('simple');
      setBoardSelectorOpen(true);
      return;
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

      toast.success('Task created successfully!');
      setPendingTaskTitle('');

      // Refresh the page data
      handleUpdate();
    } catch (error: any) {
      console.error('Error creating task:', error);
      toast.error(error.message || 'Failed to create task');
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

  const handleBoardSelectorConfirm = () => {
    setBoardSelectorOpen(false);

    if (pendingTaskTitle && taskCreatorMode === 'ai') {
      // Generate AI preview
      handleGenerateAI(pendingTaskTitle);
    } else if (pendingTaskTitle && taskCreatorMode === 'simple') {
      // Open simple task creator with centralized dialog
      createTask(selectedBoardId, selectedListId, availableLists);
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

  // Label creation handlers
  const handleCreateNewLabel = async () => {
    if (!newLabelName.trim()) return;

    setCreatingLabel(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('workspace_task_labels')
        .insert({
          ws_id: wsId,
          name: newLabelName.trim(),
          color: newLabelColor,
        })

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
      const { error } = await supabase
        .from('task_projects')
        .insert({
          ws_id: wsId,
          name: newProjectName.trim(),
        })

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

  // Preview dialog handlers
  const handleCancelPreview = () => {
    if (createTasksMutation.isPending) return;
    setPreviewOpen(false);
    setLastResult(null);
    setPreviewEntry(null);
    setPendingTaskTitle('');
    setTaskCreatorMode(null);
    setCurrentPreviewIndex(0);
    setEditingTaskTitle(null);
    setEditingTaskDescription(null);
  };

  // Navigation handlers for preview dialog
  const handleNextTask = () => {
    if (createTasksMutation.isPending) return;
    const visibleTasks = previewTasks.filter(
      (_, index) => !removedTaskIndices.has(index)
    );
    if (currentPreviewIndex < visibleTasks.length - 1) {
      setEditingTaskTitle(null);
      setEditingTaskDescription(null);
      setCurrentPreviewIndex((prev) => prev + 1);
    }
  };

  const handlePreviousTask = () => {
    if (createTasksMutation.isPending) return;
    if (currentPreviewIndex > 0) {
      setEditingTaskTitle(null);
      setEditingTaskDescription(null);
      setCurrentPreviewIndex((prev) => prev - 1);
    }
  };

  const toggleLabel = (labelId: string) => {
    if (createTasksMutation.isPending) return;
    setSelectedLabelIds((prev) =>
      prev.includes(labelId)
        ? prev.filter((id) => id !== labelId)
        : [...prev, labelId]
    );
  };

  const toggleWorkspaceLabelsExpansion = () => {
    if (createTasksMutation.isPending) return;
    setWorkspaceLabelsExpanded((prev) => !prev);
  };

  const toggleTaskLabelSuggestion = (
    taskIndex: number,
    optionIndex: number
  ) => {
    if (!aiGenerateLabels || createTasksMutation.isPending) return;

    setTaskLabelSelections((prev) => {
      if (!prev[taskIndex]) return prev;

      const next = prev.map((selection, index) => {
        if (index !== taskIndex) return selection;

        return {
          suggestions: selection.suggestions.map((option, currentIndex) => {
            if (currentIndex !== optionIndex) return option;

            return {
              ...option,
              selected: !option.selected,
            };
          }),
        };
      });

      return next;
    });
  };

  const toggleLabelPreviewExpansion = (index: number) => {
    if (createTasksMutation.isPending) return;
    setExpandedLabelCards((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const handleDueDateChange = (index: number, date: Date | undefined) => {
    if (createTasksMutation.isPending) return;
    setTaskDueDates((prev) => {
      const next = [...prev];
      next[index] = date;
      return next;
    });
  };

  // Inline editing handlers for preview tasks
  const handlePreviewTaskPriorityChange = (
    index: number,
    priority: TaskPriority | null
  ) => {
    if (createTasksMutation.isPending) return;
    setPreviewTaskPriorities((prev) => ({
      ...prev,
      [index]: priority,
    }));
  };

  const handlePreviewTaskLabelToggle = (index: number, labelId: string) => {
    if (createTasksMutation.isPending) return;

    // Find the option index for this label ID in the task's label selections
    const selection = taskLabelSelections[index];
    if (!selection) return;

    const optionIndex = selection.suggestions.findIndex(
      (opt) => opt.id === labelId
    );

    if (optionIndex === -1) {
      // This is a workspace label not in suggestions - add it
      setTaskLabelSelections((prev) => {
        const next = [...prev];
        if (!next[index]) return prev;

        const workspaceLabel = workspaceLabels.find((l) => l.id === labelId);
        if (!workspaceLabel) return prev;

        // Add the workspace label to suggestions as selected
        next[index] = {
          suggestions: [
            ...next[index].suggestions,
            {
              id: workspaceLabel.id,
              name: workspaceLabel.name,
              displayName: workspaceLabel.name,
              isNew: false,
              selected: true,
            },
          ],
        };

        return next;
      });
    } else {
      // Toggle existing option
      toggleTaskLabelSuggestion(index, optionIndex);
    }
  };

  const handlePreviewTaskProjectToggle = (index: number, projectId: string) => {
    if (createTasksMutation.isPending) return;
    setPreviewTaskProjects((prev) => {
      const currentProjects = prev[index] || [];
      const hasProject = currentProjects.includes(projectId);

      return {
        ...prev,
        [index]: hasProject
          ? currentProjects.filter((id) => id !== projectId)
          : [...currentProjects, projectId],
      };
    });
  };

  const handlePreviewTaskEstimationChange = (
    index: number,
    points: number | null
  ) => {
    if (createTasksMutation.isPending) return;
    setPreviewTaskEstimations((prev) => ({
      ...prev,
      [index]: points,
    }));
  };

  // Inline editing handlers
  const handleStartEditTitle = (index: number) => {
    if (createTasksMutation.isPending) return;
    setEditingTaskTitle(index);
  };

  const handleStartEditDescription = (index: number) => {
    if (createTasksMutation.isPending) return;
    setEditingTaskDescription(index);
  };

  const handleSaveTitle = (index: number, value: string) => {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      toast.error('Task title cannot be empty');
      return;
    }
    setPreviewTaskNames((prev) => ({
      ...prev,
      [index]: trimmedValue,
    }));
    setEditingTaskTitle(null);
  };

  const handleSaveDescription = (index: number, value: string) => {
    setPreviewTaskDescriptions((prev) => ({
      ...prev,
      [index]: value.trim() || null,
    }));
    setEditingTaskDescription(null);
  };

  const handleCancelEditTitle = () => {
    setEditingTaskTitle(null);
  };

  const handleCancelEditDescription = () => {
    setEditingTaskDescription(null);
  };

  const handleRemovePreviewTask = (index: number) => {
    if (createTasksMutation.isPending) return;
    setRemovedTaskIndices((prev) => new Set([...prev, index]));
    setPreviewTaskMenuOpen((prev) => ({
      ...prev,
      [index]: false,
    }));

    // Adjust current preview index if necessary
    const visibleTasks = previewTasks.filter(
      (_, i) => !removedTaskIndices.has(i) && i !== index
    );

    if (visibleTasks.length === 0) {
      // No tasks left - close the dialog
      handleCancelPreview();
    } else if (currentPreviewIndex >= visibleTasks.length) {
      setCurrentPreviewIndex(visibleTasks.length - 1);
    }
  };

  const handleMenuItemSelect = (e: Event, action: () => void) => {
    e.preventDefault();
    action();
  };

  const handleConfirmTasks = () => {
    const createText = (previewEntry ?? pendingTaskTitle).trim();
    if (!createText) {
      toast.error(t('ws-tasks.errors.missing_task_description'));
      return;
    }

    const previewTasks = lastResult?.tasks ?? [];
    const tasksPayload = previewTasks
      .map((task, index) => {
        // Skip removed tasks
        if (removedTaskIndices.has(index)) {
          return null;
        }

        const selections = aiGenerateLabels
          ? (taskLabelSelections[index]?.suggestions.filter(
              (option) => option.selected
            ) ?? [])
          : [];

        // Use edited values if available, otherwise fall back to original
        const taskName = previewTaskNames[index] ?? task.name;
        const taskDescription =
          index in previewTaskDescriptions
            ? previewTaskDescriptions[index]
            : aiGenerateDescriptions
              ? task.description
              : null;
        const taskPriority =
          index in previewTaskPriorities
            ? previewTaskPriorities[index]
            : aiGeneratePriority
              ? task.priority
              : null;
        const taskEstimation =
          index in previewTaskEstimations
            ? previewTaskEstimations[index]
            : null;
        const taskProjects = previewTaskProjects[index] || [];

        return {
          title: taskName,
          description: taskDescription ?? null,
          priority: taskPriority ?? null,
          labels: selections.map((option) => ({
            id: option.id ?? undefined,
            name: option.name,
          })),
          dueDate: formatDueDateForPayload(taskDueDates[index]),
          estimationPoints: taskEstimation,
          projectIds: taskProjects,
        };
      })
      .filter((task) => task !== null);
    if (tasksPayload.length === 0) {
      toast.error('No tasks selected to create');
      return;
    }

    let timestampMoment = dayjs().tz(clientTimezone);
    if (!timestampMoment.isValid()) {
      timestampMoment = dayjs();
    }
    const clientTimestamp = timestampMoment.toISOString();

    createTasksMutation.mutate({
      entry: createText,
      listId: selectedListId,
      generatedWithAI: Boolean(lastResult?.metadata?.generatedWithAI),
      tasks: tasksPayload,
      labelIds: selectedLabelIds,
      generateDescriptions: aiGenerateDescriptions,
      generatePriority: aiGeneratePriority,
      generateLabels: aiGenerateLabels,
      clientTimezone,
      clientTimestamp,
    });
  };

  // Preview dialog computed values
  const previewTasks = lastResult?.tasks ?? [];
  const generatedWithAI = Boolean(lastResult?.metadata?.generatedWithAI);
  const isCreating = createTasksMutation.isPending;
  const labelsLoading = false; // Labels are already loaded

  // Compute visible tasks for navigation
  const visiblePreviewTasks = useMemo(() => {
    return previewTasks
      .map((task, originalIndex) => ({ task, originalIndex }))
      .filter(({ originalIndex }) => !removedTaskIndices.has(originalIndex));
  }, [previewTasks, removedTaskIndices]);

  const disableConfirm =
    isCreating || !selectedListId || visiblePreviewTasks.length === 0;

  const currentVisibleTask = useMemo(() => {
    if (
      visiblePreviewTasks.length === 0 ||
      currentPreviewIndex >= visiblePreviewTasks.length
    ) {
      return null;
    }
    return visiblePreviewTasks[currentPreviewIndex];
  }, [visiblePreviewTasks, currentPreviewIndex]);

  const displayedWorkspaceLabels = useMemo(() => {
    if (!aiGenerateLabels) return [];
    return workspaceLabelsExpanded
      ? sortedLabels
      : sortedLabels.slice(0, MAX_VISIBLE_WORKSPACE_LABELS);
  }, [aiGenerateLabels, workspaceLabelsExpanded, sortedLabels]);

  // Group tasks by priority for better organization
  const groupTasksByPriority = (tasks: TaskWithRelations[] | undefined) => {
    const emptyResult = {
      critical: [] as TaskWithRelations[],
      high: [] as TaskWithRelations[],
      normal: [] as TaskWithRelations[],
      low: [] as TaskWithRelations[],
      none: [] as TaskWithRelations[],
    };

    if (!tasks) return emptyResult;

    return tasks.reduce(
      (acc, task) => {
        const priority = task.priority || 'none';
        if (priority === 'critical' || priority === 'urgent') {
          acc.critical.push(task);
        } else if (priority === 'high') {
          acc.high.push(task);
        } else if (priority === 'normal' || priority === 'medium') {
          acc.normal.push(task);
        } else if (priority === 'low') {
          acc.low.push(task);
        } else {
          acc.none.push(task);
        }
        return acc;
      },
      {
        critical: [] as TaskWithRelations[],
        high: [] as TaskWithRelations[],
        normal: [] as TaskWithRelations[],
        low: [] as TaskWithRelations[],
        none: [] as TaskWithRelations[],
      }
    );
  };

  // Reset board selection when workspace changes
  useMemo(() => {
    if (selectedWorkspaceId && boardSelectorOpen) {
      setSelectedBoardId('');
      setSelectedListId('');
    }
  }, [selectedWorkspaceId, boardSelectorOpen]);

  // Initialize task label selections when preview opens
  useEffect(() => {
    if (!aiGenerateLabels) {
      return;
    }

    if (!lastResult?.tasks?.length) {
      if (taskLabelSelections.length > 0) {
        setTaskLabelSelections([]);
      }
      if (Object.keys(expandedLabelCards).length > 0) {
        setExpandedLabelCards({});
      }
      lastInitializedLabelsKey.current = null;
      return;
    }

    const previewTasks = lastResult.tasks;
    const previewKey = `${previewEntry ?? pendingTaskTitle}:${previewTasks.length}`;

    if (lastInitializedLabelsKey.current === previewKey) {
      return;
    }

    const normalizedExisting = new Map<string, WorkspaceLabel>();
    sortedLabels.forEach((label) => {
      const normalized = normalizeLabel(label.name);
      if (normalized) {
        normalizedExisting.set(normalized, label);
      }
    });

    const nextSelections: TaskLabelSelection[] = previewTasks.map((task) => {
      const seen = new Set<string>();
      const options: TaskLabelOption[] = [];

      (task.labels ?? []).forEach((label) => {
        const normalized = normalizeLabel(label.name);
        if (!normalized || seen.has(normalized)) {
          return;
        }
        seen.add(normalized);

        const existing = normalizedExisting.get(normalized);
        if (existing) {
          options.push({
            id: existing.id,
            name: existing.name,
            displayName: existing.name,
            isNew: false,
            selected: true,
          });
        } else {
          options.push({
            id: label.id ?? null,
            name: label.name,
            displayName: label.name,
            isNew: !label.id,
            selected: true,
          });
        }
      });

      (task.labelSuggestions ?? []).forEach((suggestion) => {
        const normalized = normalizeLabel(suggestion);
        if (!normalized || seen.has(normalized)) {
          return;
        }
        seen.add(normalized);

        const existing = normalizedExisting.get(normalized);
        if (existing) {
          options.push({
            id: existing.id,
            name: existing.name,
            displayName: existing.name,
            isNew: false,
            selected: true,
          });
        } else {
          const formatted = formatLabel(suggestion);
          options.push({
            id: null,
            name: formatted,
            displayName: formatted,
            isNew: true,
            selected: false,
          });
        }
      });

      return {
        suggestions: options.slice(0, MAX_LABEL_SUGGESTIONS),
      };
    });

    setTaskLabelSelections(nextSelections);
    lastInitializedLabelsKey.current = previewKey;
    setExpandedLabelCards({});
  }, [
    aiGenerateLabels,
    lastResult,
    previewEntry,
    pendingTaskTitle,
    sortedLabels,
    expandedLabelCards,
    taskLabelSelections.length,
  ]);

  // Initialize task due dates when preview opens
  useEffect(() => {
    if (!lastResult?.tasks?.length) {
      if (taskDueDates.length) {
        setTaskDueDates([]);
      }
      lastInitializedDueDatesKey.current = null;
      return;
    }

    const previewTasks = lastResult.tasks;
    const previewKey = `${previewEntry ?? pendingTaskTitle}:${previewTasks.length}`;
    if (lastInitializedDueDatesKey.current === previewKey) {
      return;
    }

    setTaskDueDates(
      previewTasks.map((task) => parseDueDateToState(task.dueDate ?? null))
    );
    lastInitializedDueDatesKey.current = previewKey;
  }, [lastResult, previewEntry, pendingTaskTitle, taskDueDates.length]);

  // Initialize preview task inline editing state when preview opens
  useEffect(() => {
    if (!lastResult?.tasks?.length) {
      setPreviewTaskMenuOpen({});
      setPreviewTaskNames({});
      setPreviewTaskDescriptions({});
      setPreviewTaskPriorities({});
      setPreviewTaskProjects({});
      setPreviewTaskEstimations({});
      setRemovedTaskIndices(new Set());
      return;
    }

    const previewTasks = lastResult.tasks;

    // Initialize with original values
    const initialNames: Record<number, string> = {};
    const initialDescriptions: Record<number, string | null> = {};
    const initialPriorities: Record<number, TaskPriority | null> = {};
    const initialProjects: Record<number, string[]> = {};
    const initialEstimations: Record<number, number | null> = {};

    previewTasks.forEach((task, index) => {
      initialNames[index] = task.name;
      initialDescriptions[index] = task.description || null;
      initialPriorities[index] = task.priority || null;
      initialProjects[index] = task.projectIds || [];
      initialEstimations[index] = task.estimationPoints ?? null;
    });

    setPreviewTaskNames(initialNames);
    setPreviewTaskDescriptions(initialDescriptions);
    setPreviewTaskPriorities(initialPriorities);
    setPreviewTaskProjects(initialProjects);
    setPreviewTaskEstimations(initialEstimations);
    setPreviewTaskMenuOpen({});
    setRemovedTaskIndices(new Set());
  }, [lastResult]);

  // Reset labels when aiGenerateLabels is disabled
  useEffect(() => {
    if (!aiGenerateLabels) {
      if (selectedLabelIds.length > 0) {
        setSelectedLabelIds([]);
      }
      if (taskLabelSelections.length > 0) {
        setTaskLabelSelections([]);
      }
      if (Object.keys(expandedLabelCards).length > 0) {
        setExpandedLabelCards({});
      }
      if (workspaceLabelsExpanded) {
        setWorkspaceLabelsExpanded(false);
      }
      lastInitializedLabelsKey.current = null;
    }
  }, [
    aiGenerateLabels,
    expandedLabelCards,
    selectedLabelIds.length,
    taskLabelSelections.length,
    workspaceLabelsExpanded,
  ]);

  return (
    <div className="space-y-6">
      {/* Header with stats - Fixed height for both modes */}
      <div className="flex min-h-[72px] items-center justify-between px-1">
        {activeMode === 'task' ? (
          <>
            <div className="fade-in slide-in-from-left-2 animate-in space-y-1 duration-300">
              <h1 className="font-bold text-4xl tracking-tight">
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
          </>
        ) : (
          <div className="fade-in slide-in-from-left-2 animate-in space-y-1 duration-300">
            <h1 className="font-bold text-4xl tracking-tight">My Notes</h1>
            <p className="text-lg text-muted-foreground">
              Quick captures for thoughts and ideas
            </p>
          </div>
        )}
      </div>

      {/* Command Bar - The single entry point for creation */}
      <div className="mx-auto max-w-5xl">
        <CommandBar
          onCreateNote={handleCreateNote}
          onCreateTask={handleCreateTask}
          onGenerateAI={handleGenerateAI}
          onOpenBoardSelector={() => setBoardSelectorOpen(true)}
          selectedDestination={selectedDestination}
          onClearDestination={handleClearDestination}
          isLoading={commandBarLoading}
          aiGenerateDescriptions={aiGenerateDescriptions}
          aiGeneratePriority={aiGeneratePriority}
          aiGenerateLabels={aiGenerateLabels}
          onAiGenerateDescriptionsChange={setAiGenerateDescriptions}
          onAiGeneratePriorityChange={setAiGeneratePriority}
          onAiGenerateLabelsChange={setAiGenerateLabels}
          mode={activeMode}
          onModeChange={setActiveMode}
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
      </div>

      {/* Spacer for breathing room */}
      <div className="h-4" />

      {/* Content Area - Controlled by Command Bar mode */}
      <div className="w-full">
        {/* My Tasks Content */}
        {activeMode === 'task' && (
          <div className="fade-in mt-6 animate-in space-y-6 duration-300">
            {/* Success message when tasks are created */}
            {commandBarLoading && (
              <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10 p-4 shadow-sm">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="font-medium text-sm">Creating your task...</p>
              </div>
            )}

            {/* Overdue Tasks */}
            {overdueTasks && overdueTasks.length > 0 ? (
              <div className="space-y-4">
                {/* Section Header */}
                <button
                  type="button"
                  onClick={() => toggleSection('overdue')}
                  className="w-full text-left transition-all hover:opacity-90"
                >
                  <div className="flex items-center justify-between rounded-2xl border border-dynamic-red/30 bg-gradient-to-br from-dynamic-red/10 via-dynamic-red/5 to-background p-6 shadow-lg">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-dynamic-red/20 shadow-inner">
                        <Clock className="h-6 w-6 text-dynamic-red" />
                      </div>
                      <div>
                        <h3 className="font-bold text-2xl text-dynamic-red">
                          {t('ws-tasks.overdue')}
                        </h3>
                        <p className="mt-1 text-muted-foreground text-sm">
                          Requires immediate attention
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        variant="secondary"
                        className="h-10 rounded-xl bg-dynamic-red/20 px-4 font-bold text-dynamic-red text-lg shadow-md"
                      >
                        {overdueTasks.length}
                      </Badge>
                      <ChevronUp
                        className={cn(
                          'h-6 w-6 text-dynamic-red transition-transform duration-300',
                          !collapsedSections.overdue && 'rotate-180'
                        )}
                      />
                    </div>
                  </div>
                </button>

                {/* Task List - Grouped by Priority */}
                {!collapsedSections.overdue && (
                  <div className="space-y-6">
                    {(() => {
                      const grouped = groupTasksByPriority(overdueTasks);
                      return (
                        <>
                          {/* Critical Priority */}
                          {grouped.critical.length > 0 && (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 px-2">
                                <div className="h-2 w-2 rounded-full bg-dynamic-red" />
                                <span className="font-bold text-dynamic-red text-xs uppercase tracking-wider">
                                  Critical Priority ({grouped.critical.length})
                                </span>
                                <div className="h-px flex-1 bg-gradient-to-r from-dynamic-red/30 to-transparent" />
                              </div>
                              <TaskListWithCompletion
                                tasks={grouped.critical}
                                isPersonal={isPersonal}
                                initialLimit={10}
                                onTaskUpdate={handleUpdate}
                              />
                            </div>
                          )}

                          {/* High Priority */}
                          {grouped.high.length > 0 && (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 px-2">
                                <div className="h-2 w-2 rounded-full bg-dynamic-orange" />
                                <span className="font-bold text-dynamic-orange text-xs uppercase tracking-wider">
                                  High Priority ({grouped.high.length})
                                </span>
                                <div className="h-px flex-1 bg-gradient-to-r from-dynamic-orange/30 to-transparent" />
                              </div>
                              <TaskListWithCompletion
                                tasks={grouped.high}
                                isPersonal={isPersonal}
                                initialLimit={10}
                                onTaskUpdate={handleUpdate}
                              />
                            </div>
                          )}

                          {/* Normal Priority */}
                          {grouped.normal.length > 0 && (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 px-2">
                                <div className="h-2 w-2 rounded-full bg-dynamic-blue" />
                                <span className="font-bold text-dynamic-blue text-xs uppercase tracking-wider">
                                  Normal Priority ({grouped.normal.length})
                                </span>
                                <div className="h-px flex-1 bg-gradient-to-r from-dynamic-blue/30 to-transparent" />
                              </div>
                              <TaskListWithCompletion
                                tasks={grouped.normal}
                                isPersonal={isPersonal}
                                initialLimit={10}
                                onTaskUpdate={handleUpdate}
                              />
                            </div>
                          )}

                          {/* Low Priority + No Priority */}
                          {(grouped.low.length > 0 ||
                            grouped.none.length > 0) && (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 px-2">
                                <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                                <span className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                                  Low Priority (
                                  {grouped.low.length + grouped.none.length})
                                </span>
                                <div className="h-px flex-1 bg-gradient-to-r from-muted-foreground/30 to-transparent" />
                              </div>
                              <TaskListWithCompletion
                                tasks={[...grouped.low, ...grouped.none]}
                                isPersonal={isPersonal}
                                initialLimit={10}
                                onTaskUpdate={handleUpdate}
                              />
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            ) : null}

            {/* Due Today */}
            {todayTasks && todayTasks.length > 0 ? (
              <div className="space-y-4">
                {/* Section Header */}
                <button
                  type="button"
                  onClick={() => toggleSection('today')}
                  className="w-full text-left transition-all hover:opacity-90"
                >
                  <div className="flex items-center justify-between rounded-2xl border border-dynamic-orange/30 bg-gradient-to-br from-dynamic-orange/10 via-dynamic-orange/5 to-background p-6 shadow-lg">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-dynamic-orange/20 shadow-inner">
                        <Calendar className="h-6 w-6 text-dynamic-orange" />
                      </div>
                      <div>
                        <h3 className="font-bold text-2xl text-dynamic-orange">
                          {t('ws-tasks.due_today')}
                        </h3>
                        <p className="mt-1 text-muted-foreground text-sm">
                          Complete by end of day
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        variant="secondary"
                        className="h-10 rounded-xl bg-dynamic-orange/20 px-4 font-bold text-dynamic-orange text-lg shadow-md"
                      >
                        {todayTasks.length}
                      </Badge>
                      <ChevronUp
                        className={cn(
                          'h-6 w-6 text-dynamic-orange transition-transform duration-300',
                          !collapsedSections.today && 'rotate-180'
                        )}
                      />
                    </div>
                  </div>
                </button>

                {/* Task List - Grouped by Priority */}
                {!collapsedSections.today && (
                  <div className="space-y-6">
                    {(() => {
                      const grouped = groupTasksByPriority(todayTasks);
                      return (
                        <>
                          {/* Critical Priority */}
                          {grouped.critical.length > 0 && (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 px-2">
                                <div className="h-2 w-2 rounded-full bg-dynamic-red" />
                                <span className="font-bold text-dynamic-red text-xs uppercase tracking-wider">
                                  Critical Priority ({grouped.critical.length})
                                </span>
                                <div className="h-px flex-1 bg-gradient-to-r from-dynamic-red/30 to-transparent" />
                              </div>
                              <TaskListWithCompletion
                                tasks={grouped.critical}
                                isPersonal={isPersonal}
                                initialLimit={10}
                                onTaskUpdate={handleUpdate}
                              />
                            </div>
                          )}

                          {/* High Priority */}
                          {grouped.high.length > 0 && (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 px-2">
                                <div className="h-2 w-2 rounded-full bg-dynamic-orange" />
                                <span className="font-bold text-dynamic-orange text-xs uppercase tracking-wider">
                                  High Priority ({grouped.high.length})
                                </span>
                                <div className="h-px flex-1 bg-gradient-to-r from-dynamic-orange/30 to-transparent" />
                              </div>
                              <TaskListWithCompletion
                                tasks={grouped.high}
                                isPersonal={isPersonal}
                                initialLimit={10}
                                onTaskUpdate={handleUpdate}
                              />
                            </div>
                          )}

                          {/* Normal Priority */}
                          {grouped.normal.length > 0 && (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 px-2">
                                <div className="h-2 w-2 rounded-full bg-dynamic-blue" />
                                <span className="font-bold text-dynamic-blue text-xs uppercase tracking-wider">
                                  Normal Priority ({grouped.normal.length})
                                </span>
                                <div className="h-px flex-1 bg-gradient-to-r from-dynamic-blue/30 to-transparent" />
                              </div>
                              <TaskListWithCompletion
                                tasks={grouped.normal}
                                isPersonal={isPersonal}
                                initialLimit={10}
                                onTaskUpdate={handleUpdate}
                              />
                            </div>
                          )}

                          {/* Low Priority + No Priority */}
                          {(grouped.low.length > 0 ||
                            grouped.none.length > 0) && (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 px-2">
                                <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                                <span className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                                  Low Priority (
                                  {grouped.low.length + grouped.none.length})
                                </span>
                                <div className="h-px flex-1 bg-gradient-to-r from-muted-foreground/30 to-transparent" />
                              </div>
                              <TaskListWithCompletion
                                tasks={[...grouped.low, ...grouped.none]}
                                isPersonal={isPersonal}
                                initialLimit={10}
                                onTaskUpdate={handleUpdate}
                              />
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            ) : null}

            {/* Upcoming Tasks */}
            {upcomingTasks && upcomingTasks.length > 0 ? (
              <div className="space-y-4">
                {/* Section Header */}
                <button
                  type="button"
                  onClick={() => toggleSection('upcoming')}
                  className="w-full text-left transition-all hover:opacity-90"
                >
                  <div className="flex items-center justify-between rounded-2xl border border-dynamic-blue/30 bg-gradient-to-br from-dynamic-blue/10 via-dynamic-blue/5 to-background p-6 shadow-lg">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-dynamic-blue/20 shadow-inner">
                        <Flag className="h-6 w-6 text-dynamic-blue" />
                      </div>
                      <div>
                        <h3 className="font-bold text-2xl text-dynamic-blue">
                          {t('ws-tasks.upcoming')}
                        </h3>
                        <p className="mt-1 text-muted-foreground text-sm">
                          Plan ahead and stay on track
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        variant="secondary"
                        className="h-10 rounded-xl bg-dynamic-blue/20 px-4 font-bold text-dynamic-blue text-lg shadow-md"
                      >
                        {upcomingTasks.length}
                      </Badge>
                      <ChevronUp
                        className={cn(
                          'h-6 w-6 text-dynamic-blue transition-transform duration-300',
                          !collapsedSections.upcoming && 'rotate-180'
                        )}
                      />
                    </div>
                  </div>
                </button>

                {/* Task List - Grouped by Priority */}
                {!collapsedSections.upcoming && (
                  <div className="space-y-6">
                    {(() => {
                      const grouped = groupTasksByPriority(upcomingTasks);
                      return (
                        <>
                          {/* Critical Priority */}
                          {grouped.critical.length > 0 && (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 px-2">
                                <div className="h-2 w-2 rounded-full bg-dynamic-red" />
                                <span className="font-bold text-dynamic-red text-xs uppercase tracking-wider">
                                  Critical Priority ({grouped.critical.length})
                                </span>
                                <div className="h-px flex-1 bg-gradient-to-r from-dynamic-red/30 to-transparent" />
                              </div>
                              <TaskListWithCompletion
                                tasks={grouped.critical}
                                isPersonal={isPersonal}
                                initialLimit={10}
                                onTaskUpdate={handleUpdate}
                              />
                            </div>
                          )}

                          {/* High Priority */}
                          {grouped.high.length > 0 && (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 px-2">
                                <div className="h-2 w-2 rounded-full bg-dynamic-orange" />
                                <span className="font-bold text-dynamic-orange text-xs uppercase tracking-wider">
                                  High Priority ({grouped.high.length})
                                </span>
                                <div className="h-px flex-1 bg-gradient-to-r from-dynamic-orange/30 to-transparent" />
                              </div>
                              <TaskListWithCompletion
                                tasks={grouped.high}
                                isPersonal={isPersonal}
                                initialLimit={10}
                                onTaskUpdate={handleUpdate}
                              />
                            </div>
                          )}

                          {/* Normal Priority */}
                          {grouped.normal.length > 0 && (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 px-2">
                                <div className="h-2 w-2 rounded-full bg-dynamic-blue" />
                                <span className="font-bold text-dynamic-blue text-xs uppercase tracking-wider">
                                  Normal Priority ({grouped.normal.length})
                                </span>
                                <div className="h-px flex-1 bg-gradient-to-r from-dynamic-blue/30 to-transparent" />
                              </div>
                              <TaskListWithCompletion
                                tasks={grouped.normal}
                                isPersonal={isPersonal}
                                initialLimit={10}
                                onTaskUpdate={handleUpdate}
                              />
                            </div>
                          )}

                          {/* Low Priority + No Priority */}
                          {(grouped.low.length > 0 ||
                            grouped.none.length > 0) && (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 px-2">
                                <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                                <span className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                                  Low Priority (
                                  {grouped.low.length + grouped.none.length})
                                </span>
                                <div className="h-px flex-1 bg-gradient-to-r from-muted-foreground/30 to-transparent" />
                              </div>
                              <TaskListWithCompletion
                                tasks={[...grouped.low, ...grouped.none]}
                                isPersonal={isPersonal}
                                initialLimit={10}
                                onTaskUpdate={handleUpdate}
                              />
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            ) : null}

            {/* All Caught Up State */}
            {totalActiveTasks === 0 && !commandBarLoading && (
              <Card className="overflow-hidden border-dynamic-green/30 bg-gradient-to-br from-dynamic-green/5 to-background shadow-sm">
                <CardContent className="flex flex-col items-center justify-center gap-6 p-12 text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-dynamic-green/15">
                    <CheckCircle2 className="h-10 w-10 text-dynamic-green" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-semibold text-2xl">
                      You're all caught up!
                    </h3>
                    <p className="mx-auto max-w-md text-muted-foreground">
                      No active tasks right now. Create a new task above to get
                      started, or take a moment to plan your next move.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <Button
                      variant="default"
                      onClick={() => {
                        const textarea = document.querySelector(
                          '#my-tasks-command-bar-textarea'
                        ) as HTMLTextAreaElement;
                        if (textarea) {
                          textarea.focus();
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                      }}
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Create Task
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setBoardSelectorOpen(true)}
                      className="gap-2"
                    >
                      <LayoutDashboard className="h-4 w-4" />
                      Browse Boards
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Notes Content */}
        {activeMode === 'note' && (
          <div className="fade-in mt-6 animate-in duration-300">
            <NotesList wsId={wsId} enabled={activeMode === 'note'} />
          </div>
        )}
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
              <Select
                value={selectedListId}
                onValueChange={setSelectedListId}
                disabled={!selectedBoardId || availableLists.length === 0}
              >
                <SelectTrigger id="list-select">
                  <SelectValue
                    placeholder={
                      !selectedBoardId
                        ? 'Select a board first'
                        : availableLists.length === 0
                          ? 'No lists available'
                          : 'Select a list'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableLists.map((list: any) => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.name || 'Unnamed List'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedBoardId && availableLists.length === 0 && (
                <p className="text-muted-foreground text-xs">
                  This board has no available lists. Create a list first.
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBoardSelectorOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleBoardSelectorConfirm}
              disabled={!selectedBoardId || !selectedListId}
            >
              <Plus className="mr-2 h-4 w-4" />
              Continue
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
            data={{ name: newBoardName } as any}
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

      {/* AI Preview Dialog */}
      <Dialog
        open={previewOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCancelPreview();
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Review Generated {previewTasks.length} Task
              {previewTasks.length !== 1 ? 's' : ''}
            </DialogTitle>
            <DialogDescription>
              {selectedListId
                ? (() => {
                    const board = boardsData.find((b: any) =>
                      (b.task_lists as any[])?.some(
                        (l: any) => l.id === selectedListId
                      )
                    );
                    const lists = (board?.task_lists as any[]) || [];
                    const list = lists.find(
                      (l: any) => l.id === selectedListId
                    );
                    const listName = list?.name || 'Unknown List';
                    return `Tasks will be created in "${listName}"`;
                  })()
                : 'Select a list to continue'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Workspace Labels */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-medium text-sm">Workspace Labels</Label>
                <span className="text-muted-foreground text-xs">
                  Apply to all tasks
                </span>
              </div>

              {!aiGenerateLabels ? (
                <p className="rounded-lg border border-dynamic-muted/30 bg-dynamic-muted/10 p-3 text-muted-foreground text-xs">
                  Label generation is disabled
                </p>
              ) : labelsLoading ? (
                <div className="flex items-center gap-2 rounded-lg border border-dynamic-blue/30 bg-dynamic-blue/10 px-3 py-2 text-dynamic-blue text-xs">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading labels...</span>
                </div>
              ) : sortedLabels.length ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {displayedWorkspaceLabels.map((label) => {
                      const selected = selectedLabelIds.includes(label.id);
                      const colorClass =
                        LABEL_COLOR_CLASSES[label.color] ||
                        LABEL_COLOR_CLASSES.gray;

                      return (
                        <button
                          key={label.id}
                          type="button"
                          onClick={() => toggleLabel(label.id)}
                          className={`rounded-full border px-3 py-1 font-medium text-xs transition ${colorClass} ${
                            selected ? 'ring-2 ring-dynamic-blue' : ''
                          }`}
                        >
                          {label.name}
                        </button>
                      );
                    })}
                  </div>
                  {sortedLabels.length > MAX_VISIBLE_WORKSPACE_LABELS ? (
                    <button
                      type="button"
                      onClick={toggleWorkspaceLabelsExpansion}
                      className="mt-2 font-medium text-dynamic-blue text-xs hover:underline"
                      disabled={isCreating}
                    >
                      {workspaceLabelsExpanded
                        ? 'Show less'
                        : `Show ${sortedLabels.length - MAX_VISIBLE_WORKSPACE_LABELS} more`}
                    </button>
                  ) : null}
                </>
              ) : (
                <p className="rounded-lg border border-dynamic-muted/30 bg-dynamic-muted/10 p-3 text-muted-foreground text-xs">
                  No workspace labels available
                </p>
              )}
            </div>

            {/* Preview Tasks */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-foreground text-sm">
                  {generatedWithAI
                    ? `AI-Generated Tasks (${previewTasks.length})`
                    : `Manual Tasks (${previewTasks.length})`}
                </p>
                <Badge
                  variant="outline"
                  className="border-dynamic-blue/40 bg-transparent text-foreground text-xs"
                >
                  {visiblePreviewTasks.length} task
                  {visiblePreviewTasks.length !== 1 ? 's' : ''}
                </Badge>
              </div>

              {/* Single Task Display */}
              {currentVisibleTask ? (
                <div className="space-y-3">
                  {(() => {
                    const { task, originalIndex } = currentVisibleTask;
                    const displayIndex = currentPreviewIndex;
                    const selection = taskLabelSelections[originalIndex];
                    const suggestions = aiGenerateLabels
                      ? (selection?.suggestions ?? [])
                      : [];
                    const hasNewSelections = suggestions.some(
                      (option) => option.isNew && option.selected
                    );
                    const dueDateValue = taskDueDates[originalIndex];
                    const menuOpen =
                      previewTaskMenuOpen[originalIndex] || false;

                    // Get current values (edited or original)
                    const currentName =
                      previewTaskNames[originalIndex] ?? task.name;
                    const currentDescription =
                      originalIndex in previewTaskDescriptions
                        ? previewTaskDescriptions[originalIndex]
                        : task.description;
                    const currentPriority: TaskPriority | null =
                      originalIndex in previewTaskPriorities
                        ? (previewTaskPriorities[originalIndex] ?? null)
                        : (task.priority ?? null);

                    return (
                      <div
                        key={task.id ?? `${task.name}-${originalIndex}`}
                        className="group rounded-md border border-dynamic-surface/30 bg-background/80 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 space-y-1">
                            <div className="flex items-start gap-2">
                              {/* Editable Title */}
                              {editingTaskTitle === originalIndex ? (
                                <div className="flex-1 space-y-2">
                                  <Textarea
                                    value={currentName}
                                    onChange={(e) => {
                                      setPreviewTaskNames((prev) => ({
                                        ...prev,
                                        [originalIndex]: e.target.value,
                                      }));
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSaveTitle(
                                          originalIndex,
                                          currentName
                                        );
                                      } else if (e.key === 'Escape') {
                                        handleCancelEditTitle();
                                      }
                                    }}
                                    className="min-h-[60px] w-full resize-none break-all font-medium text-sm"
                                    autoFocus
                                    disabled={isCreating}
                                  />
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        handleSaveTitle(
                                          originalIndex,
                                          currentName
                                        )
                                      }
                                      disabled={isCreating}
                                    >
                                      Save
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={handleCancelEditTitle}
                                      disabled={isCreating}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleStartEditTitle(originalIndex)
                                  }
                                  className="line-clamp-2 flex-1 cursor-text break-words rounded px-2 py-1 text-left font-medium text-foreground text-sm transition hover:bg-muted/50"
                                  disabled={isCreating}
                                >
                                  {displayIndex + 1}. {currentName}
                                </button>
                              )}

                              {/* Inline Actions Menu */}
                              <DropdownMenu
                                open={menuOpen}
                                onOpenChange={(open) => {
                                  setPreviewTaskMenuOpen((prev) => ({
                                    ...prev,
                                    [originalIndex]: open,
                                  }));
                                }}
                              >
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="xs"
                                    className={cn(
                                      'h-7 w-7 shrink-0 p-0 transition-all duration-200',
                                      'hover:scale-105 hover:bg-muted',
                                      menuOpen
                                        ? 'opacity-100'
                                        : 'opacity-0 group-hover:opacity-100',
                                      menuOpen && 'bg-muted ring-1 ring-border'
                                    )}
                                    disabled={isCreating}
                                  >
                                    <MoreHorizontal className="h-3 w-3" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="end"
                                  className="w-56"
                                  sideOffset={5}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                  }}
                                >
                                  {/* Priority Menu */}
                                  <TaskPriorityMenu
                                    currentPriority={currentPriority}
                                    isLoading={isCreating}
                                    onPriorityChange={(priority) =>
                                      handlePreviewTaskPriorityChange(
                                        originalIndex,
                                        priority
                                      )
                                    }
                                    onMenuItemSelect={handleMenuItemSelect}
                                    onClose={() =>
                                      setPreviewTaskMenuOpen((prev) => ({
                                        ...prev,
                                        [originalIndex]: false,
                                      }))
                                    }
                                  />

                                  {/* Estimation Menu */}
                                  {boardConfig?.estimation_type && (
                                    <TaskEstimationMenu
                                      currentPoints={
                                        originalIndex in previewTaskEstimations
                                          ? previewTaskEstimations[
                                              originalIndex
                                            ]
                                          : null
                                      }
                                      estimationType={
                                        boardConfig.estimation_type
                                      }
                                      extendedEstimation={
                                        boardConfig.extended_estimation || false
                                      }
                                      allowZeroEstimates={
                                        boardConfig.allow_zero_estimates ?? true
                                      }
                                      isLoading={isCreating}
                                      onEstimationChange={(points) =>
                                        handlePreviewTaskEstimationChange(
                                          originalIndex,
                                          points
                                        )
                                      }
                                      onMenuItemSelect={handleMenuItemSelect}
                                    />
                                  )}

                                  {/* Labels Menu */}
                                  {aiGenerateLabels && (
                                    <TaskLabelsMenu
                                      taskLabels={suggestions
                                        .filter((opt) => opt.selected)
                                        .map((opt) => ({
                                          id: opt.id || '',
                                          name: opt.name,
                                          color: 'gray' as const,
                                        }))}
                                      availableLabels={workspaceLabels}
                                      isLoading={false}
                                      labelsSaving={null}
                                      onToggleLabel={(labelId) => {
                                        handlePreviewTaskLabelToggle(
                                          originalIndex,
                                          labelId
                                        );
                                      }}
                                      onCreateNewLabel={() => {
                                        setPreviewTaskMenuOpen((prev) => ({
                                          ...prev,
                                          [originalIndex]: false,
                                        }));
                                      }}
                                      onMenuItemSelect={handleMenuItemSelect}
                                    />
                                  )}

                                  {/* Projects Menu */}
                                  <TaskProjectsMenu
                                    taskProjects={(
                                      previewTaskProjects[originalIndex] || []
                                    ).map((projectId) => {
                                      const project = workspaceProjects.find(
                                        (p) => p.id === projectId
                                      );
                                      return {
                                        id: projectId,
                                        name:
                                          project?.name || 'Unknown Project',
                                        status: null,
                                      };
                                    })}
                                    availableProjects={workspaceProjects.map(
                                      (p) => ({
                                        id: p.id,
                                        name: p.name,
                                        status: null,
                                      })
                                    )}
                                    isLoading={false}
                                    projectsSaving={null}
                                    onToggleProject={(projectId) =>
                                      handlePreviewTaskProjectToggle(
                                        originalIndex,
                                        projectId
                                      )
                                    }
                                    onCreateNewProject={() => {
                                      setPreviewTaskMenuOpen((prev) => ({
                                        ...prev,
                                        [originalIndex]: false,
                                      }));
                                    }}
                                    onMenuItemSelect={handleMenuItemSelect}
                                  />

                                  <DropdownMenuSeparator />

                                  {/* Remove Task */}
                                  <DropdownMenuItem
                                    onSelect={(e) =>
                                      handleMenuItemSelect(
                                        e as unknown as Event,
                                        () => {
                                          handleRemovePreviewTask(
                                            originalIndex
                                          );
                                        }
                                      )
                                    }
                                    className="cursor-pointer text-dynamic-red hover:bg-dynamic-red/10 hover:text-dynamic-red/90"
                                    disabled={isCreating}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Remove task
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>

                            <p className="font-medium text-muted-foreground text-xs">
                              Description
                            </p>
                            {aiGenerateDescriptions ? (
                              editingTaskDescription === originalIndex ? (
                                <div className="space-y-2">
                                  <Textarea
                                    value={currentDescription || ''}
                                    onChange={(e) => {
                                      setPreviewTaskDescriptions((prev) => ({
                                        ...prev,
                                        [originalIndex]: e.target.value,
                                      }));
                                    }}
                                    onKeyDown={(e) => {
                                      if (
                                        e.key === 'Enter' &&
                                        e.metaKey &&
                                        !e.shiftKey
                                      ) {
                                        e.preventDefault();
                                        handleSaveDescription(
                                          originalIndex,
                                          currentDescription || ''
                                        );
                                      } else if (e.key === 'Escape') {
                                        handleCancelEditDescription();
                                      }
                                    }}
                                    className="min-h-[80px] w-full resize-none break-all text-sm"
                                    placeholder="Add a description..."
                                    autoFocus
                                    disabled={isCreating}
                                  />
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        handleSaveDescription(
                                          originalIndex,
                                          currentDescription || ''
                                        )
                                      }
                                      disabled={isCreating}
                                    >
                                      Save
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={handleCancelEditDescription}
                                      disabled={isCreating}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleStartEditDescription(originalIndex)
                                  }
                                  className="line-clamp-3 w-full cursor-text break-words rounded px-2 py-1 text-left text-foreground text-sm leading-relaxed opacity-90 transition hover:bg-muted/50"
                                  disabled={isCreating}
                                >
                                  {currentDescription || 'No description'}
                                </button>
                              )
                            ) : (
                              <p className="text-muted-foreground text-sm italic">
                                Description generation disabled
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col gap-2">
                            {aiGeneratePriority ? (
                              <Badge
                                variant="outline"
                                className={priorityBadgeClass(currentPriority)}
                              >
                                {getPriorityCopy(currentPriority)}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs italic">
                                Priority disabled
                              </span>
                            )}
                            {boardConfig?.estimation_type &&
                              originalIndex in previewTaskEstimations &&
                              previewTaskEstimations[originalIndex] !==
                                null && (
                                <TaskEstimationDisplay
                                  points={
                                    previewTaskEstimations[originalIndex] ?? 0
                                  }
                                  size="sm"
                                  estimationType={boardConfig.estimation_type}
                                  showIcon
                                />
                              )}
                          </div>
                        </div>

                        <div className="mt-3 space-y-1">
                          <p className="text-muted-foreground text-xs uppercase tracking-wide">
                            Due Date
                          </p>
                          <DateTimePicker
                            date={dueDateValue}
                            setDate={(date) =>
                              handleDueDateChange(originalIndex, date)
                            }
                            showTimeSelect
                            disabled={isCreating}
                          />
                          {!dueDateValue ? (
                            <p className="text-muted-foreground text-xs">
                              No due date set
                            </p>
                          ) : null}
                        </div>

                        {aiGenerateLabels ? (
                          <div className="mt-3 space-y-1">
                            <p className="text-muted-foreground text-xs uppercase tracking-wide">
                              Task Labels
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {suggestions.length ? (
                                suggestions.map((option, optionIndex) => {
                                  if (
                                    !expandedLabelCards[originalIndex] &&
                                    optionIndex >= MAX_VISIBLE_PREVIEW_LABELS
                                  ) {
                                    return null;
                                  }
                                  return (
                                    <button
                                      key={`${task.id ?? `${task.name}-${option.name}`}-${optionIndex}`}
                                      type="button"
                                      onClick={() =>
                                        toggleTaskLabelSuggestion(
                                          originalIndex,
                                          optionIndex
                                        )
                                      }
                                      className={cn(
                                        'rounded-full border px-3 py-1 font-medium text-xs transition',
                                        option.selected
                                          ? 'border-dynamic-purple/60 bg-dynamic-purple/15 text-dynamic-purple'
                                          : 'border-dynamic-muted/40 text-muted-foreground'
                                      )}
                                    >
                                      {option.displayName}
                                      {option.isNew ? (
                                        <span className="ml-2 text-[0.625rem] text-dynamic-purple uppercase tracking-wide">
                                          NEW
                                        </span>
                                      ) : null}
                                    </button>
                                  );
                                })
                              ) : (
                                <span className="text-muted-foreground text-xs italic">
                                  No label suggestions
                                </span>
                              )}
                            </div>
                            {suggestions.length > MAX_VISIBLE_PREVIEW_LABELS ? (
                              <button
                                type="button"
                                onClick={() =>
                                  toggleLabelPreviewExpansion(originalIndex)
                                }
                                className="font-medium text-dynamic-blue text-xs hover:underline"
                                disabled={isCreating}
                              >
                                {expandedLabelCards[originalIndex]
                                  ? 'Show less'
                                  : `Show ${suggestions.length - MAX_VISIBLE_PREVIEW_LABELS} more`}
                              </button>
                            ) : null}
                            {hasNewSelections ? (
                              <p className="text-muted-foreground text-xs">
                                New labels will be created automatically
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <p className="rounded-lg border border-dynamic-muted/30 bg-dynamic-muted/10 p-3 text-center text-muted-foreground text-sm">
                  No tasks to preview
                </p>
              )}
            </div>

            {/* Task Counter & Navigation */}
            {visiblePreviewTasks.length > 0 && (
              <div className="flex items-center justify-center gap-4 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePreviousTask}
                  disabled={isCreating || currentPreviewIndex === 0}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground text-sm">
                    {currentPreviewIndex + 1}
                  </span>
                  <span className="text-muted-foreground text-sm">/</span>
                  <span className="text-muted-foreground text-sm">
                    {visiblePreviewTasks.length}
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNextTask}
                  disabled={
                    isCreating ||
                    currentPreviewIndex === visiblePreviewTasks.length - 1
                  }
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleCancelPreview}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmTasks}
              disabled={disableConfirm}
            >
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-dynamic-blue" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create {visiblePreviewTasks.length} Task
                  {visiblePreviewTasks.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
