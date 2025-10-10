'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
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
  Calendar,
  CheckCircle2,
  Clock,
  Flag,
  FileText,
  LayoutDashboard,
  ListTodo,
  Loader2,
  Plus,
  Users,
} from '@tuturuuu/ui/icons';
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
import { TaskBoardForm } from '@tuturuuu/ui/tu-do/boards/form';
import { TaskEditDialog } from '@tuturuuu/ui/tu-do/shared/task-edit-dialog';
import { cn } from '@tuturuuu/utils/format';
import { invalidateTaskCaches } from '@tuturuuu/utils/task-helper';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TaskListWithCompletion from '../../(dashboard)/tasks/task-list-with-completion';
import { CommandBar } from './command-bar';
import EmptyState from './empty-state';
import NotesList from './notes-list';

dayjs.extend(utc);
dayjs.extend(timezone);

const MAX_LABEL_SUGGESTIONS = 6;
const MAX_VISIBLE_PREVIEW_LABELS = 3;
const MAX_VISIBLE_WORKSPACE_LABELS = 12;

const PRIORITY_STYLES: Record<string, string> = {
  critical: 'border-dynamic-red/40 bg-dynamic-red/10 text-dynamic-red',
  high: 'border-dynamic-orange/40 bg-dynamic-orange/10 text-dynamic-orange',
  normal: 'border-dynamic-green/40 bg-dynamic-green/10 text-dynamic-green',
  low: 'border-dynamic-blue/40 bg-dynamic-blue/10 text-dynamic-blue',
  none: 'border-dynamic-muted/40 bg-dynamic-muted/10 text-dynamic-muted-foreground',
};

const LABEL_COLOR_CLASSES: Record<string, string> = {
  red: 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red',
  orange: 'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange',
  yellow: 'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow',
  green: 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green',
  blue: 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue',
  purple: 'border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple',
  pink: 'border-dynamic-pink/30 bg-dynamic-pink/10 text-dynamic-pink',
  gray: 'border-dynamic-muted/30 bg-dynamic-muted/10 text-dynamic-muted-foreground',
};

const normalizeLabel = (value: string) => value.trim().toLowerCase();

const formatLabel = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(' ');

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

interface Task {
  id: string;
  name: string;
  description?: string | null;
  priority?: string | null;
  end_date?: string | null;
  start_date?: string | null;
  estimation_points?: number | null;
  archived?: boolean | null;
  list_id?: string | null;
  list: {
    id: string;
    name: string | null;
    status?: string | null;
    board: {
      id: string;
      name: string | null;
      ws_id: string;
      estimation_type?: string | null;
      extended_estimation?: boolean;
      allow_zero_estimates?: boolean;
      workspaces: {
        id: string;
        name: string | null;
        personal: boolean | null;
      } | null;
    } | null;
  } | null;
  assignees: Array<{
    user: {
      id: string;
      display_name: string | null;
      avatar_url?: string | null;
    } | null;
  }> | null;
  labels?: Array<{
    label: {
      id: string;
      name: string;
      color: string;
      created_at: string;
    } | null;
  }> | null;
}

interface JournalTaskResponse {
  tasks?: Array<{
    id: string;
    name: string;
    description: string | null;
    priority: TaskPriority | null;
    labelSuggestions?: string[];
    dueDate?: string | null;
    labels?: ProvidedTaskLabelPayload[];
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

interface ProvidedTaskPayload {
  title: string;
  description: string | null;
  priority: TaskPriority | null;
  labelSuggestions?: string[];
  labels?: ProvidedTaskLabelPayload[];
  dueDate?: string | null;
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
  overdueTasks: Task[] | undefined;
  todayTasks: Task[] | undefined;
  upcomingTasks: Task[] | undefined;
  totalActiveTasks: number;
}

export default function MyTasksContent({
  wsId,
  isPersonal,
  overdueTasks,
  todayTasks,
  upcomingTasks,
  totalActiveTasks,
}: MyTasksContentProps) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('tasks');
  const [boardSelectorOpen, setBoardSelectorOpen] = useState(false);
  const [taskCreatorOpen, setTaskCreatorOpen] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(wsId);
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [newBoardDialogOpen, setNewBoardDialogOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState<string>('');
  const [commandBarLoading, setCommandBarLoading] = useState(false);
  
  // Task creation state
  const [pendingTaskTitle, setPendingTaskTitle] = useState<string>('');
  const [taskCreatorMode, setTaskCreatorMode] = useState<'simple' | 'ai' | null>(null);
  
  // AI Generation settings
  const [aiGenerateDescriptions, setAiGenerateDescriptions] = useState(true);
  const [aiGeneratePriority, setAiGeneratePriority] = useState(true);
  const [aiGenerateLabels, setAiGenerateLabels] = useState(true);

  // Preview state
  const [isPreviewOpen, setPreviewOpen] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<JournalTaskResponse | null>(null);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [taskLabelSelections, setTaskLabelSelections] = useState<TaskLabelSelection[]>([]);
  const [taskDueDates, setTaskDueDates] = useState<(Date | undefined)[]>([]);
  const [expandedLabelCards, setExpandedLabelCards] = useState<Record<number, boolean>>({});
  const [workspaceLabelsExpanded, setWorkspaceLabelsExpanded] = useState(false);
  const lastInitializedLabelsKey = useRef<string | null>(null);
  const lastInitializedDueDatesKey = useRef<string | null>(null);
  
  const clientTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
    } catch {
      return 'UTC';
    }
  }, []);

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
    enabled: (boardSelectorOpen || taskCreatorOpen) && !!selectedWorkspaceId,
  });

  // Ensure boardsData is always an array
  // Handle case where response might be wrapped in { boards: [...] }
  const boardsData = Array.isArray(boardsDataRaw) 
    ? boardsDataRaw 
    : (boardsDataRaw as any)?.boards ?? [];

  // Fetch workspace labels
  const { data: workspaceLabels = [], isLoading: labelsLoading } = useQuery({
    queryKey: ['workspace', wsId, 'labels'],
    queryFn: async () => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/labels`);
      if (!response.ok) {
        throw new Error('Failed to fetch labels');
      }
      return (await response.json()) as WorkspaceLabel[];
    },
    enabled: isPreviewOpen && aiGenerateLabels,
  });

  const sortedLabels = useMemo(
    () =>
      aiGenerateLabels
        ? [...workspaceLabels].sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
          )
        : [],
    [workspaceLabels, aiGenerateLabels]
  );

  const displayedWorkspaceLabels = useMemo(
    () =>
      workspaceLabelsExpanded
        ? sortedLabels
        : sortedLabels.slice(0, MAX_VISIBLE_WORKSPACE_LABELS),
    [sortedLabels, workspaceLabelsExpanded]
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
    onSuccess: (payload, variables) => {
      setLastResult(payload ?? null);
      setPreviewEntry(variables.entry);
      setSelectedLabelIds([]);
      setPreviewOpen(true);
    },
    onError: (mutationError) => {
      toast.error(mutationError.message || 'Failed to generate preview');
    },
  });

  // Create task mutation
  const createTaskMutation = useMutation<
    JournalTaskResponse,
    Error,
    {
      entry: string;
      listId: string;
      generatedWithAI: boolean;
      tasks: ProvidedTaskPayload[];
      labelIds: string[];
      generateDescriptions: boolean;
      generatePriority: boolean;
      generateLabels: boolean;
      clientTimezone: string;
      clientTimestamp: string;
    }
  >({
    mutationFn: async ({
      entry: createText,
      listId,
      generatedWithAI,
      tasks,
      labelIds,
      generateDescriptions: shouldGenerateDescriptions,
      generatePriority: shouldGeneratePriority,
      generateLabels: shouldGenerateLabels,
      clientTimezone: timezone,
      clientTimestamp,
    }) => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/tasks/journal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entry: createText,
          listId,
          tasks,
          generatedWithAI,
          labelIds,
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

        throw new Error(message || 'Failed to create task');
      }

      return payload;
    },
    onSuccess: (payload, variables) => {
      const targetBoard = boardsData.find((b: any) =>
        (b.task_lists as any[])?.some((l: any) => l.id === variables.listId)
      );
      const targetList = targetBoard?.task_lists
        ? (targetBoard.task_lists as any[]).find((l: any) => l.id === variables.listId)
        : null;
      const listName = targetList?.name || 'Unknown List';
      const createdCount =
        payload?.metadata?.totalTasks ??
        payload?.tasks?.length ??
        variables.tasks.length ??
        1;

      toast.success(
        payload?.metadata?.generatedWithAI
          ? `Successfully created ${createdCount} task${createdCount !== 1 ? 's' : ''} in "${listName}" using AI`
          : `Successfully created ${createdCount} task${createdCount !== 1 ? 's' : ''} in "${listName}"`
      );

      clearPreviewArtifacts();
      setPendingTaskTitle('');
      setTaskCreatorMode(null);

      if (targetBoard?.id) {
        invalidateTaskCaches(queryClient, targetBoard.id);
      }
      router.refresh();
    },
    onError: (mutationError) => {
      toast.error(mutationError.message || 'Failed to create task');
    },
  });

  const handleUpdate = () => {
    // Trigger refresh of SSR data using Next.js router
    router.refresh();
  };

  const clearPreviewArtifacts = () => {
    setPreviewOpen(false);
    setLastResult(null);
    setPreviewEntry(null);
    setSelectedLabelIds([]);
    setTaskLabelSelections([]);
    setTaskDueDates([]);
    lastInitializedLabelsKey.current = null;
    lastInitializedDueDatesKey.current = null;
    setExpandedLabelCards({});
    setWorkspaceLabelsExpanded(false);
  };

  const handleCancelPreview = () => {
    if (createTaskMutation.isPending) return;
    clearPreviewArtifacts();
  };

  const toggleLabel = (labelId: string) => {
    if (!aiGenerateLabels || createTaskMutation.isPending) return;
    setSelectedLabelIds((prev) =>
      prev.includes(labelId)
        ? prev.filter((id) => id !== labelId)
        : [...prev, labelId]
    );
  };

  const toggleTaskLabelSuggestion = (taskIndex: number, optionIndex: number) => {
    if (!aiGenerateLabels || createTaskMutation.isPending) return;

    setTaskLabelSelections((prev) => {
      if (!prev[taskIndex]) {
        return prev;
      }

      const next = prev.map((selection, index) => {
        if (index !== taskIndex) {
          return selection;
        }

        return {
          suggestions: selection.suggestions.map((option, currentIndex) => {
            if (currentIndex !== optionIndex) {
              return option;
            }

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

  const handleDueDateChange = (taskIndex: number, value: Date | undefined) => {
    if (createTaskMutation.isPending) {
      return;
    }
    setTaskDueDates((prev) => {
      const next = [...prev];
      next[taskIndex] = value ? adjustDateToEndOfDay(value) : undefined;
      return next;
    });
  };

  const toggleLabelPreviewExpansion = useCallback((taskIndex: number) => {
    setExpandedLabelCards((prev) => ({
      ...prev,
      [taskIndex]: !prev[taskIndex],
    }));
  }, []);

  const toggleWorkspaceLabelsExpansion = useCallback(() => {
    setWorkspaceLabelsExpanded((prev) => !prev);
  }, []);

  const getPriorityCopy = (priority: TaskPriority | null | undefined) => {
    if (!priority) return 'None';
    return priority.charAt(0).toUpperCase() + priority.slice(1);
  };

  const priorityBadgeClass = (priority: TaskPriority | null | undefined) => {
    const key = priority ?? 'none';
    return PRIORITY_STYLES[key] ?? PRIORITY_STYLES.none;
  };

  const handleCloseTaskCreator = () => {
    setTaskCreatorOpen(false);
    setPendingTaskTitle('');
    setTaskCreatorMode(null);
    // Reset selections for next time
    setSelectedWorkspaceId(wsId);
    setSelectedBoardId('');
    setSelectedListId('');
  };

  // Create note mutation (for CommandBar)
  const createNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
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

  const handleCreateTask = (title: string) => {
    // If destination is not yet confirmed, open selector first
    if (!selectedBoardId || !selectedListId) {
      setPendingTaskTitle(title);
      setTaskCreatorMode('simple');
      setBoardSelectorOpen(true);
      return;
    }
    
    // Store the title and open task creator
    setPendingTaskTitle(title);
    setTaskCreatorMode('simple');
    setTaskCreatorOpen(true);
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

  const handleConfirmTasks = () => {
    if (!selectedListId) {
      toast.error(t('ws-tasks.errors.no_list_selected'));
      return;
    }

    const previewTasks = lastResult?.tasks ?? [];
    if (!previewTasks.length) {
      toast.error(t('ws-tasks.errors.no_tasks_to_create'));
      return;
    }

    const createText = (previewEntry ?? pendingTaskTitle).trim();
    if (!createText) {
      toast.error(t('ws-tasks.errors.missing_task_description'));
      return;
    }

    const tasksPayload = previewTasks.map((task, index) => {
      const selections = aiGenerateLabels
        ? (taskLabelSelections[index]?.suggestions.filter(
            (option) => option.selected
          ) ?? [])
        : [];

      return {
        title: task.name,
        description: aiGenerateDescriptions ? task.description : null,
        priority: aiGeneratePriority ? task.priority : null,
        labels: selections.map((option) => ({
          id: option.id ?? undefined,
          name: option.name,
        })),
        dueDate: formatDueDateForPayload(taskDueDates[index]),
      } satisfies ProvidedTaskPayload;
    });

    let timestampMoment = dayjs().tz(clientTimezone);
    if (!timestampMoment.isValid()) {
      timestampMoment = dayjs();
    }
    const clientTimestamp = timestampMoment.toISOString();

    createTaskMutation.mutate({
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

  const handleBoardSelectorConfirm = () => {
    setBoardSelectorOpen(false);
    
    if (pendingTaskTitle && taskCreatorMode === 'ai') {
      // Generate AI preview
      handleGenerateAI(pendingTaskTitle);
    } else if (pendingTaskTitle && taskCreatorMode === 'simple') {
      // Open simple task creator
      setTaskCreatorOpen(true);
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
  }, [lastResult, previewEntry, pendingTaskTitle]);

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
    aiGenerateLabels
  ]);

  const previewTasks = lastResult?.tasks ?? [];
  const generatedWithAI = Boolean(lastResult?.metadata?.generatedWithAI);
  const isCreating = createTaskMutation.isPending;
  const disableConfirm = isCreating || !selectedListId || previewTasks.length === 0;

  return (
    <div className="space-y-6">
      {/* Command Bar - The single entry point for creation */}
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
      />

      {/* Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2">
          <TabsTrigger
            value="tasks"
            className="flex-col gap-1.5 py-2 sm:flex-row sm:py-1.5"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-xs sm:text-sm">
              {t('sidebar_tabs.my_tasks')}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="notes"
            className="flex-col gap-1.5 py-2 sm:flex-row sm:py-1.5"
          >
            <FileText className="h-4 w-4" />
            <span className="text-xs sm:text-sm">Notes</span>
          </TabsTrigger>
        </TabsList>

      {/* My Tasks Tab */}
      <TabsContent value="tasks" className="mt-6 space-y-6">
        {/* Overdue Tasks */}
        {overdueTasks && overdueTasks.length > 0 && (
          <Card className="border-dynamic-red/20">
            <CardHeader className="border-dynamic-red/10 border-b bg-dynamic-red/5">
              <CardTitle className="flex items-center gap-2 text-dynamic-red">
                <Clock className="h-5 w-5" />
                {t('ws-tasks.overdue')} ({overdueTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <TaskListWithCompletion
                tasks={overdueTasks as any}
                isPersonal={isPersonal}
                initialLimit={5}
                onTaskUpdate={handleUpdate}
              />
            </CardContent>
          </Card>
        )}

        {/* Due Today */}
        {todayTasks && todayTasks.length > 0 && (
          <Card className="border-dynamic-orange/20">
            <CardHeader className="border-dynamic-orange/10 border-b bg-dynamic-orange/5">
              <CardTitle className="flex items-center gap-2 text-dynamic-orange">
                <Calendar className="h-5 w-5" />
                {t('ws-tasks.due_today')} ({todayTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <TaskListWithCompletion
                tasks={todayTasks as any}
                isPersonal={isPersonal}
                initialLimit={5}
                onTaskUpdate={handleUpdate}
              />
            </CardContent>
          </Card>
        )}

        {/* Upcoming Tasks */}
        {upcomingTasks && upcomingTasks.length > 0 && (
          <Card className="border-dynamic-blue/20">
            <CardHeader className="border-dynamic-blue/10 border-b bg-dynamic-blue/5">
              <CardTitle className="flex items-center gap-2 text-dynamic-blue">
                <Flag className="h-5 w-5" />
                {t('ws-tasks.upcoming')} ({upcomingTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <TaskListWithCompletion
                tasks={upcomingTasks as any}
                isPersonal={isPersonal}
                initialLimit={5}
                onTaskUpdate={handleUpdate}
              />
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {totalActiveTasks === 0 && (
          <EmptyState
            wsId={wsId}
            onSwitchToJournal={() => {
              // Focus on the command bar textarea for AI generation
              const textarea = document.querySelector('#my-tasks-command-bar-textarea') as HTMLTextAreaElement;
              if (textarea) {
                textarea.focus();
                // Scroll to top to show the command bar
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            onCreateTask={() => setBoardSelectorOpen(true)}
          />
        )}
      </TabsContent>

      {/* Notes Tab */}
      <TabsContent value="notes" className="mt-6">
        <NotesList wsId={wsId} enabled={activeTab === 'notes'} />
      </TabsContent>
    </Tabs>

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
          style={{
            maxWidth: '1200px',
            width: '85vw',
          }}
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

      {/* Task Creation - Simple Mode */}
      {selectedBoardId && selectedListId && taskCreatorOpen && taskCreatorMode === 'simple' && (
        <TaskEditDialog
          task={
            {
              id: 'new',
              name: pendingTaskTitle || '',
              description: '',
              priority: null,
              start_date: null,
              end_date: null,
              estimation_points: null,
              list_id: selectedListId,
              labels: [],
              archived: false,
              assignees: [],
              projects: [],
            } as any
          }
          boardId={selectedBoardId}
          isOpen={taskCreatorOpen}
          onClose={handleCloseTaskCreator}
          onUpdate={handleUpdate}
          mode="create"
        />
      )}

      {/* AI Preview Dialog */}
      <Dialog
        open={isPreviewOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCancelPreview();
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Review Generated {previewTasks.length} Task{previewTasks.length !== 1 ? 's' : ''}
            </DialogTitle>
            <DialogDescription>
              {selectedListId
                ? (() => {
                    const board = boardsData.find((b: any) =>
                      (b.task_lists as any[])?.some((l: any) => l.id === selectedListId)
                    );
                    const lists = (board?.task_lists as any[]) || [];
                    const list = lists.find((l: any) => l.id === selectedListId);
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
                <Label className="font-medium text-sm">
                  Workspace Labels
                </Label>
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
                  {previewTasks.length} task{previewTasks.length !== 1 ? 's' : ''}
                </Badge>
              </div>

              <div className="space-y-3">
                {previewTasks.map((task, index) => {
                  const selection = taskLabelSelections[index];
                  const suggestions = aiGenerateLabels
                    ? (selection?.suggestions ?? [])
                    : [];
                  const hasNewSelections = suggestions.some(
                    (option) => option.isNew && option.selected
                  );
                  const dueDateValue = taskDueDates[index];

                  return (
                    <div
                      key={task.id ?? `${task.name}-${index}`}
                      className="rounded-md border border-dynamic-surface/30 bg-background/80 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <p className="font-medium text-foreground text-sm">
                            {index + 1}. {task.name}
                          </p>
                          <p className="font-medium text-muted-foreground text-xs">
                            Description
                          </p>
                          {aiGenerateDescriptions ? (
                            <p className="text-foreground text-sm leading-relaxed opacity-90">
                              {task.description || 'No description'}
                            </p>
                          ) : (
                            <p className="text-muted-foreground text-sm italic">
                              Description generation disabled
                            </p>
                          )}
                        </div>
                        {aiGeneratePriority ? (
                          <Badge
                            variant="outline"
                            className={priorityBadgeClass(task.priority)}
                          >
                            {getPriorityCopy(task.priority)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs italic">
                            Priority disabled
                          </span>
                        )}
                      </div>

                      <div className="mt-3 space-y-1">
                        <p className="text-muted-foreground text-xs uppercase tracking-wide">
                          Due Date
                        </p>
                        <DateTimePicker
                          date={dueDateValue}
                          setDate={(date) => handleDueDateChange(index, date)}
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
                                  !expandedLabelCards[index] &&
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
                                        index,
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
                              onClick={() => toggleLabelPreviewExpansion(index)}
                              className="font-medium text-dynamic-blue text-xs hover:underline"
                              disabled={isCreating}
                            >
                              {expandedLabelCards[index]
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
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleCancelPreview}
              disabled={isCreating}
            >
              {t('dashboard.quick_journal.cancel_preview')}
            </Button>
            <Button
              type="button"
              onClick={handleConfirmTasks}
              disabled={disableConfirm}
            >
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-dynamic-blue" />
                  {t('dashboard.quick_journal.confirm_pending')}
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('dashboard.quick_journal.confirm_button')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

    
  );
}
