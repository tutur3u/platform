'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/react';
import {
  Calendar,
  Clock,
  Flag,
  LayoutDashboard,
  ListTodo,
  Plus,
  Users,
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
import { CommandBar, type CommandMode, type TaskOptions } from './command-bar';
import NoteList from './note-list';
import TaskList from './task-list';
import type {
  JournalTaskResponse,
  WorkspaceLabel,
} from './task-preview-dialog';
import { TaskPreviewDialog } from './task-preview-dialog';

dayjs.extend(utc);
dayjs.extend(timezone);

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
  const [newListDialogOpen, setNewListDialogOpen] = useState(false);
  const [newListName, setNewListName] = useState<string>('');
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
      {activeMode === 'task' && (
        <div className="fade-in mt-6 animate-in space-y-6 duration-300">
          <TaskList
            isPersonal={isPersonal}
            commandBarLoading={commandBarLoading}
            overdueTasks={overdueTasks}
            todayTasks={todayTasks}
            upcomingTasks={upcomingTasks}
            totalActiveTasks={totalActiveTasks}
            collapsedSections={collapsedSections}
            toggleSection={toggleSection}
            handleUpdate={handleUpdate}
            setBoardSelectorOpen={setBoardSelectorOpen}
          />
        </div>
      )}

      {activeMode === 'note' && (
        <div className="fade-in mt-6 animate-in duration-300">
          <NoteList wsId={wsId} />
        </div>
      )}

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
