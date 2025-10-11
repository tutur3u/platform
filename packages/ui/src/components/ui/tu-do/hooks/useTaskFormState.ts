import type { JSONContent } from '@tiptap/react';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { useCallback, useMemo, useState } from 'react';

interface WorkspaceTaskLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

interface TaskFormState {
  name: string;
  description: JSONContent | null;
  priority: TaskPriority | null;
  startDate: Date | undefined;
  endDate: Date | undefined;
  selectedListId: string;
  estimationPoints: number | null | undefined;
  selectedLabels: WorkspaceTaskLabel[];
  selectedAssignees: any[];
  selectedProjects: any[];
}

interface UseTaskFormStateProps {
  task?: Task;
  isOpen: boolean;
  isCreateMode: boolean;
}

/**
 * Consolidated form state management for task editing/creation
 * Handles all form fields, change detection, and validation
 */
export function useTaskFormState({
  task,
  isCreateMode,
}: UseTaskFormStateProps) {
  // Helper function to parse description to JSONContent
  const parseDescription = useCallback((desc?: string): JSONContent | null => {
    if (!desc) return null;
    try {
      return JSON.parse(desc);
    } catch {
      return {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: desc }],
          },
        ],
      };
    }
  }, []);

  // Form state
  const [name, setName] = useState(task?.name || '');
  const [description, setDescription] = useState<JSONContent | null>(() =>
    parseDescription(task?.description)
  );
  const [priority, setPriority] = useState<TaskPriority | null>(
    task?.priority || null
  );
  const [startDate, setStartDate] = useState<Date | undefined>(
    task?.start_date ? new Date(task?.start_date) : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    task?.end_date ? new Date(task?.end_date) : undefined
  );
  const [selectedListId, setSelectedListId] = useState<string>(
    task?.list_id || ''
  );
  const [estimationPoints, setEstimationPoints] = useState<
    number | null | undefined
  >(task?.estimation_points ?? null);
  const [selectedLabels, setSelectedLabels] = useState<WorkspaceTaskLabel[]>(
    task?.labels || []
  );
  const [selectedAssignees, setSelectedAssignees] = useState<any[]>(
    task?.assignees || []
  );
  const [selectedProjects, setSelectedProjects] = useState<any[]>(
    task?.projects || []
  );

  // Build initial snapshot for change detection
  const initialSnapshot = useMemo(() => {
    return {
      name: (task?.name || '').trim(),
      description: JSON.stringify(parseDescription(task?.description) || null),
      priority: task?.priority || null,
      start: task?.start_date
        ? new Date(task?.start_date).toISOString()
        : undefined,
      end: task?.end_date ? new Date(task?.end_date).toISOString() : undefined,
      listId: task?.list_id,
      estimationPoints: task?.estimation_points ?? null,
    } as const;
  }, [task, parseDescription]);

  // Build current snapshot for comparison
  const currentSnapshot = useMemo(() => {
    return {
      name: (name || '').trim(),
      description: JSON.stringify(description || null),
      priority: priority || null,
      start: startDate?.toISOString(),
      end: endDate?.toISOString(),
      listId: selectedListId,
      estimationPoints: estimationPoints ?? null,
    } as const;
  }, [
    name,
    description,
    priority,
    startDate,
    endDate,
    selectedListId,
    estimationPoints,
  ]);

  // Detect unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (isCreateMode) return false; // No concept of "unsaved changes" in create mode
    return (
      initialSnapshot.name !== currentSnapshot.name ||
      initialSnapshot.description !== currentSnapshot.description ||
      initialSnapshot.priority !== currentSnapshot.priority ||
      initialSnapshot.start !== currentSnapshot.start ||
      initialSnapshot.end !== currentSnapshot.end ||
      initialSnapshot.listId !== currentSnapshot.listId ||
      initialSnapshot.estimationPoints !== currentSnapshot.estimationPoints
    );
  }, [initialSnapshot, currentSnapshot, isCreateMode]);

  // Validation
  const canSave = useMemo(() => {
    const hasName = !!(name || '').trim();
    if (isCreateMode) return hasName;
    return hasName && hasUnsavedChanges;
  }, [isCreateMode, name, hasUnsavedChanges]);

  // Reset form to task data
  const resetForm = useCallback(() => {
    if (!task) return;
    setName(task?.name || '');
    setDescription(parseDescription(task?.description));
    setPriority(task?.priority || null);
    setStartDate(task?.start_date ? new Date(task?.start_date) : undefined);
    setEndDate(task?.end_date ? new Date(task?.end_date) : undefined);
    setSelectedListId(task?.list_id || '');
    setEstimationPoints(task?.estimation_points ?? null);
    setSelectedLabels(task?.labels || []);
    setSelectedAssignees(task?.assignees || []);
    setSelectedProjects(task?.projects || []);
  }, [task, parseDescription]);

  // Clear form for new task creation
  const clearForm = useCallback(() => {
    setName('');
    setDescription(null);
    setPriority(null);
    setStartDate(undefined);
    setEndDate(undefined);
    setEstimationPoints(null);
    setSelectedLabels([]);
    setSelectedAssignees([]);
    setSelectedProjects([]);
  }, []);

  const state: TaskFormState = {
    name,
    description,
    priority,
    startDate,
    endDate,
    selectedListId,
    estimationPoints,
    selectedLabels,
    selectedAssignees,
    selectedProjects,
  };

  const setters = {
    setName,
    setDescription,
    setPriority,
    setStartDate,
    setEndDate,
    setSelectedListId,
    setEstimationPoints,
    setSelectedLabels,
    setSelectedAssignees,
    setSelectedProjects,
  };

  return {
    state,
    setters,
    hasUnsavedChanges,
    canSave,
    resetForm,
    clearForm,
  };
}
