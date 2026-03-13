import { useQueryClient } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { invalidateTaskCaches } from '@tuturuuu/utils/task-helper';
import { useCallback, useState } from 'react';
import { useBoardBroadcast } from '../../board-broadcast-context';
import type { WorkspaceTaskLabel } from '../types';
import {
  createWorkspaceLabel,
  createWorkspaceProject,
  updateWorkspaceTask,
} from './task-api';

export interface UseTaskRelationshipsProps {
  wsId: string;
  taskId?: string;
  isCreateMode: boolean;
  boardId: string;
  selectedLabels: WorkspaceTaskLabel[];
  selectedAssignees: any[];
  selectedProjects: any[];
  newLabelName: string;
  newLabelColor: string;
  newProjectName: string;
  setSelectedLabels: (
    value:
      | WorkspaceTaskLabel[]
      | ((prev: WorkspaceTaskLabel[]) => WorkspaceTaskLabel[])
  ) => void;
  setSelectedAssignees: (value: any[] | ((prev: any[]) => any[])) => void;
  setSelectedProjects: (value: any[] | ((prev: any[]) => any[])) => void;
  setAvailableLabels: (
    value:
      | WorkspaceTaskLabel[]
      | ((prev: WorkspaceTaskLabel[]) => WorkspaceTaskLabel[])
  ) => void;
  setNewLabelName: (value: string) => void;
  setNewLabelColor: (value: string) => void;
  setNewProjectName: (value: string) => void;
  setShowNewLabelDialog: (value: boolean) => void;
  setShowNewProjectDialog: (value: boolean) => void;
  onUpdate: () => void;
}

export interface UseTaskRelationshipsReturn {
  toggleLabel: (label: WorkspaceTaskLabel) => Promise<void>;
  toggleAssignee: (member: any) => Promise<void>;
  toggleProject: (project: any) => Promise<void>;
  handleCreateLabel: () => Promise<void>;
  handleCreateProject: () => Promise<void>;
  creatingLabel: boolean;
  creatingProject: boolean;
}

export function useTaskRelationships({
  wsId,
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
  onUpdate,
}: UseTaskRelationshipsProps): UseTaskRelationshipsReturn {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const broadcast = useBoardBroadcast();
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
        await invalidateTaskCaches(queryClient, boardId);
        queryClient.invalidateQueries({ queryKey: ['task-history'] });
        broadcast?.('task:relations-changed', { taskId });
        onUpdate();
      } catch (e: any) {
        toast({
          title: 'Label update failed',
          description: e.message || 'Unable to update labels',
          variant: 'destructive',
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
      toast,
      setSelectedLabels,
      onUpdate,
      broadcast,
    ]
  );

  const toggleAssignee = useCallback(
    async (member: any) => {
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
        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.map((task) => {
              if (task.id !== taskId) return task;
              const currentAssignees = task.assignees || [];
              const newAssignees = exists
                ? currentAssignees.filter((assignee) => assignee.id !== userId)
                : [
                    ...currentAssignees,
                    {
                      id: userId,
                      display_name: member.display_name || member.name,
                      email: member.email,
                      avatar_url: member.avatar_url,
                      handle: member.handle,
                    },
                  ];
              return { ...task, assignees: newAssignees };
            });
          }
        );
        queryClient.invalidateQueries({ queryKey: ['task-history'] });
        broadcast?.('task:relations-changed', { taskId });
        onUpdate();
      } catch (e: any) {
        toast({
          title: 'Assignee update failed',
          description: e.message || 'Unable to update assignees',
          variant: 'destructive',
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
      toast,
      setSelectedAssignees,
      broadcast,
    ]
  );

  const toggleProject = useCallback(
    async (project: any) => {
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
        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.map((task) => {
              if (task.id !== taskId) return task;
              const currentProjects = task.projects || [];
              const newProjects = exists
                ? currentProjects.filter((entry) => entry.id !== project.id)
                : [...currentProjects, project];
              return { ...task, projects: newProjects };
            });
          }
        );
        queryClient.invalidateQueries({ queryKey: ['task-history'] });
        broadcast?.('task:relations-changed', { taskId });
        onUpdate();
      } catch (e: any) {
        toast({
          title: 'Project update failed',
          description: e.message || 'Unable to update projects',
          variant: 'destructive',
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
      toast,
      setSelectedProjects,
      broadcast,
    ]
  );

  const handleCreateLabel = useCallback(async () => {
    if (!newLabelName.trim()) return;

    setCreatingLabel(true);

    try {
      const newLabel = await createWorkspaceLabel(wsId, {
        name: newLabelName.trim(),
        color: newLabelColor,
      });

      setAvailableLabels((prev) =>
        [newLabel, ...prev].sort((a, b) =>
          (a?.name || '')
            .toLowerCase()
            .localeCompare((b?.name || '').toLowerCase())
        )
      );

      if (isCreateMode) {
        setSelectedLabels((prev) => [...prev, newLabel]);
        toast({
          title: 'Label created',
          description: 'New label will be attached to the task on save.',
        });
      } else if (taskId) {
        const nextSelectedLabels = [...selectedLabels, newLabel].sort((a, b) =>
          (a?.name || '')
            .toLowerCase()
            .localeCompare((b?.name || '').toLowerCase())
        );

        await updateWorkspaceTask(wsId, taskId, {
          label_ids: nextSelectedLabels.map((entry) => entry.id),
        });

        setSelectedLabels(nextSelectedLabels);
        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.map((task) => {
              if (task.id !== taskId) return task;
              const currentLabels = task.labels || [];
              return {
                ...task,
                labels: [...currentLabels, newLabel].sort((a, b) =>
                  (a?.name || '')
                    .toLowerCase()
                    .localeCompare((b?.name || '').toLowerCase())
                ),
              };
            });
          }
        );
        broadcast?.('task:relations-changed', { taskId });
        onUpdate();
        toast({
          title: 'Label created & linked',
          description: 'New label added and attached to this task.',
        });
      }

      setNewLabelName('');
      setNewLabelColor('gray');
      setShowNewLabelDialog(false);
    } catch (e: any) {
      toast({
        title: 'Label creation failed',
        description: e.message || 'Unable to create or link label.',
        variant: 'destructive',
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
    toast,
    isCreateMode,
    selectedLabels,
    setSelectedLabels,
    setAvailableLabels,
    setNewLabelName,
    setNewLabelColor,
    setShowNewLabelDialog,
    broadcast,
  ]);

  const handleCreateProject = useCallback(async () => {
    if (!newProjectName.trim()) return;

    setCreatingProject(true);

    try {
      const newProject = await createWorkspaceProject(wsId, {
        name: newProjectName.trim(),
      });

      await queryClient.invalidateQueries({
        queryKey: ['task-projects', wsId],
      });

      if (isCreateMode) {
        setSelectedProjects((prev) => [...prev, newProject]);
        toast({
          title: 'Project created',
          description: 'New project will be attached to the task on save.',
        });
      } else if (taskId) {
        const nextSelectedProjects = [...selectedProjects, newProject];

        await updateWorkspaceTask(wsId, taskId, {
          project_ids: nextSelectedProjects.map((entry) => entry.id),
        });

        setSelectedProjects(nextSelectedProjects);
        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.map((task) => {
              if (task.id !== taskId) return task;
              const currentProjects = task.projects || [];
              return {
                ...task,
                projects: [...currentProjects, newProject as any],
              };
            });
          }
        );
        broadcast?.('task:relations-changed', { taskId });
        onUpdate();
        toast({
          title: 'Project created & linked',
          description: 'New project added and attached to this task.',
        });
      }

      setNewProjectName('');
      setShowNewProjectDialog(false);
    } catch (e: any) {
      toast({
        title: 'Project creation failed',
        description: e.message || 'Unable to create or link project.',
        variant: 'destructive',
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
    toast,
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
