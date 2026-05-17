'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWorkspaceTask,
  createWorkspaceTaskJournal,
  getWorkspaceTaskBoard,
  listWorkspaceLabels,
  listWorkspaceTaskLists,
  listWorkspaceTaskProjects,
} from '@tuturuuu/internal-api/tasks';
import { toast } from '@tuturuuu/ui/sonner';
import type {
  ConfirmedTask,
  JournalTaskResponse,
} from '@tuturuuu/ui/tu-do/my-tasks/task-preview-dialog';
import { getActiveBroadcast } from '@tuturuuu/ui/tu-do/shared/board-broadcast-context';
import { useTranslations } from 'next-intl';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type {
  TaskBoardAiChatBarTask,
  TaskBoardAiChatBarUser,
} from './task-board-ai-chat-bar-types';
import { mergeCreatedTasks } from './task-board-ai-chat-bar-utils';

const LAST_SELECTED_LIST_STORAGE_KEY_PREFIX =
  'tuturuuu:task-board-ai-chat-bar:last-selected-list';

interface UseTaskBoardAiChatBarTaskFlowParams {
  boardId: string;
  currentUser: TaskBoardAiChatBarUser;
  expanded: boolean;
  wsId: string;
}

function getClientTimeContext() {
  return {
    clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
    clientTimestamp: new Date().toISOString(),
  };
}

export function useTaskBoardAiChatBarTaskFlow({
  boardId,
  currentUser,
  expanded,
  wsId,
}: UseTaskBoardAiChatBarTaskFlowParams) {
  const tTasks = useTranslations('ws-tasks');
  const queryClient = useQueryClient();
  const [taskInput, setTaskInput] = useState('');
  const [selectedListId, setSelectedListIdState] = useState('');
  const [aiTaskMode, setAiTaskMode] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<JournalTaskResponse | null>(
    null
  );
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const selectedListStorageKey = useMemo(
    () => `${LAST_SELECTED_LIST_STORAGE_KEY_PREFIX}:${wsId}:${boardId}`,
    [boardId, wsId]
  );

  const setSelectedListId = useCallback(
    (nextListId: string) => {
      setSelectedListIdState(nextListId);

      if (typeof window === 'undefined') return;
      if (nextListId) {
        window.localStorage.setItem(selectedListStorageKey, nextListId);
      } else {
        window.localStorage.removeItem(selectedListStorageKey);
      }
    },
    [selectedListStorageKey]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setSelectedListIdState(
      window.localStorage.getItem(selectedListStorageKey) ?? ''
    );
  }, [selectedListStorageKey]);

  const { data: lists = [], isLoading: listsLoading } = useQuery({
    queryKey: ['task_lists', boardId],
    queryFn: async () => {
      const payload = await listWorkspaceTaskLists(wsId, boardId);
      return payload.lists ?? [];
    },
    enabled: expanded,
    staleTime: 5 * 60 * 1000,
  });

  const { data: workspaceLabels = [] } = useQuery({
    queryKey: ['workspace-labels', wsId],
    queryFn: () => listWorkspaceLabels(wsId),
    enabled: expanded || previewOpen,
    staleTime: 5 * 60 * 1000,
  });

  const { data: workspaceProjects = [] } = useQuery({
    queryKey: ['workspace-task-projects', wsId],
    queryFn: () => listWorkspaceTaskProjects(wsId),
    enabled: expanded || previewOpen,
    staleTime: 5 * 60 * 1000,
  });

  const { data: boardPayload } = useQuery({
    queryKey: ['task-board', wsId, boardId],
    queryFn: () => getWorkspaceTaskBoard(wsId, boardId),
    enabled: expanded || previewOpen,
    staleTime: 5 * 60 * 1000,
  });

  const activeLists = useMemo(
    () =>
      lists
        .filter((list) => !list.deleted)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [lists]
  );

  const defaultList = useMemo(
    () =>
      activeLists.find(
        (list) => list.status === 'not_started' || list.status === 'active'
      ) ??
      activeLists[0] ??
      null,
    [activeLists]
  );

  useEffect(() => {
    if (!defaultList) return;
    const selectedStillExists = activeLists.some(
      (list) => list.id === selectedListId
    );
    if (!selectedStillExists) {
      setSelectedListId(defaultList.id);
    }
  }, [activeLists, defaultList, selectedListId, setSelectedListId]);

  const selectedList = activeLists.find((list) => list.id === selectedListId);
  const canCreateTask = taskInput.trim().length > 0 && Boolean(selectedListId);
  const boardConfig = boardPayload?.board
    ? {
        estimation_type: boardPayload.board.estimation_type,
        extended_estimation: boardPayload.board.extended_estimation,
        allow_zero_estimates: boardPayload.board.allow_zero_estimates,
      }
    : null;

  const publishCreatedTasks = useCallback(
    (tasks: TaskBoardAiChatBarTask[]) => {
      if (!tasks.length) return;

      queryClient.setQueryData<TaskBoardAiChatBarTask[]>(
        ['tasks', boardId],
        (current) => mergeCreatedTasks(current, tasks)
      );
      queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
      queryClient.invalidateQueries({
        queryKey: ['task-board', wsId, boardId],
      });

      const broadcast = getActiveBroadcast();
      for (const task of tasks) {
        broadcast?.('task:upsert', { task });
      }

      const tasksWithRelations = tasks
        .filter(
          (task) =>
            (task.assignee_ids?.length ?? 0) > 0 ||
            (task.label_ids?.length ?? 0) > 0 ||
            (task.project_ids?.length ?? 0) > 0
        )
        .map((task) => task.id);

      if (tasksWithRelations.length > 0) {
        broadcast?.('task:relations-changed', { taskIds: tasksWithRelations });
      }
    },
    [boardId, queryClient, wsId]
  );

  const simpleCreateMutation = useMutation({
    mutationFn: async () => {
      const entry = taskInput.trim();
      if (!entry || !selectedListId) return [];

      const payload = await createWorkspaceTask(wsId, {
        name: entry,
        listId: selectedListId,
        assignee_ids: [currentUser.id],
      });
      return payload.task ? [payload.task] : [];
    },
    onSuccess: (tasks) => {
      if (!tasks.length) {
        toast.error(tTasks('errors.failed_create_task'));
        return;
      }

      publishCreatedTasks(tasks);
      toast.success(tTasks('task_created_successfully'));
      setTaskInput('');
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : tTasks('errors.failed_create_task')
      );
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const entry = taskInput.trim();
      if (!entry) return null;

      return createWorkspaceTaskJournal(wsId, {
        entry,
        previewOnly: true,
        generateDescriptions: true,
        generateLabels: true,
        generatePriority: true,
        ...getClientTimeContext(),
      });
    },
    onSuccess: (payload) => {
      if (!payload?.tasks?.length) {
        toast.error(tTasks('errors.failed_generate_preview'));
        return;
      }

      setLastResult(payload as JournalTaskResponse);
      setPreviewEntry(taskInput.trim());
      setSelectedLabelIds([]);
      setCurrentPreviewIndex(0);
      setPreviewOpen(true);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : tTasks('errors.failed_generate_preview')
      );
    },
  });

  const savePreviewMutation = useMutation({
    mutationFn: async (tasks: ConfirmedTask[]) => {
      const entry = (previewEntry ?? taskInput).trim();
      if (!entry || !selectedListId || tasks.length === 0) return [];

      const payload = await createWorkspaceTaskJournal(wsId, {
        entry,
        listId: selectedListId,
        tasks,
        labelIds: selectedLabelIds,
        assigneeIds: [currentUser.id],
        generatedWithAI: Boolean(lastResult?.metadata?.generatedWithAI),
        generateDescriptions: true,
        generateLabels: true,
        generatePriority: true,
        ...getClientTimeContext(),
      });

      return payload.tasks as unknown as TaskBoardAiChatBarTask[];
    },
    onSuccess: (tasks) => {
      if (!tasks.length) {
        toast.error(tTasks('errors.failed_create_tasks'));
        return;
      }

      publishCreatedTasks(tasks);
      toast.success(
        tasks.length > 1
          ? tTasks('tasks_created_successfully')
          : tTasks('task_created_successfully')
      );
      setTaskInput('');
      setPreviewOpen(false);
      setLastResult(null);
      setPreviewEntry(null);
      setSelectedLabelIds([]);
      setCurrentPreviewIndex(0);
    },
    onError: (error) => {
      setPreviewOpen(true);
      toast.error(
        error instanceof Error
          ? error.message
          : tTasks('errors.failed_create_tasks')
      );
    },
  });

  const isWorking =
    simpleCreateMutation.isPending ||
    previewMutation.isPending ||
    savePreviewMutation.isPending;

  const submitTaskInput = () => {
    if (!canCreateTask || isWorking) return;

    if (aiTaskMode) {
      previewMutation.mutate();
      return;
    }

    simpleCreateMutation.mutate();
  };

  const handleTaskSubmit = (event: FormEvent) => {
    event.preventDefault();
    submitTaskInput();
  };

  return {
    activeLists,
    aiTaskMode,
    boardConfig,
    canCreateTask,
    clientTimezone: getClientTimeContext().clientTimezone,
    currentPreviewIndex,
    handleConfirmReview: savePreviewMutation.mutate,
    handleTaskSubmit,
    isWorking,
    lastResult,
    listsLoading,
    previewEntry,
    previewOpen,
    selectedLabelIds,
    selectedList,
    selectedListId,
    setAiTaskMode,
    setCurrentPreviewIndex,
    setPreviewOpen,
    setSelectedLabelIds,
    setSelectedListId,
    setTaskInput,
    submitTaskInput,
    taskInput,
    workspaceLabels,
    workspaceProjects,
  };
}
