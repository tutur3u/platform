import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { toast } from '@tuturuuu/ui/sonner';
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useState,
} from 'react';
import { getRandomNewLabelColor } from '../../../utils/taskConstants';
import {
  type BoardBroadcastFn,
  getActiveBoardRefresh,
  getActiveBroadcast,
  useBoardBroadcast,
} from '../../board-broadcast-context';
import { patchTaskInVisibleCaches } from '../../task-cache-patches';
import type {
  WorkspaceTaskAssignee,
  WorkspaceTaskLabel,
  WorkspaceTaskProject,
} from '../types';
import {
  createWorkspaceLabel,
  createWorkspaceProject,
  updateWorkspaceTask,
} from './task-api';

export interface UseTaskRelationshipsProps {
  wsId: string;
  labelCacheWorkspaceId?: string;
  taskId?: string;
  isCreateMode: boolean;
  boardId: string;
  selectedLabels: WorkspaceTaskLabel[];
  selectedAssignees: WorkspaceTaskAssignee[];
  selectedProjects: WorkspaceTaskProject[];
  newLabelName: string;
  newLabelColor: string;
  newProjectName: string;
  setSelectedLabels: (
    value:
      | WorkspaceTaskLabel[]
      | ((prev: WorkspaceTaskLabel[]) => WorkspaceTaskLabel[])
  ) => void;
  setSelectedAssignees: (
    value:
      | WorkspaceTaskAssignee[]
      | ((prev: WorkspaceTaskAssignee[]) => WorkspaceTaskAssignee[])
  ) => void;
  setSelectedProjects: (
    value:
      | WorkspaceTaskProject[]
      | ((prev: WorkspaceTaskProject[]) => WorkspaceTaskProject[])
  ) => void;
  setAvailableLabels: (
    value:
      | WorkspaceTaskLabel[]
      | ((prev: WorkspaceTaskLabel[]) => WorkspaceTaskLabel[])
  ) => void;
  setNewLabelName: (value: string) => void;
  setNewLabelColor: Dispatch<SetStateAction<string>>;
  setNewProjectName: (value: string) => void;
  setShowNewLabelDialog: (value: boolean) => void;
  setShowNewProjectDialog: (value: boolean) => void;
  fallbackBroadcast?: BoardBroadcastFn | null;
  onUpdate: () => void;
}

export interface UseTaskRelationshipsReturn {
  toggleLabel: (label: WorkspaceTaskLabel) => Promise<void>;
  toggleAssignee: (member: WorkspaceTaskAssignee) => Promise<void>;
  toggleProject: (project: WorkspaceTaskProject) => Promise<void>;
  handleCreateLabel: () => Promise<void>;
  handleCreateProject: () => Promise<void>;
  creatingLabel: boolean;
  creatingProject: boolean;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function compareLabelsByName(
  a: WorkspaceTaskLabel,
  b: WorkspaceTaskLabel
): number {
  return (a?.name || '')
    .toLowerCase()
    .localeCompare((b?.name || '').toLowerCase());
}

function upsertLabelSortedByName(
  labels: WorkspaceTaskLabel[] | undefined,
  label: WorkspaceTaskLabel
) {
  const existingLabels = labels ?? [];
  return [
    label,
    ...existingLabels.filter((entry) => entry.id !== label.id),
  ].sort(compareLabelsByName);
}

function upsertWorkspaceLabelCaches({
  queryClient,
  workspaceIds,
  label,
}: {
  queryClient: QueryClient;
  workspaceIds: Array<string | undefined>;
  label: WorkspaceTaskLabel;
}) {
  const uniqueWorkspaceIds = Array.from(
    new Set(workspaceIds.filter((id): id is string => Boolean(id)))
  );

  for (const workspaceId of uniqueWorkspaceIds) {
    queryClient.setQueryData(
      ['workspace-labels', workspaceId],
      (old: WorkspaceTaskLabel[] | undefined) =>
        upsertLabelSortedByName(old, label)
    );
    queryClient.setQueryData(
      ['workspace_task_labels', workspaceId],
      (old: WorkspaceTaskLabel[] | undefined) => [
        label,
        ...(old ?? []).filter((entry) => entry.id !== label.id),
      ]
    );
  }
}

function normalizeTaskAssignees(assignees: WorkspaceTaskAssignee[]) {
  return assignees
    .map((assignee) => {
      const id = assignee.user_id || assignee.id;
      if (!id) return null;

      return {
        id,
        display_name: assignee.display_name ?? undefined,
        email: assignee.email ?? undefined,
        avatar_url: assignee.avatar_url ?? undefined,
      };
    })
    .filter((assignee): assignee is NonNullable<typeof assignee> =>
      Boolean(assignee)
    );
}

function normalizeTaskProjects(projects: WorkspaceTaskProject[]) {
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    status: project.status ?? 'unknown',
  }));
}

export function useTaskRelationships({
  wsId,
  labelCacheWorkspaceId,
  taskId,
  isCreateMode,
  boardId,
  selectedLabels,
  selectedAssignees,
  selectedProjects,
  newLabelName,
  newLabelColor,
  newProjectName,
  setSelectedLabels,
  setSelectedAssignees,
  setSelectedProjects,
  setAvailableLabels,
  setNewLabelName,
  setNewLabelColor,
  setNewProjectName,
  setShowNewLabelDialog,
  setShowNewProjectDialog,
  fallbackBroadcast,
  onUpdate,
}: UseTaskRelationshipsProps): UseTaskRelationshipsReturn {
  const queryClient = useQueryClient();
  const contextBroadcast = useBoardBroadcast();
  const broadcast =
    contextBroadcast ?? getActiveBroadcast() ?? fallbackBroadcast;
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);

  const toggleLabel = useCallback(
    async (label: WorkspaceTaskLabel) => {
      const exists = selectedLabels.some((entry) => entry.id === label.id);

      try {
        if (isCreateMode) {
          setSelectedLabels((prev) =>
            exists
              ? prev.filter((entry) => entry.id !== label.id)
              : [label, ...prev]
          );
          return;
        }

        if (!taskId) return;

        const nextSelectedLabels = exists
          ? selectedLabels.filter((entry) => entry.id !== label.id)
          : [label, ...selectedLabels].sort((a, b) =>
              (a?.name || '')
                .toLowerCase()
                .localeCompare((b?.name || '').toLowerCase())
            );

        await updateWorkspaceTask(wsId, taskId, {
          label_ids: nextSelectedLabels.map((entry) => entry.id),
        });

        setSelectedLabels(nextSelectedLabels);
        patchTaskInVisibleCaches({
          queryClient,
          boardId,
          taskId,
          updater: (task) => ({
            ...task,
            labels: nextSelectedLabels,
          }),
        });
        queryClient.invalidateQueries({ queryKey: ['task-history'] });
        broadcast?.('task:relations-changed', { taskId });
        getActiveBoardRefresh()?.({ invalidateTasks: false });
        onUpdate();
      } catch (error: unknown) {
        toast.error('Label update failed', {
          description: getErrorMessage(error, 'Unable to update labels'),
        });
      }
    },
    [
      selectedLabels,
      isCreateMode,
      wsId,
      taskId,
      boardId,
      queryClient,
      setSelectedLabels,
      onUpdate,
      broadcast,
    ]
  );

  const toggleAssignee = useCallback(
    async (member: WorkspaceTaskAssignee) => {
      const userId = member.user_id || member.id;
      const exists = selectedAssignees.some(
        (assignee) => (assignee.id || assignee.user_id) === userId
      );

      try {
        if (isCreateMode) {
          setSelectedAssignees((prev) =>
            exists
              ? prev.filter(
                  (assignee) => (assignee.id || assignee.user_id) !== userId
                )
              : [...prev, member]
          );
          return;
        }

        if (!taskId) return;

        const nextSelectedAssignees = exists
          ? selectedAssignees.filter(
              (assignee) => (assignee.id || assignee.user_id) !== userId
            )
          : [...selectedAssignees, member];

        await updateWorkspaceTask(wsId, taskId, {
          assignee_ids: nextSelectedAssignees
            .map((assignee) => assignee.user_id || assignee.id)
            .filter((assigneeId): assigneeId is string => !!assigneeId),
        });

        setSelectedAssignees(nextSelectedAssignees);
        patchTaskInVisibleCaches({
          queryClient,
          boardId,
          taskId,
          updater: (task) => ({
            ...task,
            assignees: normalizeTaskAssignees(nextSelectedAssignees),
          }),
        });
        queryClient.invalidateQueries({ queryKey: ['task-history'] });
        broadcast?.('task:relations-changed', { taskId });
        getActiveBoardRefresh()?.({ invalidateTasks: false });
        onUpdate();
      } catch (error: unknown) {
        toast.error('Assignee update failed', {
          description: getErrorMessage(error, 'Unable to update assignees'),
        });
      }
    },
    [
      isCreateMode,
      selectedAssignees,
      wsId,
      taskId,
      boardId,
      queryClient,
      onUpdate,
      setSelectedAssignees,
      broadcast,
    ]
  );

  const toggleProject = useCallback(
    async (project: WorkspaceTaskProject) => {
      const exists = selectedProjects.some((entry) => entry.id === project.id);

      try {
        if (isCreateMode) {
          setSelectedProjects((prev) =>
            exists
              ? prev.filter((entry) => entry.id !== project.id)
              : [...prev, project]
          );
          return;
        }

        if (!taskId) return;

        const nextSelectedProjects = exists
          ? selectedProjects.filter((entry) => entry.id !== project.id)
          : [...selectedProjects, project];

        await updateWorkspaceTask(wsId, taskId, {
          project_ids: nextSelectedProjects.map((entry) => entry.id),
        });

        setSelectedProjects(nextSelectedProjects);
        patchTaskInVisibleCaches({
          queryClient,
          boardId,
          taskId,
          updater: (task) => ({
            ...task,
            projects: normalizeTaskProjects(nextSelectedProjects),
          }),
        });
        queryClient.invalidateQueries({ queryKey: ['task-history'] });
        broadcast?.('task:relations-changed', { taskId });
        getActiveBoardRefresh()?.({ invalidateTasks: false });
        onUpdate();
      } catch (error: unknown) {
        toast.error('Project update failed', {
          description: getErrorMessage(error, 'Unable to update projects'),
        });
      }
    },
    [
      selectedProjects,
      isCreateMode,
      wsId,
      taskId,
      queryClient,
      boardId,
      onUpdate,
      setSelectedProjects,
      broadcast,
    ]
  );

  const handleCreateLabel = useCallback(async () => {
    if (!newLabelName.trim()) return;

    setCreatingLabel(true);

    let newLabel: WorkspaceTaskLabel;
    try {
      newLabel = await createWorkspaceLabel(wsId, {
        name: newLabelName.trim(),
        color: newLabelColor,
      });
      upsertWorkspaceLabelCaches({
        queryClient,
        workspaceIds: [wsId, labelCacheWorkspaceId],
        label: newLabel,
      });
    } catch (error: unknown) {
      toast.error('Label creation failed', {
        description: getErrorMessage(error, 'Unable to create label.'),
      });
      setCreatingLabel(false);
      return;
    }

    try {
      setAvailableLabels((prev) => upsertLabelSortedByName(prev, newLabel));

      if (isCreateMode) {
        setSelectedLabels((prev) => [...prev, newLabel]);
        toast.success('Label created', {
          description: 'New label will be attached to the task on save.',
        });
      } else if (taskId) {
        const nextSelectedLabels = [...selectedLabels, newLabel].sort((a, b) =>
          compareLabelsByName(a, b)
        );

        await updateWorkspaceTask(wsId, taskId, {
          label_ids: nextSelectedLabels.map((entry) => entry.id),
        });

        setSelectedLabels(nextSelectedLabels);
        patchTaskInVisibleCaches({
          queryClient,
          boardId,
          taskId,
          updater: (task) => ({
            ...task,
            labels: nextSelectedLabels,
          }),
        });
        broadcast?.('task:relations-changed', { taskId });
        getActiveBoardRefresh()?.({ invalidateTasks: false });
        onUpdate();
        toast.success('Label created & linked', {
          description: 'New label added and attached to this task.',
        });
      } else {
        toast.success('Label created', {
          description: 'New label has been created, but no task is selected.',
        });
      }

      setNewLabelName('');
      setNewLabelColor((previousColor) =>
        getRandomNewLabelColor(previousColor)
      );
      setShowNewLabelDialog(false);
    } catch (error: unknown) {
      toast.error('Label created but not linked', {
        description: getErrorMessage(
          error,
          'The label was created but could not be attached to this task.'
        ),
      });
    } finally {
      setCreatingLabel(false);
    }
  }, [
    newLabelName,
    newLabelColor,
    wsId,
    boardId,
    taskId,
    queryClient,
    onUpdate,
    isCreateMode,
    selectedLabels,
    setSelectedLabels,
    setAvailableLabels,
    setNewLabelName,
    setNewLabelColor,
    setShowNewLabelDialog,
    broadcast,
    labelCacheWorkspaceId,
  ]);

  const handleCreateProject = useCallback(async () => {
    if (!newProjectName.trim()) return;

    setCreatingProject(true);

    try {
      const newProjectResponse = await createWorkspaceProject(wsId, {
        name: newProjectName.trim(),
      });
      const newProject: WorkspaceTaskProject = {
        ...newProjectResponse,
        status: newProjectResponse.status ?? null,
      };

      await queryClient.invalidateQueries({
        queryKey: ['task-projects', wsId],
      });

      if (isCreateMode) {
        setSelectedProjects((prev) => [...prev, newProject]);
        toast.success('Project created', {
          description: 'New project will be attached to the task on save.',
        });
      } else if (taskId) {
        const nextSelectedProjects = [...selectedProjects, newProject];

        await updateWorkspaceTask(wsId, taskId, {
          project_ids: nextSelectedProjects.map((entry) => entry.id),
        });

        setSelectedProjects(nextSelectedProjects);
        patchTaskInVisibleCaches({
          queryClient,
          boardId,
          taskId,
          updater: (task) => ({
            ...task,
            projects: normalizeTaskProjects(nextSelectedProjects),
          }),
        });
        broadcast?.('task:relations-changed', { taskId });
        getActiveBoardRefresh()?.({ invalidateTasks: false });
        onUpdate();
        toast.success('Project created & linked', {
          description: 'New project added and attached to this task.',
        });
      }

      setNewProjectName('');
      setShowNewProjectDialog(false);
    } catch (error: unknown) {
      toast.error('Project creation failed', {
        description: getErrorMessage(
          error,
          'Unable to create or link project.'
        ),
      });
    } finally {
      setCreatingProject(false);
    }
  }, [
    newProjectName,
    wsId,
    boardId,
    taskId,
    queryClient,
    onUpdate,
    isCreateMode,
    selectedProjects,
    setSelectedProjects,
    setNewProjectName,
    setShowNewProjectDialog,
    broadcast,
  ]);

  return {
    toggleLabel,
    toggleAssignee,
    toggleProject,
    handleCreateLabel,
    handleCreateProject,
    creatingLabel,
    creatingProject,
  };
}
