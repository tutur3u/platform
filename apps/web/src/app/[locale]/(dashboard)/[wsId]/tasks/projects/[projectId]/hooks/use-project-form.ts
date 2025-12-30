'use client';

import type { TaskProjectWithRelations } from '@tuturuuu/types';
import { toast } from '@tuturuuu/ui/sonner';
import { useMutation } from '@tanstack/react-query';
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

  // Editing UI state
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [showLeadSelector, setShowLeadSelector] = useState(false);
  const [showTimelineEditor, setShowTimelineEditor] = useState(false);
  const [showConfiguration, setShowConfiguration] = useState(false);

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
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-projects/${project.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.error || `Failed to update project (${response.status})`;
        throw new Error(errorMessage);
      }

      return response.json();
    },
    onSuccess: () => {
      toast.success('Project updated successfully');
      setIsEditingName(false);
      setIsEditingDescription(false);
      setShowTimelineEditor(false);
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
    updateProjectMutation.mutate({
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
