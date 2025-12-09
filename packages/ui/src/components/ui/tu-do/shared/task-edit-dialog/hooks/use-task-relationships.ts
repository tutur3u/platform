import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { invalidateTaskCaches } from '@tuturuuu/utils/task-helper';
import { useCallback, useState } from 'react';
import type { WorkspaceTaskLabel } from '../types';

export interface UseTaskRelationshipsProps {
  taskId?: string;
  isCreateMode: boolean;
  boardId: string;
  boardConfig: any;
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

const supabase = createClient();

/**
 * Custom hook for managing task relationships (labels, assignees, projects)
 * Extracted from task-edit-dialog.tsx to improve maintainability
 */
export function useTaskRelationships({
  taskId,
  isCreateMode,
  boardId,
  boardConfig,
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
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);

  const toggleLabel = useCallback(
    async (label: WorkspaceTaskLabel) => {
      const exists = selectedLabels.some((l) => l.id === label.id);
      try {
        if (isCreateMode) {
          setSelectedLabels((prev) =>
            exists ? prev.filter((l) => l.id !== label.id) : [label, ...prev]
          );
          return;
        }
        if (exists) {
          if (!taskId) return;
          const { error } = await supabase
            .from('task_labels')
            .delete()
            .eq('task_id', taskId)
            .eq('label_id', label.id);
          if (error) throw error;
          setSelectedLabels((prev) => prev.filter((l) => l.id !== label.id));
        } else {
          if (!taskId) return;
          const { error } = await supabase
            .from('task_labels')
            .insert({ task_id: taskId, label_id: label.id });
          if (error) throw error;
          setSelectedLabels((prev) =>
            [label, ...prev].sort((a, b) => {
              const aName = a?.name || '';
              const bName = b?.name || '';
              return aName.toLowerCase().localeCompare(bName.toLowerCase());
            })
          );
        }
        await invalidateTaskCaches(queryClient, boardId);
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
      taskId,
      boardId,
      queryClient,
      toast,
      setSelectedLabels,
      onUpdate,
    ]
  );

  const toggleAssignee = useCallback(
    async (member: any) => {
      // selectedAssignees has 'id' property, workspaceMembers has 'user_id' property
      const userId = member.user_id || member.id;
      const exists = selectedAssignees.some(
        (a) => (a.id || a.user_id) === userId
      );
      try {
        if (isCreateMode) {
          setSelectedAssignees((prev) =>
            exists
              ? prev.filter((a) => (a.id || a.user_id) !== userId)
              : [...prev, member]
          );
          return;
        }
        if (exists) {
          if (!taskId) return;
          const { error } = await supabase
            .from('task_assignees')
            .delete()
            .eq('task_id', taskId)
            .eq('user_id', userId);
          if (error) throw error;
          setSelectedAssignees((prev) =>
            prev.filter((a) => (a.id || a.user_id) !== userId)
          );
        } else {
          if (!taskId) return;
          const { error } = await supabase
            .from('task_assignees')
            .insert({ task_id: taskId, user_id: userId });
          if (error) throw error;
          setSelectedAssignees((prev) => [...prev, member]);
        }
        await invalidateTaskCaches(queryClient, boardId);
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
      taskId,
      boardId,
      queryClient,
      onUpdate,
      toast,
      setSelectedAssignees,
    ]
  );

  const toggleProject = useCallback(
    async (project: any) => {
      const exists = selectedProjects.some((p) => p.id === project.id);
      try {
        if (isCreateMode) {
          setSelectedProjects((prev) =>
            exists
              ? prev.filter((p) => p.id !== project.id)
              : [...prev, project]
          );
          return;
        }
        if (exists) {
          if (!taskId) return;
          const { error } = await supabase
            .from('task_project_tasks')
            .delete()
            .eq('task_id', taskId)
            .eq('project_id', project.id);
          if (error) throw error;
          setSelectedProjects((prev) =>
            prev.filter((p) => p.id !== project.id)
          );
        } else {
          if (!taskId) return;
          const { error } = await supabase
            .from('task_project_tasks')
            .insert({ task_id: taskId, project_id: project.id });

          if (error) {
            if (error.code === '23505') {
              toast({
                title: 'Already linked',
                description: 'This project is already linked to the task',
              });
              await invalidateTaskCaches(queryClient, boardId);
              onUpdate();
              return;
            }
            throw error;
          }
          setSelectedProjects((prev) => [...prev, project]);
        }
        await invalidateTaskCaches(queryClient, boardId);
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
      taskId,
      queryClient,
      boardId,
      onUpdate,
      toast,
      setSelectedProjects,
    ]
  );

  const handleCreateLabel = useCallback(async () => {
    if (!newLabelName.trim() || !boardConfig) return;
    setCreatingLabel(true);
    try {
      let wsId: string | undefined = (boardConfig as any)?.ws_id;
      if (!wsId) {
        const { data: board } = await supabase
          .from('workspace_boards')
          .select('ws_id')
          .eq('id', boardId)
          .single();
        wsId = (board as any)?.ws_id;
      }
      if (!wsId) throw new Error('Workspace id not found');

      const { data, error } = await supabase
        .from('workspace_task_labels')
        .insert({
          ws_id: wsId,
          name: newLabelName.trim(),
          color: newLabelColor,
        })
        .select('id,name,color,created_at')
        .single();

      if (error) throw error;

      if (data) {
        const newLabel = data as WorkspaceTaskLabel;
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
          const { error: linkErr } = await supabase
            .from('task_labels')
            .insert({ task_id: taskId, label_id: newLabel.id });

          if (linkErr) {
            if (linkErr.code === '23505') {
              toast({
                title: 'Already linked',
                description: 'This label is already linked to the task.',
              });
              // Ensure it's in the selected list if not already
              setSelectedLabels((prev) =>
                prev.some((l) => l.id === newLabel.id)
                  ? prev
                  : [...prev, newLabel]
              );
            } else {
              throw linkErr;
            }
          } else {
            setSelectedLabels((prev) => [...prev, newLabel]);
            await invalidateTaskCaches(queryClient, boardId);
            onUpdate();
            toast({
              title: 'Label created & linked',
              description: 'New label added and attached to this task.',
            });
          }
        }

        setNewLabelName('');
        setNewLabelColor('gray');
        setShowNewLabelDialog(false);
      }
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
    boardConfig,
    boardId,
    taskId,
    queryClient,
    onUpdate,
    toast,
    isCreateMode,
    setSelectedLabels,
    setAvailableLabels,
    setNewLabelName,
    setNewLabelColor,
    setShowNewLabelDialog,
  ]);

  const handleCreateProject = useCallback(async () => {
    if (!newProjectName.trim() || !boardConfig) return;
    setCreatingProject(true);
    try {
      let wsId: string | undefined = (boardConfig as any)?.ws_id;
      if (!wsId) {
        const { data: board } = await supabase
          .from('workspace_boards')
          .select('ws_id')
          .eq('id', boardId)
          .single();
        wsId = (board as any)?.ws_id;
      }
      if (!wsId) throw new Error('Workspace id not found');

      const { data, error } = await supabase
        .from('task_projects')
        .insert({
          ws_id: wsId,
          name: newProjectName.trim(),
        })
        .select('id,name,status,created_at')
        .single();

      if (error) throw error;

      if (data) {
        const newProject = data as any;

        // Invalidate and refetch task projects query to include the new project
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
          const { error: linkErr } = await supabase
            .from('task_project_tasks')
            .insert({ task_id: taskId, project_id: newProject.id });

          if (linkErr) {
            if (linkErr.code === '23505') {
              toast({
                title: 'Already linked',
                description: 'This project is already linked to the task.',
              });
              setSelectedProjects((prev) =>
                prev.some((p) => p.id === newProject.id)
                  ? prev
                  : [...prev, newProject]
              );
            } else {
              throw linkErr;
            }
          } else {
            setSelectedProjects((prev) => [...prev, newProject]);
            await invalidateTaskCaches(queryClient, boardId);
            onUpdate();
            toast({
              title: 'Project created & linked',
              description: 'New project added and attached to this task.',
            });
          }
        }

        setNewProjectName('');
        setShowNewProjectDialog(false);
      }
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
    boardConfig,
    boardId,
    taskId,
    queryClient,
    onUpdate,
    toast,
    isCreateMode,
    setSelectedProjects,
    setNewProjectName,
    setShowNewProjectDialog,
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
