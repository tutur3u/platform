'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addWorkspaceTaskPlanWorkspace,
  createWorkspaceTaskPlan,
  createWorkspaceTaskPlanItem,
  isTaskPlanSchemaUnavailable,
  listWorkspaceBoardsWithLists,
  listWorkspaces,
  listWorkspaceTaskPlans,
  type TaskPlanPeriod,
  type TaskPlanStatus,
  updateWorkspaceTaskPlan,
} from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { buildPlanWindow, getDefaultPlanTitle } from './planner-utils';

interface UseKanbanPlannerStateOptions {
  boardId: string | null;
  enabled?: boolean;
  isPersonalWorkspace: boolean;
  workspaceId: string;
}

export function useKanbanPlannerState({
  boardId,
  enabled = true,
  isPersonalWorkspace,
  workspaceId,
}: UseKanbanPlannerStateOptions) {
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<TaskPlanPeriod>('week');
  const [planTitle, setPlanTitle] = useState('');
  const [editMode, setEditMode] = useState<TaskPlanPeriod>('week');
  const [editStatus, setEditStatus] = useState<TaskPlanStatus>('draft');
  const [editTitle, setEditTitle] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [targetWorkspaceId, setTargetWorkspaceId] = useState(workspaceId);
  const [targetBoardId, setTargetBoardId] = useState(boardId ?? '');
  const [targetListId, setTargetListId] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [plannedDate, setPlannedDate] = useState(buildPlanWindow('week').start);

  const plansQueryKey = ['task-plans', workspaceId] as const;
  const plansQuery = useQuery({
    enabled: isPersonalWorkspace && enabled,
    queryKey: plansQueryKey,
    queryFn: () => listWorkspaceTaskPlans(workspaceId),
    staleTime: 20_000,
  });
  const schemaUnavailable =
    plansQuery.data && isTaskPlanSchemaUnavailable(plansQuery.data);
  const plans = schemaUnavailable ? [] : (plansQuery.data?.plans ?? []);
  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? plans[0] ?? null,
    [plans, selectedPlanId]
  );

  const workspacesQuery = useQuery({
    enabled: isPersonalWorkspace && enabled && !schemaUnavailable,
    queryKey: ['task-plan-workspaces'],
    queryFn: () => listWorkspaces({ limit: 100 }),
    staleTime: 60_000,
  });
  const boardsQuery = useQuery({
    enabled: enabled && Boolean(targetWorkspaceId) && !schemaUnavailable,
    queryKey: ['task-plan-boards-with-lists', targetWorkspaceId],
    queryFn: () => listWorkspaceBoardsWithLists(targetWorkspaceId),
    staleTime: 30_000,
  });
  const targetWorkspace = workspacesQuery.data?.find(
    (workspace) => workspace.id === targetWorkspaceId
  );
  const boards = boardsQuery.data?.boards ?? [];
  const targetBoard = boards.find((board) => board.id === targetBoardId);
  const lists = targetBoard?.task_lists ?? [];
  const intendedWorkspaceIds = new Set(
    selectedPlan?.workspaces?.map((workspace) => workspace.ws_id) ?? []
  );
  const targetIsIntended = intendedWorkspaceIds.has(targetWorkspaceId);

  useEffect(() => {
    if (!selectedPlan) return;
    setEditMode(selectedPlan.period_type);
    setEditStatus(selectedPlan.status);
    setEditTitle(selectedPlan.title);
    setPlannedDate(selectedPlan.period_start);
    setTargetWorkspaceId(selectedPlan.default_target_ws_id ?? workspaceId);
    setTargetBoardId(selectedPlan.default_target_board_id ?? boardId ?? '');
    setTargetListId(selectedPlan.default_target_list_id ?? '');
  }, [boardId, selectedPlan, workspaceId]);
  useEffect(() => {
    if (!targetBoardId && boards[0]?.id) setTargetBoardId(boards[0].id);
  }, [boards, targetBoardId]);
  useEffect(() => {
    if (!targetListId && lists[0]?.id) setTargetListId(lists[0].id);
  }, [lists, targetListId]);

  const createPlanMutation = useMutation({
    mutationFn: () => {
      const window = buildPlanWindow(mode);
      return createWorkspaceTaskPlan(workspaceId, {
        title: planTitle.trim() || getDefaultPlanTitle(mode),
        period_type: mode,
        period_start: window.start,
        period_end: window.end,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        default_target_ws_id: targetWorkspaceId,
        default_target_board_id: targetBoardId || null,
        default_target_list_id: targetListId || null,
        intended_workspace_ids: [targetWorkspaceId],
      });
    },
    onSuccess: (response) => {
      if (isTaskPlanSchemaUnavailable(response)) return;
      setSelectedPlanId(response.plan.id);
      setPlanTitle('');
      void queryClient.invalidateQueries({ queryKey: plansQueryKey });
    },
    onError: () => toast.error(tCommon('error')),
  });
  const updatePlanMutation = useMutation({
    mutationFn: () => {
      if (!selectedPlan) throw new Error('Missing plan');
      const window = buildPlanWindow(editMode);
      return updateWorkspaceTaskPlan(workspaceId, selectedPlan.id, {
        title: editTitle.trim() || getDefaultPlanTitle(editMode),
        period_type: editMode,
        period_start: window.start,
        period_end: window.end,
        timezone: selectedPlan.timezone || 'UTC',
        status: editStatus,
        default_target_ws_id: targetWorkspaceId,
        default_target_board_id: targetBoardId || null,
        default_target_list_id: targetListId || null,
      });
    },
    onSuccess: (response) => {
      if (isTaskPlanSchemaUnavailable(response)) return;
      void queryClient.invalidateQueries({ queryKey: plansQueryKey });
    },
    onError: () => toast.error(tCommon('error')),
  });
  const addWorkspaceMutation = useMutation({
    mutationFn: () => {
      if (!selectedPlan) throw new Error('Missing plan');
      return addWorkspaceTaskPlanWorkspace(
        workspaceId,
        selectedPlan.id,
        targetWorkspaceId
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: plansQueryKey }),
    onError: () => toast.error(tCommon('error')),
  });
  const createItemMutation = useMutation({
    mutationFn: () => {
      if (!selectedPlan || !taskTitle.trim()) throw new Error('Missing task');
      const createSource = Boolean(targetIsIntended && targetListId);
      return createWorkspaceTaskPlanItem(workspaceId, selectedPlan.id, {
        target_ws_id: createSource ? targetWorkspaceId : null,
        target_board_id: createSource ? targetBoardId : null,
        target_list_id: createSource ? targetListId : null,
        planned_start: plannedDate,
        status: createSource ? 'planned' : 'draft',
        snapshot_title: taskTitle.trim(),
        source_task: createSource
          ? {
              name: taskTitle.trim(),
              listId: targetListId,
              end_date: plannedDate,
            }
          : undefined,
      });
    },
    onSuccess: (response) => {
      if (isTaskPlanSchemaUnavailable(response)) return;
      setTaskTitle('');
      void queryClient.invalidateQueries({ queryKey: plansQueryKey });
    },
    onError: () => toast.error(tCommon('error')),
  });

  return {
    addWorkspaceMutation,
    boards,
    createItemMutation,
    createPlanMutation,
    editMode,
    editStatus,
    editTitle,
    invalidatePlans: () =>
      queryClient.invalidateQueries({ queryKey: plansQueryKey }),
    lists,
    mode,
    planTitle,
    plannedDate,
    plans,
    plansQuery,
    plansQueryKey,
    schemaUnavailable,
    selectedPlan,
    setEditMode,
    setEditStatus,
    setEditTitle,
    setMode,
    setPlannedDate,
    setPlanTitle,
    setSelectedPlanId,
    setTargetBoardId: (value: string) => {
      setTargetBoardId(value);
      setTargetListId('');
    },
    setTargetListId,
    setTargetWorkspaceId: (value: string) => {
      setTargetWorkspaceId(value);
      setTargetBoardId('');
      setTargetListId('');
    },
    setTaskTitle,
    targetBoardId,
    targetIsIntended,
    targetListId,
    targetWorkspace,
    targetWorkspaceId,
    taskTitle,
    updatePlanMutation,
    workspaces: workspacesQuery.data ?? [],
  };
}
