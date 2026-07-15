import type { JSONContent } from '@tiptap/react';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { CalendarHoursType, Task } from '@tuturuuu/types/primitives/Task';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DRAFT_SAVE_DEBOUNCE_MS } from '../constants';
import type { TaskFormState, WorkspaceTaskLabel } from '../types';
import {
  clearDraft,
  getDescriptionContent,
  getDraftStorageKey,
  hasDraftContent,
  loadDraft,
  saveDraft,
} from '../utils';

interface UseTaskFormStateProps {
  task?: Task;
  boardId: string;
  isOpen: boolean;
  isCreateMode: boolean;
  isSaving: boolean;
}

export function useTaskFormState({
  task,
  boardId,
  isOpen,
  isCreateMode,
  isSaving,
}: UseTaskFormStateProps) {
  // Core form state
  const [name, setName] = useState(task?.name || '');
  const [description, setDescription] = useState<JSONContent | null>(() =>
    task?.description ? getDescriptionContent(task.description) : null
  );
  const [priority, setPriority] = useState<TaskPriority | null>(
    task?.priority || null
  );
  const [startDate, setStartDate] = useState<Date | undefined>(
    task?.start_date ? new Date(task.start_date) : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    task?.end_date ? new Date(task.end_date) : undefined
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

  // Scheduling fields
  const [totalDuration, setTotalDuration] = useState<number | null>(
    (task as any)?.total_duration ?? null
  );
  const [isSplittable, setIsSplittable] = useState<boolean>(
    (task as any)?.is_splittable ?? false
  );
  const [minSplitDurationMinutes, setMinSplitDurationMinutes] = useState<
    number | null
  >((task as any)?.min_split_duration_minutes ?? null);
  const [maxSplitDurationMinutes, setMaxSplitDurationMinutes] = useState<
    number | null
  >((task as any)?.max_split_duration_minutes ?? null);
  const [calendarHours, setCalendarHours] = useState<CalendarHoursType | null>(
    (task as any)?.calendar_hours ?? null
  );
  const [autoSchedule, setAutoSchedule] = useState<boolean>(
    (task as any)?.auto_schedule ?? false
  );

  // Draft state
  const [hasDraft, setHasDraft] = useState(false);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftStorageKey = getDraftStorageKey(boardId);

  // Get current form state
  const getFormState = useCallback(
    (): TaskFormState => ({
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
      totalDuration,
      isSplittable,
      minSplitDurationMinutes,
      maxSplitDurationMinutes,
      calendarHours,
      autoSchedule,
    }),
    [
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
      totalDuration,
      isSplittable,
      minSplitDurationMinutes,
      maxSplitDurationMinutes,
      calendarHours,
      autoSchedule,
    ]
  );

  // Reset form state
  const resetFormState = useCallback((newTask?: Task) => {
    const legacyScheduling = newTask as any;
    setName(newTask?.name || '');
    setDescription(getDescriptionContent(newTask?.description) || null);
    setPriority(newTask?.priority || null);
    setStartDate(
      newTask?.start_date ? new Date(newTask.start_date) : undefined
    );
    setEndDate(newTask?.end_date ? new Date(newTask.end_date) : undefined);
    setSelectedListId(newTask?.list_id || '');
    setEstimationPoints(newTask?.estimation_points ?? null);
    setSelectedLabels(newTask?.labels || []);
    setSelectedAssignees(newTask?.assignees || []);
    setSelectedProjects(newTask?.projects || []);
    // Reset scheduling fields
    setTotalDuration(legacyScheduling?.total_duration ?? null);
    setIsSplittable(legacyScheduling?.is_splittable ?? false);
    setMinSplitDurationMinutes(
      legacyScheduling?.min_split_duration_minutes ?? null
    );
    setMaxSplitDurationMinutes(
      legacyScheduling?.max_split_duration_minutes ?? null
    );
    setCalendarHours(legacyScheduling?.calendar_hours ?? null);
    setAutoSchedule(legacyScheduling?.auto_schedule ?? false);
  }, []);

  // Load draft when opening in create mode
  useEffect(() => {
    if (!isOpen || !isCreateMode) return;

    const draft = loadDraft(draftStorageKey);
    if (!draft || !hasDraftContent(draft)) {
      clearDraft(draftStorageKey);
      return;
    }

    if (typeof draft.name === 'string') setName(draft.name);
    if (draft.description != null) {
      try {
        const maybeString = draft.description as any;
        const parsed =
          typeof maybeString === 'string'
            ? JSON.parse(maybeString)
            : maybeString;
        setDescription(parsed);
      } catch {
        setDescription(null);
      }
    }
    if (draft.priority === null || typeof draft.priority === 'string') {
      setPriority(draft.priority as TaskPriority | null);
    }
    if (draft.startDate) setStartDate(new Date(draft.startDate));
    if (draft.endDate) setEndDate(new Date(draft.endDate));
    if (typeof draft.selectedListId === 'string')
      setSelectedListId(draft.selectedListId);
    if (
      draft.estimationPoints === null ||
      typeof draft.estimationPoints === 'number'
    ) {
      setEstimationPoints(draft.estimationPoints as number | null);
    }
    if (Array.isArray(draft.selectedLabels))
      setSelectedLabels(draft.selectedLabels);
    setHasDraft(true);
  }, [isOpen, isCreateMode, draftStorageKey]);

  // Debounced save draft while editing in create mode
  useEffect(() => {
    if (!isOpen || !isCreateMode || isSaving) return;

    const hasAny =
      (name || '').trim().length > 0 ||
      !!description ||
      !!priority ||
      !!startDate ||
      !!endDate ||
      !!estimationPoints ||
      (selectedLabels && selectedLabels.length > 0);

    if (!hasAny) {
      clearDraft(draftStorageKey);
      setHasDraft(false);
      return;
    }

    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);

    draftSaveTimerRef.current = setTimeout(() => {
      const toSave = {
        name: (name || '').trim(),
        description,
        priority,
        startDate: startDate?.toISOString() || null,
        endDate: endDate?.toISOString() || null,
        selectedListId,
        estimationPoints: estimationPoints ?? null,
        selectedLabels,
      };
      saveDraft(draftStorageKey, toSave);
      setHasDraft(true);
    }, DRAFT_SAVE_DEBOUNCE_MS);

    return () => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    };
  }, [
    isOpen,
    isCreateMode,
    isSaving,
    draftStorageKey,
    name,
    description,
    priority,
    startDate,
    endDate,
    selectedListId,
    estimationPoints,
    selectedLabels,
  ]);

  // Clear draft when opening in edit mode
  useEffect(() => {
    if (isOpen && !isCreateMode) {
      clearDraft(draftStorageKey);
    }
  }, [isOpen, isCreateMode, draftStorageKey]);

  const clearDraftState = useCallback(() => {
    clearDraft(draftStorageKey);
    setHasDraft(false);
    resetFormState();
  }, [draftStorageKey, resetFormState]);

  return {
    // State
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
    hasDraft,
    // Scheduling state
    totalDuration,
    isSplittable,
    minSplitDurationMinutes,
    maxSplitDurationMinutes,
    calendarHours,
    autoSchedule,

    // Setters
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
    // Scheduling setters
    setTotalDuration,
    setIsSplittable,
    setMinSplitDurationMinutes,
    setMaxSplitDurationMinutes,
    setCalendarHours,
    setAutoSchedule,

    // Helpers
    getFormState,
    resetFormState,
    clearDraftState,
  };
}
