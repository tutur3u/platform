'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Flag,
  LayoutDashboard,
  ListTodo,
  Plus,
  Users,
} from '@tuturuuu/icons';
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
import { useTaskDialog } from '@tuturuuu/ui/tu-do/hooks/useTaskDialog';
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
  const { createTask, onUpdate } = useTaskDialog();
  const [activeTab, setActiveTab] = useState('tasks');
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
  const [isPreviewOpen, setPreviewOpen] = useState(false);
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

  // Fetch workspace labels
  const { data: workspaceLabels = [] } = useQuery({
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

    // Destination is confirmed, create task directly
    setPendingTaskTitle(title);
    createTask(selectedBoardId, selectedListId, availableLists);
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
                const textarea = document.querySelector(
                  '#my-tasks-command-bar-textarea'
                ) as HTMLTextAreaElement;
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
    </div>
  );
}
