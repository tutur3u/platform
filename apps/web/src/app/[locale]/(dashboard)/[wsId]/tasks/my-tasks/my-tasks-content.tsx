'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Flag,
  LayoutDashboard,
  ListTodo,
  Plus,
  Users,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskWithRelations } from '@tuturuuu/types/db';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
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
import { TaskBoardForm } from '@tuturuuu/ui/tu-do/boards/form';
import { useTaskDialog } from '@tuturuuu/ui/tu-do/hooks/useTaskDialog';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TaskListWithCompletion from '../../(dashboard)/tasks/task-list-with-completion';
import { CommandBar, type CommandMode, type TaskOptions } from './command-bar';
import NotesList from './notes-list';

dayjs.extend(utc);
dayjs.extend(timezone);

const MAX_LABEL_SUGGESTIONS = 6;

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
  const [, setPreviewOpen] = useState(false);
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
    <div className="space-y-12">
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
                <span className="text-sm">{overdueCount}</span>
              </Badge>
              <Badge
                variant="secondary"
                className="gap-1.5 rounded-full bg-dynamic-orange/10 px-3 py-1.5 font-semibold text-dynamic-orange shadow-sm"
              >
                <Calendar className="h-3.5 w-3.5" />
                <span className="text-sm">{todayCount}</span>
              </Badge>
              <Badge
                variant="secondary"
                className="gap-1.5 rounded-full bg-dynamic-blue/10 px-3 py-1.5 font-semibold text-dynamic-blue shadow-sm"
              >
                <Flag className="h-3.5 w-3.5" />
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

      {/* Spacer for breathing room */}
      <div className="h-8" />

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
          wsId={wsId}
        />
      </div>

      {/* Spacer for breathing room */}
      <div className="h-16" />

      {/* Insights Section - Mode-specific insights */}
      {activeMode === 'task' && totalActiveTasks > 0 && (
        <div className="fade-in slide-in-from-bottom-2 mx-auto max-w-5xl animate-in duration-500">
          <div className="grid grid-cols-3 gap-4">
            <Card className="overflow-hidden border-dynamic-red/20 bg-gradient-to-br from-dynamic-red/5 to-background">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-dynamic-red/15">
                    <Clock className="h-6 w-6 text-dynamic-red" />
                  </div>
                  <div className="flex-1">
                    <p className="text-muted-foreground text-xs uppercase tracking-wider">
                      Overdue
                    </p>
                    <p className="mt-1 font-bold text-2xl">{overdueCount}</p>
                    <p className="mt-0.5 text-muted-foreground text-xs">
                      Need attention now
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-dynamic-orange/20 bg-gradient-to-br from-dynamic-orange/5 to-background">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-dynamic-orange/15">
                    <Calendar className="h-6 w-6 text-dynamic-orange" />
                  </div>
                  <div className="flex-1">
                    <p className="text-muted-foreground text-xs uppercase tracking-wider">
                      Due Today
                    </p>
                    <p className="mt-1 font-bold text-2xl">{todayCount}</p>
                    <p className="mt-0.5 text-muted-foreground text-xs">
                      Complete by end of day
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-dynamic-blue/20 bg-gradient-to-br from-dynamic-blue/5 to-background">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-dynamic-blue/15">
                    <Flag className="h-6 w-6 text-dynamic-blue" />
                  </div>
                  <div className="flex-1">
                    <p className="text-muted-foreground text-xs uppercase tracking-wider">
                      Upcoming
                    </p>
                    <p className="mt-1 font-bold text-2xl">{upcomingCount}</p>
                    <p className="mt-0.5 text-muted-foreground text-xs">
                      Plan ahead
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

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
                        Requires immediate attention • {overdueTasks.length}{' '}
                        task
                        {overdueTasks.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className="h-10 rounded-xl bg-dynamic-red/20 px-4 font-bold text-dynamic-red text-lg shadow-md"
                  >
                    {overdueTasks.length}
                  </Badge>
                </div>

                {/* Task List - Grouped by Priority */}
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
              </div>
            ) : null}

            {/* Due Today */}
            {todayTasks && todayTasks.length > 0 ? (
              <div className="space-y-4">
                {/* Section Header */}
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
                        Complete by end of day • {todayTasks.length} task
                        {todayTasks.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className="h-10 rounded-xl bg-dynamic-orange/20 px-4 font-bold text-dynamic-orange text-lg shadow-md"
                  >
                    {todayTasks.length}
                  </Badge>
                </div>

                {/* Task List - Grouped by Priority */}
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
              </div>
            ) : null}

            {/* Upcoming Tasks */}
            {upcomingTasks && upcomingTasks.length > 0 ? (
              <div className="space-y-4">
                {/* Section Header */}
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
                        Plan ahead and stay on track • {upcomingTasks.length}{' '}
                        task
                        {upcomingTasks.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className="h-10 rounded-xl bg-dynamic-blue/20 px-4 font-bold text-dynamic-blue text-lg shadow-md"
                  >
                    {upcomingTasks.length}
                  </Badge>
                </div>

                {/* Task List - Grouped by Priority */}
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

            {/* Quick tips when there are tasks */}
            {totalActiveTasks > 0 && (
              <div className="mt-8 rounded-xl border bg-muted/30 p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Flag className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <h4 className="font-semibold text-sm">Pro Tips</h4>
                    <ul className="space-y-1.5 text-muted-foreground text-sm">
                      <li className="flex items-start gap-2">
                        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <span>
                          Click any task to view details and add descriptions
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <span>
                          Use AI generation to break down complex tasks
                          automatically
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <span>
                          Press{' '}
                          <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-xs">
                            ⌘K
                          </kbd>{' '}
                          to quickly search and create
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
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
    </div>
  );
}
