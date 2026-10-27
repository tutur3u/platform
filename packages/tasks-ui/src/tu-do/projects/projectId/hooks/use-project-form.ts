'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateWorkspaceTaskProject } from '@tuturuuu/internal-api/tasks';
import type { TaskProjectWithRelations } from '@tuturuuu/types';
import { toast } from '@tuturuuu/ui/sonner';
import { PROJECT_TICKET_KEY_PATTERN } from '@tuturuuu/utils/task-project-ticket-key';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { HealthStatus, TaskPriority } from '../types';

interface UseProjectFormOptions {
  wsId: string;
  project: TaskProjectWithRelations;
}

function formatDateToInput(dateString: string | null | undefined): string {
  if (!dateString) return '';
  const date = dayjs(dateString);
  if (!date.isValid()) return '';
  return date.format('YYYY-MM-DD');
}

function formatInputToISO(dateString: string): string | null {
  if (!dateString) return null;

  // Use dayjs to parse and validate the date string
  const date = dayjs(dateString, 'YYYY-MM-DD', true); // strict parsing

  if (!date.isValid()) {
    console.error(
      `Invalid date format: expected YYYY-MM-DD, got "${dateString}"`
    );
    return null;
  }

  return date.toISOString();
}

interface UpdateProjectData {
  ticket_key: string;
  name: string;
  description: string | null;
  priority: string | null;
  health_status: HealthStatus | null;
  status: string | null;
  lead_id: string | null;
  start_date: string | null;
  end_date: string | null;
  archived: boolean;
}

export function useProjectForm({ wsId, project }: UseProjectFormOptions) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Editing UI state
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [showLeadSelector, setShowLeadSelector] = useState(false);
  const [showTimelineEditor, setShowTimelineEditor] = useState(false);
  const [showConfiguration, setShowConfiguration] = useState(false);

  const [editedTicketKey, setEditedTicketKey] = useState(project.ticket_key);

  // Form values
  const [editedName, setEditedName] = useState(project.name);
  const [editedDescription, setEditedDescription] = useState(
    project.description || ''
  );
  const [editedPriority, setEditedPriority] = useState(project.priority);
  const [editedHealthStatus, setEditedHealthStatus] =
    useState<HealthStatus | null>(project.health_status as HealthStatus | null);
  const [editedStatus, setEditedStatus] = useState(project.status);
  const [editedLeadId, setEditedLeadId] = useState(project.lead_id);
  const [editedStartDate, setEditedStartDate] = useState(
    formatDateToInput(project.start_date)
  );
  const [editedEndDate, setEditedEndDate] = useState(
    formatDateToInput(project.end_date)
  );
  const [editedArchived, setEditedArchived] = useState(
    project.archived ?? false
  );

  // Helper function to reset form fields from project data
  const resetFormFromProject = useCallback(() => {
    setEditedTicketKey(project.ticket_key);
    setEditedName(project.name);
    setEditedDescription(project.description || '');
    setEditedPriority(project.priority);
    setEditedHealthStatus(project.health_status as HealthStatus | null);
    setEditedStatus(project.status);
    setEditedLeadId(project.lead_id);
    setEditedStartDate(formatDateToInput(project.start_date));
    setEditedEndDate(formatDateToInput(project.end_date));
    setEditedArchived(project.archived ?? false);
  }, [project]);

  // Sync form state when project prop changes
  useEffect(() => {
    resetFormFromProject();
  }, [resetFormFromProject]);

  const hasUnsavedChanges =
    editedTicketKey !== project.ticket_key ||
    editedName !== project.name ||
    editedDescription !== (project.description || '') ||
    editedPriority !== project.priority ||
    editedHealthStatus !== project.health_status ||
    editedStatus !== project.status ||
    editedLeadId !== project.lead_id ||
    editedStartDate !== formatDateToInput(project.start_date) ||
    editedEndDate !== formatDateToInput(project.end_date) ||
    editedArchived !== (project.archived ?? false);

  // React Query mutation for updating project
  const updateProjectMutation = useMutation({
    mutationFn: async (data: UpdateProjectData) => {
      return updateWorkspaceTaskProject(wsId, project.id, data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['task'] });
      void queryClient.invalidateQueries({ queryKey: ['task-snapshot'] });
      void queryClient.invalidateQueries({ queryKey: ['tasks-full'] });
      void queryClient.invalidateQueries({ queryKey: ['task-projects', wsId] });
      toast.success('Project updated successfully');
      setIsEditingName(false);
      setIsEditingDescription(false);
      setShowTimelineEditor(false);
      void queryClient.invalidateQueries({
        queryKey: ['task-project', wsId, project.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ['task-project-tasks', wsId, project.id],
      });
      router.refresh();
    },
    onError: (error) => {
      console.error('Error updating project:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to update project'
      );
    },
  });

  const saveProject = useCallback(() => {
    if (!PROJECT_TICKET_KEY_PATTERN.test(editedTicketKey)) return;
    updateProjectMutation.mutate({
      ticket_key: editedTicketKey,
      name: editedName,
      description: editedDescription || null,
      priority: editedPriority || null,
      health_status: editedHealthStatus || null,
      status: editedStatus,
      lead_id: editedLeadId || null,
      start_date: formatInputToISO(editedStartDate),
      end_date: formatInputToISO(editedEndDate),
      archived: editedArchived,
    });
  }, [
    updateProjectMutation,
    editedTicketKey,
    editedName,
    editedDescription,
    editedPriority,
    editedHealthStatus,
    editedStatus,
    editedLeadId,
    editedStartDate,
    editedEndDate,
    editedArchived,
  ]);

  const cancelEdits = useCallback(() => {
    resetFormFromProject();
    setIsEditingName(false);
    setIsEditingDescription(false);
    setShowLeadSelector(false);
    setShowTimelineEditor(false);
  }, [resetFormFromProject]);

  return {
    // UI state
    isEditingName,
    setIsEditingName,
    isEditingDescription,
    setIsEditingDescription,
    isSaving: updateProjectMutation.isPending,
    showLeadSelector,
    setShowLeadSelector,
    showTimelineEditor,
    setShowTimelineEditor,
    showConfiguration,
    setShowConfiguration,

    // Form values
    editedTicketKey,
    setEditedTicketKey,
    editedName,
    setEditedName,
    editedDescription,
    setEditedDescription,
    editedPriority,
    setEditedPriority: setEditedPriority as (
      value: TaskPriority | null
    ) => void,
    editedHealthStatus,
    setEditedHealthStatus,
    editedStatus,
    setEditedStatus,
    editedLeadId,
    setEditedLeadId,
    editedStartDate,
    setEditedStartDate,
    editedEndDate,
    setEditedEndDate,
    editedArchived,
    setEditedArchived,

    // Computed
    hasUnsavedChanges,

    // Actions
    saveProject,
    cancelEdits,
  };
}
