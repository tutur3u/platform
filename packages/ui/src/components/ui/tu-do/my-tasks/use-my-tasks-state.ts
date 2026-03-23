'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWorkspaceLabel,
  createWorkspaceTaskBoard,
  createWorkspaceTaskProject,
  listWorkspaceBoardsWithLists,
  listWorkspaceLabels,
  listWorkspaceMembers,
  listWorkspaces,
  listWorkspaceTaskBoards,
  listWorkspaceTaskLists,
  listWorkspaceTaskProjects,
  updateWorkspaceTaskList,
} from '@tuturuuu/internal-api';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { AI_CREDITS_QUERY_KEY } from '@tuturuuu/ui/hooks/use-ai-credits';
import { toast } from '@tuturuuu/ui/sonner';
import { useTaskDialog } from '@tuturuuu/ui/tu-do/hooks/useTaskDialog';
import { useBoardConfig } from '@tuturuuu/utils/task-helper';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TaskOptions } from './command-bar';
import type { JournalTaskResponse } from './task-preview-dialog';
import {
  MY_COMPLETED_TASKS_QUERY_KEY,
  MY_TASKS_QUERY_KEY,
  useCompletedTasksQuery,
  useMyTasksQuery,
} from './use-my-tasks-query';

dayjs.extend(utc);
dayjs.extend(timezone);

interface UseMyTasksStateProps {
  wsId: string;
  userId: string;
  isPersonal: boolean;
}

export function useMyTasksState({
  wsId,
  userId,
  isPersonal,
}: UseMyTasksStateProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { onUpdate, openTaskById } = useTaskDialog();

  // Filter state (declared before query so it can be passed as param)
  const [taskFilters, setTaskFilters] = useState<{
    workspaceIds: string[];
    boardIds: string[];
    labelIds: string[];
    projectIds: string[];
    selfManagedOnly: boolean;
  }>({
    workspaceIds: ['all'],
    boardIds: ['all'],
    labelIds: [],
    projectIds: [],
    selfManagedOnly: false,
  });

  // Fetch tasks via TanStack Query (filters applied server-side)
  const { data: queryData, isLoading: queryLoading } = useMyTasksQuery(
    wsId,
    isPersonal,
    taskFilters
  );

  // Completed tasks with infinite scrolling (same filters as active tasks)
  const completedQuery = useCompletedTasksQuery(wsId, isPersonal, taskFilters);
  const completedTasks = useMemo(
    () => completedQuery.data?.pages.flatMap((p) => p.completed) ?? [],
    [completedQuery.data]
  );
  const hasMoreCompleted = completedQuery.hasNextPage ?? false;
  const fetchMoreCompleted = completedQuery.fetchNextPage;
  const isFetchingMoreCompleted = completedQuery.isFetchingNextPage;
  const totalCompletedTasks =
    completedQuery.data?.pages[0]?.totalCompletedTasks ?? 0;

  // Derive raw task arrays from query data
  const overdueTasks = queryData?.overdue;
  const todayTasks = queryData?.today;
  const upcomingTasks = queryData?.upcoming;

  // Board selector state
  const [boardSelectorOpen, setBoardSelectorOpen] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(wsId);
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [newBoardDialogOpen, setNewBoardDialogOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState<string>('');
  const [newListDialogOpen, setNewListDialogOpen] = useState(false);
  const [newListName, setNewListName] = useState<string>('');

  // Command bar state
  const [commandBarLoading, setCommandBarLoading] = useState(false);
  const [commandBarInput, setCommandBarInput] = useState('');

  // Task creation state
  const [pendingTaskTitle, setPendingTaskTitle] = useState<string>('');
  const [taskCreatorMode, setTaskCreatorMode] = useState<
    'simple' | 'ai' | null
  >(null);

  // AI Generation settings
  const [aiGenerateDescriptions, setAiGenerateDescriptions] = useState(true);
  const [aiGeneratePriority, setAiGeneratePriority] = useState(true);
  const [aiGenerateLabels, setAiGenerateLabels] = useState(true);

  // Auto-assign to me
  const [autoAssignToMe, setAutoAssignToMe] = useState(true);

  // AI flow step: idle → reviewing → selecting-destination
  type AiFlowStep = 'idle' | 'reviewing' | 'selecting-destination';
  const [aiFlowStep, setAiFlowStep] = useState<AiFlowStep>('idle');

  // Confirmed tasks from the review step (before destination selection)
  const [confirmedTasks, setConfirmedTasks] = useState<
    Array<{
      title: string;
      description: string | null;
      priority: TaskPriority | null;
      labels: Array<{ id?: string; name: string }>;
      dueDate: string | null;
      estimationPoints?: number | null;
      projectIds?: string[];
    }>
  >([]);

  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<any | null>(null);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);

  // Collapsible sections state (all collapsed by default)
  const [collapsedSections, setCollapsedSections] = useState({
    overdue: true,
    today: true,
    upcoming: true,
    completed: true,
  });

  // Label creation dialog state
  const [newLabelDialogOpen, setNewLabelDialogOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#3b82f6');
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

  const toggleSection = (
    section: 'overdue' | 'today' | 'upcoming' | 'completed'
  ) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Invalidate query cache instead of router.refresh()
  const handleUpdate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: [MY_TASKS_QUERY_KEY, wsId, isPersonal],
    });
    queryClient.invalidateQueries({
      queryKey: [MY_COMPLETED_TASKS_QUERY_KEY, wsId, isPersonal],
    });
    queryClient.invalidateQueries({ queryKey: ['user-workspaces'] });
    queryClient.invalidateQueries({ queryKey: ['workspace', wsId] });
  }, [queryClient, wsId, isPersonal]);

  // Connect centralized task dialog update to query invalidation
  useEffect(() => {
    const cleanup = onUpdate(handleUpdate);
    return cleanup;
  }, [onUpdate, handleUpdate]);

  // Fetch user's workspaces (only if in personal workspace)
  const { data: workspacesData } = useQuery({
    queryKey: ['user-workspaces'],
    queryFn: async () => {
      return listWorkspaces();
    },
    enabled: isPersonal,
  });

  const { data: allBoardsData = [] } = useQuery({
    queryKey: ['all-user-boards'],
    queryFn: async () => {
      const workspaces = await listWorkspaces();
      const workspaceIds = workspaces.map((workspace) => workspace.id);
      if (workspaceIds.length === 0) return [];

      const fetchAllWorkspaceBoards = async (workspaceId: string) => {
        const pageSize = 200;
        const boards: Awaited<
          ReturnType<typeof listWorkspaceTaskBoards>
        >['boards'] = [];
        let page = 1;

        while (true) {
          const payload = await listWorkspaceTaskBoards(workspaceId, {
            page,
            pageSize,
          });
          const pageBoards = payload.boards ?? [];
          boards.push(...pageBoards);

          if (pageBoards.length < pageSize) {
            break;
          }

          page += 1;
        }

        return boards;
      };

      const boardGroups = await Promise.all(
        workspaceIds.map((workspaceId) => fetchAllWorkspaceBoards(workspaceId))
      );

      return boardGroups
        .flat()
        .filter((board) => !board.deleted_at)
        .map((board) => ({
          id: board.id,
          name: board.name,
          ws_id: board.ws_id,
        }));
    },
    enabled: isPersonal,
  });

  // Check if current workspace has any boards (eager, for auto-creation)
  const { data: wsBoardCount, isLoading: wsBoardCountLoading } = useQuery({
    queryKey: ['workspace', wsId, 'board-count'],
    queryFn: async () => {
      const payload = await listWorkspaceTaskBoards(wsId, {
        page: 1,
        pageSize: 1,
      });
      return payload.count ?? 0;
    },
  });

  // Auto-create a board if the workspace has none
  const autoCreateAttemptedRef = useRef(false);

  // Translated names for the auto-created board and its default lists
  const defaultBoardName = t('ws-tasks.default_board_name');
  const defaultListNames: Record<string, string> = useMemo(
    () => ({
      'To Do': t('ws-tasks.default_list_todo'),
      'In Progress': t('ws-tasks.default_list_in_progress'),
      Done: t('ws-tasks.default_list_done'),
      Closed: t('ws-tasks.default_list_closed'),
    }),
    [t]
  );

  useEffect(() => {
    if (wsBoardCountLoading || wsBoardCount === undefined) return;
    if (wsBoardCount > 0) return;
    if (autoCreateAttemptedRef.current) return;
    autoCreateAttemptedRef.current = true;

    const autoCreateBoard = async () => {
      try {
        const { board: newBoard } = await createWorkspaceTaskBoard(wsId, {
          name: defaultBoardName,
        });
        if (!newBoard) return;

        const { lists } = await listWorkspaceTaskLists(wsId, newBoard.id);
        await Promise.all(
          (lists ?? [])
            .filter((list) => list.name && defaultListNames[list.name])
            .map((list) =>
              updateWorkspaceTaskList(wsId, newBoard.id, list.id, {
                name: defaultListNames[list.name!]!,
              })
            )
        );

        toast.info(t('ws-tasks.board_auto_created'));

        // Refresh board-related queries so selectors pick up the new board
        queryClient.invalidateQueries({
          queryKey: ['workspace', wsId, 'board-count'],
        });
        queryClient.invalidateQueries({
          queryKey: ['workspace', wsId, 'boards-with-lists'],
        });
        queryClient.invalidateQueries({ queryKey: ['all-user-boards'] });

        // Auto-select the new board
        setSelectedBoardId(newBoard.id);
      } catch (err) {
        console.error('Failed to auto-create board:', err);
      }
    };

    autoCreateBoard();
  }, [
    wsBoardCount,
    wsBoardCountLoading,
    wsId,
    t,
    queryClient,
    defaultBoardName,
    defaultListNames,
  ]);

  // Fetch boards with lists for selected workspace
  const { data: boardsDataRaw, isLoading: boardsLoading } = useQuery({
    queryKey: ['workspace', selectedWorkspaceId, 'boards-with-lists'],
    queryFn: async () => {
      const payload = await listWorkspaceBoardsWithLists(selectedWorkspaceId);
      return payload.boards || [];
    },
    enabled: boardSelectorOpen && !!selectedWorkspaceId,
  });

  const boardsData = Array.isArray(boardsDataRaw)
    ? boardsDataRaw
    : ((boardsDataRaw as any)?.boards ?? []);

  const allWorkspaceIds = useMemo(
    () => workspacesData?.map((ws) => ws.id) || [],
    [workspacesData]
  );

  // Fetch workspace labels
  const { data: workspaceLabels = [] } = useQuery({
    queryKey: ['workspaceLabels', JSON.stringify(allWorkspaceIds)],
    queryFn: async () => {
      if (allWorkspaceIds.length === 0) return [];
      const promises = allWorkspaceIds.map((id) => listWorkspaceLabels(id));
      const results = await Promise.all(promises);
      return results.flat().filter(Boolean);
    },
    enabled: isPersonal && allWorkspaceIds.length > 0,
  });

  // Fetch workspace projects
  const { data: workspaceProjects = [] } = useQuery({
    queryKey: ['workspaceProjects', JSON.stringify(allWorkspaceIds)],
    queryFn: async () => {
      if (allWorkspaceIds.length === 0) return [];
      const projectGroups = await Promise.all(
        allWorkspaceIds.map(async (workspaceId) => {
          const projects = await listWorkspaceTaskProjects(workspaceId);
          return projects.map((project) => ({
            id: project.id,
            name: project.name,
            ws_id: workspaceId,
          }));
        })
      );

      return projectGroups.flat().sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: isPersonal && allWorkspaceIds.length > 0,
  });

  // Fetch workspace members
  const { data: workspaceMembers = [] } = useQuery({
    queryKey: ['workspace', wsId, 'members'],
    queryFn: async () => {
      const data = await listWorkspaceMembers(wsId);
      return (data || []).map((member: any) => ({
        id: member.id || member.user_id,
        display_name: member.display_name,
        email: member.email,
        avatar_url: member.avatar_url,
      }));
    },
  });

  // Board config for estimation
  const { data: boardConfig } = useBoardConfig(
    selectedBoardId || undefined,
    selectedWorkspaceId || undefined
  );

  // Available lists for selected board
  const availableLists = useMemo(() => {
    if (!selectedBoardId) return [];
    const board = boardsData.find((b: any) => b.id === selectedBoardId);
    if (!board?.task_lists) return [];
    return (board.task_lists as any[])
      .filter((l: any) => !l.deleted)
      .sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
  }, [selectedBoardId, boardsData]);

  // Track previous workspace to detect actual changes (not dialog-open noise)
  const prevWorkspaceIdRef = useRef(selectedWorkspaceId);

  // Auto-select first workspace when dialog opens
  useEffect(() => {
    if (
      isPersonal &&
      boardSelectorOpen &&
      workspacesData &&
      workspacesData.length > 0 &&
      !selectedWorkspaceId
    ) {
      setSelectedWorkspaceId(workspacesData[0]?.id || '');
    }
  }, [isPersonal, boardSelectorOpen, workspacesData, selectedWorkspaceId]);

  // Reset board selection only when workspace actually changes (not on dialog open)
  useEffect(() => {
    if (prevWorkspaceIdRef.current !== selectedWorkspaceId) {
      prevWorkspaceIdRef.current = selectedWorkspaceId;
      if (boardSelectorOpen) {
        setSelectedBoardId('');
        setSelectedListId('');
      }
    }
  }, [selectedWorkspaceId, boardSelectorOpen]);

  // Auto-select first board and list when data arrives
  useEffect(() => {
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
      if (firstList) setSelectedListId(firstList.id);
    }
  }, [boardSelectorOpen, boardsData, selectedBoardId]);

  // Auto-select first list when board changes
  useEffect(() => {
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
    mutationFn: async (variables) => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/tasks/journal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry: variables.entry,
          previewOnly: true,
          generateDescriptions: variables.generateDescriptions,
          generatePriority: variables.generatePriority,
          generateLabels: variables.generateLabels,
          clientTimezone: variables.clientTimezone,
          clientTimestamp: variables.clientTimestamp,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        // Attach error code for credit-specific handling
        const errorObj = payload as {
          error?: string;
          code?: string;
        } | null;
        const err = new Error(errorObj?.error || 'Failed to generate preview');
        (err as any).code = errorObj?.code;
        (err as any).status = response.status;
        throw err;
      }
      return payload;
    },
    onSuccess: (payload, variables) => {
      setLastResult(payload ?? null);
      setPreviewEntry(variables.entry);
      setSelectedLabelIds([]);
      setCurrentPreviewIndex(0);
      setPreviewOpen(true);
      setAiFlowStep('reviewing');
      // Refresh credit balance after AI usage
      queryClient.invalidateQueries({ queryKey: [AI_CREDITS_QUERY_KEY] });
    },
    onError: (mutationError: Error) => {
      const code = (mutationError as any).code;
      const status = (mutationError as any).status;

      // Handle credit-specific 403 errors
      if (status === 403 && code) {
        // Refresh credit balance so indicator reflects current state
        queryClient.invalidateQueries({ queryKey: [AI_CREDITS_QUERY_KEY] });
        switch (code) {
          case 'CREDITS_EXHAUSTED':
            toast.error(t('ai-credits.error_credits_exhausted'));
            return;
          case 'MODEL_NOT_ALLOWED':
            toast.error(t('ai-credits.error_model_not_allowed'));
            return;
          case 'FEATURE_NOT_ALLOWED':
            toast.error(t('ai-credits.error_feature_not_allowed'));
            return;
          case 'DAILY_LIMIT_REACHED':
            toast.error(t('ai-credits.error_daily_limit_reached'));
            return;
        }
      }

      toast.error(
        mutationError.message || t('ws-tasks.errors.failed_generate_preview')
      );
    },
  });

  // Create tasks from preview
  const createTasksMutation = useMutation({
    mutationFn: async (payload: {
      targetWsId: string;
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
      assigneeIds?: string[];
      generatedWithAI: boolean;
      generateDescriptions: boolean;
      generatePriority: boolean;
      generateLabels: boolean;
      clientTimezone: string;
      clientTimestamp: string;
    }) => {
      const { targetWsId, ...body } = payload;
      const response = await fetch(
        `/api/v1/workspaces/${targetWsId}/tasks/journal`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(
          error?.error || t('ws-tasks.errors.failed_create_tasks')
        );
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success(t('ws-tasks.tasks_created_successfully'));
      setPreviewOpen(false);
      setLastResult(null);
      setPreviewEntry(null);
      setPendingTaskTitle('');
      setCommandBarInput('');
      setTaskCreatorMode(null);
      handleUpdate();
      // Refresh credit balance after task creation (may consume credits)
      queryClient.invalidateQueries({ queryKey: [AI_CREDITS_QUERY_KEY] });
    },
    onError: (error: Error) => {
      toast.error(error.message || t('ws-tasks.errors.failed_create_tasks'));
    },
  });

  const handleCreateTask = async (
    title: string,
    options?: TaskOptions
  ): Promise<boolean> => {
    if (!selectedBoardId || !selectedListId) {
      setPendingTaskTitle(title);
      setBoardSelectorOpen(true);
      return false;
    }

    setCommandBarLoading(true);
    try {
      const { createTask: createTaskFn } = await import(
        '@tuturuuu/utils/task-helper'
      );

      const mergedAssigneeIds = new Set(options?.assigneeIds ?? []);
      if (autoAssignToMe) mergedAssigneeIds.add(userId);

      const newTask = await createTaskFn(selectedWorkspaceId, selectedListId, {
        name: title.trim(),
        description: undefined,
        priority: options?.priority || undefined,
        start_date: undefined,
        end_date: options?.dueDate?.toISOString() || undefined,
        estimation_points: options?.estimationPoints || undefined,
        label_ids: options?.labelIds || [],
        project_ids: options?.projectIds || [],
        assignee_ids: [...mergedAssigneeIds],
      });

      if (newTask) {
        toast.success(t('ws-tasks.task_created_successfully'), {
          action: {
            label: t('common.open'),
            onClick: () => openTaskById(newTask.id),
          },
        });
        setPendingTaskTitle('');
        setCommandBarInput('');
        handleUpdate();
        return true;
      } else {
        toast.error(t('ws-tasks.errors.failed_create_task'));
        return false;
      }
    } catch (error: any) {
      console.error('Error creating task:', error);
      toast.error(error.message || t('ws-tasks.errors.failed_create_task'));
      return false;
    } finally {
      setCommandBarLoading(false);
    }
  };

  const handleGenerateAI = async (entry: string): Promise<boolean> => {
    const trimmedEntry = entry.trim();
    if (!trimmedEntry) {
      toast.error(t('ws-tasks.errors.missing_task_description'));
      return false;
    }

    setPendingTaskTitle(trimmedEntry);
    setTaskCreatorMode('ai');

    let timestampMoment = dayjs().tz(clientTimezone);
    if (!timestampMoment.isValid()) {
      timestampMoment = dayjs();
    }

    try {
      await previewMutation.mutateAsync({
        entry: trimmedEntry,
        generateDescriptions: aiGenerateDescriptions,
        generatePriority: aiGeneratePriority,
        generateLabels: aiGenerateLabels,
        clientTimezone,
        clientTimestamp: timestampMoment.toISOString(),
      });
      return true;
    } catch (_) {
      // Error handling is already done in onError of the mutation
      return false;
    }
  };

  // Called when user finishes reviewing AI tasks and clicks "Save Tasks"
  const handleConfirmReview = (
    tasks: Array<{
      title: string;
      description: string | null;
      priority: TaskPriority | null;
      labels: Array<{ id?: string; name: string }>;
      dueDate: string | null;
      estimationPoints?: number | null;
      projectIds?: string[];
    }>
  ) => {
    setConfirmedTasks(tasks);
    setPreviewOpen(false);
    setAiFlowStep('selecting-destination');
    setBoardSelectorOpen(true);
  };

  const handleBoardSelectorConfirm = async () => {
    setBoardSelectorOpen(false);

    // Coming from AI review flow — create tasks with confirmed data
    if (aiFlowStep === 'selecting-destination' && confirmedTasks.length > 0) {
      let timestampMoment = dayjs().tz(clientTimezone);
      if (!timestampMoment.isValid()) {
        timestampMoment = dayjs();
      }

      createTasksMutation.mutate({
        targetWsId: selectedWorkspaceId,
        entry: (previewEntry ?? pendingTaskTitle).trim(),
        listId: selectedListId,
        tasks: confirmedTasks,
        labelIds: selectedLabelIds,
        assigneeIds: autoAssignToMe ? [userId] : [],
        generatedWithAI: Boolean(lastResult?.metadata?.generatedWithAI),
        generateDescriptions: aiGenerateDescriptions,
        generatePriority: aiGeneratePriority,
        generateLabels: aiGenerateLabels,
        clientTimezone,
        clientTimestamp: timestampMoment.toISOString(),
      });

      setAiFlowStep('idle');
      setConfirmedTasks([]);
      return;
    }

    if (pendingTaskTitle && taskCreatorMode === 'ai') {
      handleGenerateAI(pendingTaskTitle);
    } else if (pendingTaskTitle && taskCreatorMode === 'simple') {
      const success = await handleCreateTask(pendingTaskTitle);
      if (success) setCommandBarInput('');
    }
  };

  // Selected destination details for CommandBar
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

  // Filter handlers
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

  // Label creation
  const handleCreateNewLabel = async () => {
    if (!newLabelName.trim()) return;
    setCreatingLabel(true);
    try {
      await createWorkspaceLabel(wsId, {
        name: newLabelName.trim(),
        color: newLabelColor,
      });
      queryClient.invalidateQueries({ queryKey: ['workspaceLabels'] });
      toast.success(t('ws-tasks.label_created'));
      setNewLabelDialogOpen(false);
      setNewLabelName('');
      setNewLabelColor('#3b82f6');
    } catch (error: any) {
      console.error('Error creating label:', error);
      toast.error(error.message || t('ws-tasks.errors.failed_create_label'));
    } finally {
      setCreatingLabel(false);
    }
  };

  // Project creation
  const handleCreateNewProject = async () => {
    if (!newProjectName.trim()) return;
    setCreatingProject(true);
    try {
      await createWorkspaceTaskProject(wsId, {
        name: newProjectName.trim(),
      });
      queryClient.invalidateQueries({ queryKey: ['workspaceProjects'] });
      toast.success(t('ws-tasks.project_created'));
      setNewProjectDialogOpen(false);
      setNewProjectName('');
    } catch (error: any) {
      console.error('Error creating project:', error);
      toast.error(error.message || t('ws-tasks.errors.failed_create_project'));
    } finally {
      setCreatingProject(false);
    }
  };

  // Server-side filtering: tasks are already filtered by the RPC.
  // filteredTasks is now just the raw query data.
  const filteredTasks = useMemo(
    () => ({ overdueTasks, todayTasks, upcomingTasks }),
    [overdueTasks, todayTasks, upcomingTasks]
  );

  return {
    // Query data
    queryData,
    queryLoading,
    completedTasks,
    hasMoreCompleted,
    fetchMoreCompleted,
    isFetchingMoreCompleted,
    totalCompletedTasks,

    // State
    boardSelectorOpen,
    setBoardSelectorOpen,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    selectedBoardId,
    setSelectedBoardId,
    selectedListId,
    setSelectedListId,
    newBoardDialogOpen,
    setNewBoardDialogOpen,
    newBoardName,
    setNewBoardName,
    newListDialogOpen,
    setNewListDialogOpen,
    newListName,
    setNewListName,
    commandBarLoading,
    commandBarInput,
    setCommandBarInput,
    pendingTaskTitle,
    setPendingTaskTitle,
    taskCreatorMode,
    setTaskCreatorMode,
    aiGenerateDescriptions,
    setAiGenerateDescriptions,
    aiGeneratePriority,
    setAiGeneratePriority,
    aiGenerateLabels,
    setAiGenerateLabels,
    autoAssignToMe,
    setAutoAssignToMe,
    previewOpen,
    setPreviewOpen,
    previewEntry,
    lastResult,
    selectedLabelIds,
    setSelectedLabelIds,
    currentPreviewIndex,
    setCurrentPreviewIndex,
    collapsedSections,
    toggleSection,
    taskFilters,
    setTaskFilters,
    newLabelDialogOpen,
    setNewLabelDialogOpen,
    newLabelName,
    setNewLabelName,
    newLabelColor,
    setNewLabelColor,
    creatingLabel,
    newProjectDialogOpen,
    setNewProjectDialogOpen,
    newProjectName,
    setNewProjectName,
    creatingProject,

    // Data
    workspacesData,
    allBoardsData,
    boardsData,
    boardsLoading,
    workspaceLabels,
    workspaceProjects,
    workspaceMembers,
    boardConfig,
    availableLists,
    selectedDestination,
    availableLabels: workspaceLabels,
    availableProjects: workspaceProjects,
    filteredTasks,

    // Mutations
    previewMutation,
    createTasksMutation,

    // AI flow
    aiFlowStep,
    confirmedTasks,

    // Handlers
    handleUpdate,
    handleCreateTask,
    handleGenerateAI,
    handleConfirmReview,
    handleBoardSelectorConfirm,
    handleClearDestination,
    handleFilterChange,
    handleLabelFilterChange,
    handleProjectFilterChange,
    handleCreateNewLabel,
    handleCreateNewProject,
  };
}
