'use client';

import type { UseMutationResult } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  Plus,
  Trash2,
} from '@tuturuuu/icons';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useCalendarPreferences } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { TaskEstimationMenu } from '@tuturuuu/ui/tu-do/boards/boardId/menus/task-estimation-menu';
import { TaskLabelsMenu } from '@tuturuuu/ui/tu-do/boards/boardId/menus/task-labels-menu';
import { TaskPriorityMenu } from '@tuturuuu/ui/tu-do/boards/boardId/menus/task-priority-menu';
import { TaskProjectsMenu } from '@tuturuuu/ui/tu-do/boards/boardId/menus/task-projects-menu';
import { TaskEstimationDisplay } from '@tuturuuu/ui/tu-do/shared/task-estimation-display';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

dayjs.extend(utc);
dayjs.extend(timezone);

const MAX_LABEL_SUGGESTIONS = 6;
const MAX_VISIBLE_PREVIEW_LABELS = 3;
const MAX_VISIBLE_WORKSPACE_LABELS = 12;

const normalizeLabel = (value: string) => value.trim().toLowerCase();

const formatLabel = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(' ');

const adjustDateToEndOfDay = (value: Date) => {
  const next = new Date(value);
  if (
    next.getHours() === 0 &&
    next.getMinutes() === 0 &&
    next.getSeconds() === 0 &&
    next.getMilliseconds() === 0
  ) {
    next.setHours(23, 59, 59, 999);
  }
  return next;
};

const parseDueDateToState = (value: string | null | undefined) => {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return adjustDateToEndOfDay(parsed);
};

const formatDueDateForPayload = (value: Date | undefined) =>
  value ? adjustDateToEndOfDay(value).toISOString() : null;

const priorityBadgeClass = (priority: TaskPriority | null) => {
  switch (priority) {
    case 'critical':
      return 'border-dynamic-red/60 bg-dynamic-red/15 text-dynamic-red';
    case 'high':
      return 'border-dynamic-orange/60 bg-dynamic-orange/15 text-dynamic-orange';
    case 'normal':
      return 'border-dynamic-yellow/60 bg-dynamic-yellow/15 text-dynamic-yellow';
    case 'low':
      return 'border-dynamic-blue/60 bg-dynamic-blue/15 text-dynamic-blue';
    default:
      return 'border-dynamic-muted/60 bg-dynamic-muted/15 text-muted-foreground';
  }
};

const getPriorityCopy = (priority: TaskPriority | null) => {
  switch (priority) {
    case 'critical':
      return 'Urgent';
    case 'high':
      return 'High';
    case 'normal':
      return 'Medium';
    case 'low':
      return 'Low';
    default:
      return 'No Priority';
  }
};

const LABEL_COLOR_CLASSES: Record<string, string> = {
  gray: 'border-dynamic-gray/60 bg-dynamic-gray/15 text-dynamic-gray',
  red: 'border-dynamic-red/60 bg-dynamic-red/15 text-dynamic-red',
  orange: 'border-dynamic-orange/60 bg-dynamic-orange/15 text-dynamic-orange',
  yellow: 'border-dynamic-yellow/60 bg-dynamic-yellow/15 text-dynamic-yellow',
  green: 'border-dynamic-green/60 bg-dynamic-green/15 text-dynamic-green',
  blue: 'border-dynamic-blue/60 bg-dynamic-blue/15 text-dynamic-blue',
  purple: 'border-dynamic-purple/60 bg-dynamic-purple/15 text-dynamic-purple',
  pink: 'border-dynamic-pink/60 bg-dynamic-pink/15 text-dynamic-pink',
};

export interface JournalTaskResponse {
  tasks?: Array<{
    id: string;
    name: string;
    description: string | null;
    priority: TaskPriority | null;
    labelSuggestions?: string[];
    dueDate?: string | null;
    labels?: ProvidedTaskLabelPayload[];
    estimationPoints?: number | null;
    projectIds?: string[];
  }>;
  metadata?: {
    generatedWithAI?: boolean;
    totalTasks?: number;
  };
}

interface ProvidedTaskLabelPayload {
  id?: string;
  name: string;
}

interface TaskLabelOption {
  id: string | null;
  name: string;
  displayName: string;
  isNew: boolean;
  selected: boolean;
}

interface TaskLabelSelection {
  suggestions: TaskLabelOption[];
}

export interface WorkspaceLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

interface WorkspaceProject {
  id: string;
  name: string;
}

interface BoardConfig {
  estimation_type: string | null;
  extended_estimation: boolean | null;
  allow_zero_estimates: boolean | null;
}

interface TaskPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previewEntry: string | null;
  pendingTaskTitle: string;
  lastResult: JournalTaskResponse | null;
  selectedListId: string;
  boardsData: any[];
  workspaceLabels: WorkspaceLabel[];
  workspaceProjects: WorkspaceProject[];
  boardConfig: BoardConfig | undefined | null;
  aiGenerateDescriptions: boolean;
  aiGeneratePriority: boolean;
  aiGenerateLabels: boolean;
  clientTimezone: string;
  selectedLabelIds: string[];
  setSelectedLabelIds: React.Dispatch<React.SetStateAction<string[]>>;
  currentPreviewIndex: number;
  setCurrentPreviewIndex: React.Dispatch<React.SetStateAction<number>>;
  createTasksMutation: UseMutationResult<
    any,
    Error,
    {
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
      generatedWithAI: boolean;
      generateDescriptions: boolean;
      generatePriority: boolean;
      generateLabels: boolean;
      clientTimezone: string;
      clientTimestamp: string;
    }
  >;
}

export function TaskPreviewDialog({
  open,
  onOpenChange,
  previewEntry,
  pendingTaskTitle,
  lastResult,
  selectedListId,
  boardsData,
  workspaceLabels,
  workspaceProjects,
  boardConfig,
  aiGenerateDescriptions,
  aiGeneratePriority,
  aiGenerateLabels,
  clientTimezone,
  selectedLabelIds,
  setSelectedLabelIds,
  currentPreviewIndex,
  setCurrentPreviewIndex,
  createTasksMutation,
}: TaskPreviewDialogProps) {
  const t = useTranslations();
  const {
    weekStartsOn,
    timezone: tzPreference,
    timeFormat,
  } = useCalendarPreferences();

  // Label-related state
  const [taskLabelSelections, setTaskLabelSelections] = useState<
    TaskLabelSelection[]
  >([]);
  const [taskDueDates, setTaskDueDates] = useState<(Date | undefined)[]>([]);
  const [expandedLabelCards, setExpandedLabelCards] = useState<
    Record<number, boolean>
  >({});
  const [workspaceLabelsExpanded, setWorkspaceLabelsExpanded] = useState(false);
  const lastInitializedLabelsKey = useRef<string | null>(null);
  const lastInitializedDueDatesKey = useRef<string | null>(null);

  // Inline editing state for preview tasks
  const [previewTaskMenuOpen, setPreviewTaskMenuOpen] = useState<
    Record<number, boolean>
  >({});
  const [previewTaskNames, setPreviewTaskNames] = useState<
    Record<number, string>
  >({});
  const [previewTaskDescriptions, setPreviewTaskDescriptions] = useState<
    Record<number, string | null>
  >({});
  const [previewTaskPriorities, setPreviewTaskPriorities] = useState<
    Record<number, TaskPriority | null>
  >({});
  const [previewTaskProjects, setPreviewTaskProjects] = useState<
    Record<number, string[]>
  >({});
  const [previewTaskEstimations, setPreviewTaskEstimations] = useState<
    Record<number, number | null>
  >({});
  const [removedTaskIndices, setRemovedTaskIndices] = useState<Set<number>>(
    new Set()
  );
  const [editingTaskTitle, setEditingTaskTitle] = useState<number | null>(null);
  const [editingTaskDescription, setEditingTaskDescription] = useState<
    number | null
  >(null);

  const sortedLabels = useMemo(
    () =>
      aiGenerateLabels
        ? [...workspaceLabels].sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
          )
        : [],
    [workspaceLabels, aiGenerateLabels]
  );

  const previewTasks = lastResult?.tasks ?? [];
  const generatedWithAI = Boolean(lastResult?.metadata?.generatedWithAI);
  const isCreating = createTasksMutation.isPending;
  const labelsLoading = false;

  // Compute visible tasks for navigation
  const visiblePreviewTasks = useMemo(() => {
    return previewTasks
      .map((task, originalIndex) => ({ task, originalIndex }))
      .filter(({ originalIndex }) => !removedTaskIndices.has(originalIndex));
  }, [previewTasks, removedTaskIndices]);

  const disableConfirm =
    isCreating || !selectedListId || visiblePreviewTasks.length === 0;

  const currentVisibleTask = useMemo(() => {
    if (
      visiblePreviewTasks.length === 0 ||
      currentPreviewIndex >= visiblePreviewTasks.length
    ) {
      return null;
    }
    return visiblePreviewTasks[currentPreviewIndex];
  }, [visiblePreviewTasks, currentPreviewIndex]);

  const displayedWorkspaceLabels = useMemo(() => {
    if (!aiGenerateLabels) return [];
    return workspaceLabelsExpanded
      ? sortedLabels
      : sortedLabels.slice(0, MAX_VISIBLE_WORKSPACE_LABELS);
  }, [aiGenerateLabels, workspaceLabelsExpanded, sortedLabels]);

  const handleCancelPreview = useCallback(() => {
    if (isCreating) return;
    onOpenChange(false);
    setCurrentPreviewIndex(0);
    setEditingTaskTitle(null);
    setEditingTaskDescription(null);
  }, [isCreating, onOpenChange, setCurrentPreviewIndex]);

  const handleNextTask = useCallback(() => {
    if (isCreating) return;
    if (currentPreviewIndex < visiblePreviewTasks.length - 1) {
      setEditingTaskTitle(null);
      setEditingTaskDescription(null);
      setCurrentPreviewIndex((prev) => prev + 1);
    }
  }, [
    isCreating,
    currentPreviewIndex,
    visiblePreviewTasks.length,
    setCurrentPreviewIndex,
  ]);

  const handlePreviousTask = useCallback(() => {
    if (isCreating) return;
    if (currentPreviewIndex > 0) {
      setEditingTaskTitle(null);
      setEditingTaskDescription(null);
      setCurrentPreviewIndex((prev) => prev - 1);
    }
  }, [isCreating, currentPreviewIndex, setCurrentPreviewIndex]);

  const toggleLabel = useCallback(
    (labelId: string) => {
      if (isCreating) return;
      setSelectedLabelIds((prev) =>
        prev.includes(labelId)
          ? prev.filter((id) => id !== labelId)
          : [...prev, labelId]
      );
    },
    [isCreating, setSelectedLabelIds]
  );

  const toggleWorkspaceLabelsExpansion = useCallback(() => {
    if (isCreating) return;
    setWorkspaceLabelsExpanded((prev) => !prev);
  }, [isCreating]);

  const toggleTaskLabelSuggestion = useCallback(
    (taskIndex: number, optionIndex: number) => {
      if (!aiGenerateLabels || isCreating) return;

      setTaskLabelSelections((prev) => {
        if (!prev[taskIndex]) return prev;

        const next = prev.map((selection, index) => {
          if (index !== taskIndex) return selection;

          return {
            suggestions: selection.suggestions.map((option, currentIndex) => {
              if (currentIndex !== optionIndex) return option;

              return {
                ...option,
                selected: !option.selected,
              };
            }),
          };
        });

        return next;
      });
    },
    [aiGenerateLabels, isCreating]
  );

  const toggleLabelPreviewExpansion = useCallback(
    (index: number) => {
      if (isCreating) return;
      setExpandedLabelCards((prev) => ({
        ...prev,
        [index]: !prev[index],
      }));
    },
    [isCreating]
  );

  const handleDueDateChange = useCallback(
    (index: number, date: Date | undefined) => {
      if (isCreating) return;
      setTaskDueDates((prev) => {
        const next = [...prev];
        next[index] = date;
        return next;
      });
    },
    [isCreating]
  );

  const handlePreviewTaskPriorityChange = useCallback(
    (index: number, priority: TaskPriority | null) => {
      if (isCreating) return;
      setPreviewTaskPriorities((prev) => ({
        ...prev,
        [index]: priority,
      }));
    },
    [isCreating]
  );

  const handlePreviewTaskLabelToggle = useCallback(
    (index: number, labelId: string) => {
      if (isCreating) return;

      const selection = taskLabelSelections[index];
      if (!selection) return;

      const optionIndex = selection.suggestions.findIndex(
        (opt) => opt.id === labelId
      );

      if (optionIndex === -1) {
        setTaskLabelSelections((prev) => {
          const next = [...prev];
          if (!next[index]) return prev;

          const workspaceLabel = workspaceLabels.find((l) => l.id === labelId);
          if (!workspaceLabel) return prev;

          next[index] = {
            suggestions: [
              ...next[index].suggestions,
              {
                id: workspaceLabel.id,
                name: workspaceLabel.name,
                displayName: workspaceLabel.name,
                isNew: false,
                selected: true,
              },
            ],
          };

          return next;
        });
      } else {
        toggleTaskLabelSuggestion(index, optionIndex);
      }
    },
    [
      isCreating,
      taskLabelSelections,
      workspaceLabels,
      toggleTaskLabelSuggestion,
    ]
  );

  const handlePreviewTaskProjectToggle = useCallback(
    (index: number, projectId: string) => {
      if (isCreating) return;
      setPreviewTaskProjects((prev) => {
        const currentProjects = prev[index] || [];
        const hasProject = currentProjects.includes(projectId);

        return {
          ...prev,
          [index]: hasProject
            ? currentProjects.filter((id) => id !== projectId)
            : [...currentProjects, projectId],
        };
      });
    },
    [isCreating]
  );

  const handlePreviewTaskEstimationChange = useCallback(
    (index: number, points: number | null) => {
      if (isCreating) return;
      setPreviewTaskEstimations((prev) => ({
        ...prev,
        [index]: points,
      }));
    },
    [isCreating]
  );

  const handleStartEditTitle = useCallback(
    (index: number) => {
      if (isCreating) return;
      setEditingTaskTitle(index);
    },
    [isCreating]
  );

  const handleStartEditDescription = useCallback(
    (index: number) => {
      if (isCreating) return;
      setEditingTaskDescription(index);
    },
    [isCreating]
  );

  const handleSaveTitle = useCallback((index: number, value: string) => {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      toast.error('Task title cannot be empty');
      return;
    }
    setPreviewTaskNames((prev) => ({
      ...prev,
      [index]: trimmedValue,
    }));
    setEditingTaskTitle(null);
  }, []);

  const handleSaveDescription = useCallback((index: number, value: string) => {
    setPreviewTaskDescriptions((prev) => ({
      ...prev,
      [index]: value.trim() || null,
    }));
    setEditingTaskDescription(null);
  }, []);

  const handleCancelEditTitle = useCallback(() => {
    setEditingTaskTitle(null);
  }, []);

  const handleCancelEditDescription = useCallback(() => {
    setEditingTaskDescription(null);
  }, []);

  const handleRemovePreviewTask = useCallback(
    (index: number) => {
      if (isCreating) return;
      setRemovedTaskIndices((prev) => new Set([...prev, index]));
      setPreviewTaskMenuOpen((prev) => ({
        ...prev,
        [index]: false,
      }));

      const visibleTasks = previewTasks.filter(
        (_, i) => !removedTaskIndices.has(i) && i !== index
      );

      if (visibleTasks.length === 0) {
        handleCancelPreview();
      } else if (currentPreviewIndex >= visibleTasks.length) {
        setCurrentPreviewIndex(visibleTasks.length - 1);
      }
    },
    [
      isCreating,
      previewTasks,
      removedTaskIndices,
      currentPreviewIndex,
      handleCancelPreview,
      setCurrentPreviewIndex,
    ]
  );

  const handleMenuItemSelect = useCallback((e: Event, action: () => void) => {
    e.preventDefault();
    action();
  }, []);

  const handleConfirmTasks = useCallback(() => {
    const createText = (previewEntry ?? pendingTaskTitle).trim();
    if (!createText) {
      toast.error(t('ws-tasks.errors.missing_task_description'));
      return;
    }

    const tasksPayload = previewTasks
      .map((task, index) => {
        if (removedTaskIndices.has(index)) {
          return null;
        }

        const selections = aiGenerateLabels
          ? (taskLabelSelections[index]?.suggestions.filter(
              (option) => option.selected
            ) ?? [])
          : [];

        const taskName = previewTaskNames[index] ?? task.name;
        const taskDescription =
          index in previewTaskDescriptions
            ? previewTaskDescriptions[index]
            : aiGenerateDescriptions
              ? task.description
              : null;
        const taskPriority =
          index in previewTaskPriorities
            ? previewTaskPriorities[index]
            : aiGeneratePriority
              ? task.priority
              : null;
        const taskEstimation =
          index in previewTaskEstimations
            ? previewTaskEstimations[index]
            : null;
        const taskProjects = previewTaskProjects[index] || [];

        return {
          title: taskName,
          description: taskDescription ?? null,
          priority: taskPriority ?? null,
          labels: selections.map((option) => ({
            id: option.id ?? undefined,
            name: option.name,
          })),
          dueDate: formatDueDateForPayload(taskDueDates[index]),
          estimationPoints: taskEstimation,
          projectIds: taskProjects,
        };
      })
      .filter((task) => task !== null);

    if (tasksPayload.length === 0) {
      toast.error('No tasks selected to create');
      return;
    }

    let timestampMoment = dayjs().tz(clientTimezone);
    if (!timestampMoment.isValid()) {
      timestampMoment = dayjs();
    }
    const clientTimestamp = timestampMoment.toISOString();

    createTasksMutation.mutate({
      entry: createText,
      listId: selectedListId,
      generatedWithAI: Boolean(lastResult?.metadata?.generatedWithAI),
      tasks: tasksPayload,
      labelIds: selectedLabelIds,
      generateDescriptions: aiGenerateDescriptions,
      generatePriority: aiGeneratePriority,
      generateLabels: aiGenerateLabels,
      clientTimezone,
      clientTimestamp,
    });
  }, [
    previewEntry,
    pendingTaskTitle,
    t,
    previewTasks,
    removedTaskIndices,
    aiGenerateLabels,
    taskLabelSelections,
    previewTaskNames,
    previewTaskDescriptions,
    aiGenerateDescriptions,
    previewTaskPriorities,
    aiGeneratePriority,
    previewTaskEstimations,
    previewTaskProjects,
    taskDueDates,
    selectedLabelIds,
    lastResult,
    selectedListId,
    clientTimezone,
    createTasksMutation,
  ]);

  // Initialize task label selections when preview opens
  useEffect(() => {
    if (!aiGenerateLabels) {
      return;
    }

    if (!lastResult?.tasks?.length) {
      if (taskLabelSelections.length > 0) {
        setTaskLabelSelections([]);
      }
      if (Object.keys(expandedLabelCards).length > 0) {
        setExpandedLabelCards({});
      }
      lastInitializedLabelsKey.current = null;
      return;
    }

    const previewKey = `${previewEntry ?? pendingTaskTitle}:${previewTasks.length}`;

    if (lastInitializedLabelsKey.current === previewKey) {
      return;
    }

    const normalizedExisting = new Map<string, WorkspaceLabel>();
    sortedLabels.forEach((label) => {
      const normalized = normalizeLabel(label.name);
      if (normalized) {
        normalizedExisting.set(normalized, label);
      }
    });

    const nextSelections: TaskLabelSelection[] = previewTasks.map((task) => {
      const seen = new Set<string>();
      const options: TaskLabelOption[] = [];

      (task.labels ?? []).forEach((label) => {
        const normalized = normalizeLabel(label.name);
        if (!normalized || seen.has(normalized)) {
          return;
        }
        seen.add(normalized);

        const existing = normalizedExisting.get(normalized);
        if (existing) {
          options.push({
            id: existing.id,
            name: existing.name,
            displayName: existing.name,
            isNew: false,
            selected: true,
          });
        } else {
          options.push({
            id: label.id ?? null,
            name: label.name,
            displayName: label.name,
            isNew: !label.id,
            selected: true,
          });
        }
      });

      (task.labelSuggestions ?? []).forEach((suggestion) => {
        const normalized = normalizeLabel(suggestion);
        if (!normalized || seen.has(normalized)) {
          return;
        }
        seen.add(normalized);

        const existing = normalizedExisting.get(normalized);
        if (existing) {
          options.push({
            id: existing.id,
            name: existing.name,
            displayName: existing.name,
            isNew: false,
            selected: true,
          });
        } else {
          const formatted = formatLabel(suggestion);
          options.push({
            id: null,
            name: formatted,
            displayName: formatted,
            isNew: true,
            selected: false,
          });
        }
      });

      return {
        suggestions: options.slice(0, MAX_LABEL_SUGGESTIONS),
      };
    });

    setTaskLabelSelections(nextSelections);
    lastInitializedLabelsKey.current = previewKey;
    setExpandedLabelCards({});
  }, [
    aiGenerateLabels,
    lastResult,
    previewEntry,
    pendingTaskTitle,
    sortedLabels,
    expandedLabelCards,
    taskLabelSelections.length,
    previewTasks,
  ]);

  // Initialize task due dates when preview opens
  useEffect(() => {
    if (!lastResult?.tasks?.length) {
      if (taskDueDates.length) {
        setTaskDueDates([]);
      }
      lastInitializedDueDatesKey.current = null;
      return;
    }

    const previewKey = `${previewEntry ?? pendingTaskTitle}:${previewTasks.length}`;
    if (lastInitializedDueDatesKey.current === previewKey) {
      return;
    }

    setTaskDueDates(
      previewTasks.map((task) => parseDueDateToState(task.dueDate ?? null))
    );
    lastInitializedDueDatesKey.current = previewKey;
  }, [
    lastResult,
    previewEntry,
    pendingTaskTitle,
    taskDueDates.length,
    previewTasks,
  ]);

  // Initialize preview task inline editing state when preview opens
  useEffect(() => {
    if (!lastResult?.tasks?.length) {
      setPreviewTaskMenuOpen({});
      setPreviewTaskNames({});
      setPreviewTaskDescriptions({});
      setPreviewTaskPriorities({});
      setPreviewTaskProjects({});
      setPreviewTaskEstimations({});
      setRemovedTaskIndices(new Set());
      return;
    }

    const initialNames: Record<number, string> = {};
    const initialDescriptions: Record<number, string | null> = {};
    const initialPriorities: Record<number, TaskPriority | null> = {};
    const initialProjects: Record<number, string[]> = {};
    const initialEstimations: Record<number, number | null> = {};

    lastResult?.tasks?.forEach((task, index) => {
      initialNames[index] = task.name;
      initialDescriptions[index] = task.description || null;
      initialPriorities[index] = task.priority || null;
      initialProjects[index] = task.projectIds || [];
      initialEstimations[index] = task.estimationPoints ?? null;
    });

    setPreviewTaskNames(initialNames);
    setPreviewTaskDescriptions(initialDescriptions);
    setPreviewTaskPriorities(initialPriorities);
    setPreviewTaskProjects(initialProjects);
    setPreviewTaskEstimations(initialEstimations);
    setPreviewTaskMenuOpen({});
    setRemovedTaskIndices(new Set());
  }, [lastResult]);

  // Reset labels when aiGenerateLabels is disabled
  useEffect(() => {
    if (!aiGenerateLabels) {
      if (selectedLabelIds.length > 0) {
        setSelectedLabelIds([]);
      }
      if (taskLabelSelections.length > 0) {
        setTaskLabelSelections([]);
      }
      if (Object.keys(expandedLabelCards).length > 0) {
        setExpandedLabelCards({});
      }
      if (workspaceLabelsExpanded) {
        setWorkspaceLabelsExpanded(false);
      }
      lastInitializedLabelsKey.current = null;
    }
  }, [
    aiGenerateLabels,
    expandedLabelCards,
    selectedLabelIds.length,
    taskLabelSelections.length,
    workspaceLabelsExpanded,
    setSelectedLabelIds,
  ]);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          handleCancelPreview();
        }
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Review Generated {previewTasks.length} Task
            {previewTasks.length !== 1 ? 's' : ''}
          </DialogTitle>
          <DialogDescription>
            {selectedListId
              ? (() => {
                  const board = boardsData.find((b: any) =>
                    (b.task_lists as any[])?.some(
                      (l: any) => l.id === selectedListId
                    )
                  );
                  const lists = (board?.task_lists as any[]) || [];
                  const list = lists.find((l: any) => l.id === selectedListId);
                  const listName = list?.name || 'Unknown List';
                  return `Tasks will be created in "${listName}"`;
                })()
              : 'Select a list to continue'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Workspace Labels */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="font-medium text-sm">Workspace Labels</Label>
              <span className="text-muted-foreground text-xs">
                Apply to all tasks
              </span>
            </div>

            {!aiGenerateLabels ? (
              <p className="rounded-lg border border-dynamic-muted/30 bg-dynamic-muted/10 p-3 text-muted-foreground text-xs">
                Label generation is disabled
              </p>
            ) : labelsLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-dynamic-blue/30 bg-dynamic-blue/10 px-3 py-2 text-dynamic-blue text-xs">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading labels...</span>
              </div>
            ) : sortedLabels.length ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {displayedWorkspaceLabels.map((label) => {
                    const selected = selectedLabelIds.includes(label.id);
                    const colorClass =
                      LABEL_COLOR_CLASSES[label.color] ||
                      LABEL_COLOR_CLASSES.gray;

                    return (
                      <button
                        key={label.id}
                        type="button"
                        onClick={() => toggleLabel(label.id)}
                        className={`rounded-full border px-3 py-1 font-medium text-xs transition ${colorClass} ${
                          selected ? 'ring-2 ring-dynamic-blue' : ''
                        }`}
                      >
                        {label.name}
                      </button>
                    );
                  })}
                </div>
                {sortedLabels.length > MAX_VISIBLE_WORKSPACE_LABELS ? (
                  <button
                    type="button"
                    onClick={toggleWorkspaceLabelsExpansion}
                    className="mt-2 font-medium text-dynamic-blue text-xs hover:underline"
                    disabled={isCreating}
                  >
                    {workspaceLabelsExpanded
                      ? 'Show less'
                      : `Show ${sortedLabels.length - MAX_VISIBLE_WORKSPACE_LABELS} more`}
                  </button>
                ) : null}
              </>
            ) : (
              <p className="rounded-lg border border-dynamic-muted/30 bg-dynamic-muted/10 p-3 text-muted-foreground text-xs">
                No workspace labels available
              </p>
            )}
          </div>

          {/* Preview Tasks */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-foreground text-sm">
                {generatedWithAI
                  ? `AI-Generated Tasks (${previewTasks.length})`
                  : `Manual Tasks (${previewTasks.length})`}
              </p>
              <Badge
                variant="outline"
                className="border-dynamic-blue/40 bg-transparent text-foreground text-xs"
              >
                {visiblePreviewTasks.length} task
                {visiblePreviewTasks.length !== 1 ? 's' : ''}
              </Badge>
            </div>

            {/* Single Task Display */}
            {currentVisibleTask ? (
              <div className="space-y-3">
                {(() => {
                  const { task, originalIndex } = currentVisibleTask;
                  const displayIndex = currentPreviewIndex;
                  const selection = taskLabelSelections[originalIndex];
                  const suggestions = aiGenerateLabels
                    ? (selection?.suggestions ?? [])
                    : [];
                  const hasNewSelections = suggestions.some(
                    (option) => option.isNew && option.selected
                  );
                  const dueDateValue = taskDueDates[originalIndex];
                  const menuOpen = previewTaskMenuOpen[originalIndex] || false;

                  const currentName =
                    previewTaskNames[originalIndex] ?? task.name;
                  const currentDescription =
                    originalIndex in previewTaskDescriptions
                      ? previewTaskDescriptions[originalIndex]
                      : task.description;
                  const currentPriority: TaskPriority | null =
                    originalIndex in previewTaskPriorities
                      ? (previewTaskPriorities[originalIndex] ?? null)
                      : (task.priority ?? null);

                  return (
                    <div
                      key={task.id ?? `${task.name}-${originalIndex}`}
                      className="group rounded-md border border-dynamic-surface/30 bg-background/80 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-start gap-2">
                            {/* Editable Title */}
                            {editingTaskTitle === originalIndex ? (
                              <div className="flex-1 space-y-2">
                                <Textarea
                                  value={currentName}
                                  onChange={(e) => {
                                    setPreviewTaskNames((prev) => ({
                                      ...prev,
                                      [originalIndex]: e.target.value,
                                    }));
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault();
                                      handleSaveTitle(
                                        originalIndex,
                                        currentName
                                      );
                                    } else if (e.key === 'Escape') {
                                      handleCancelEditTitle();
                                    }
                                  }}
                                  className="min-h-15 w-full resize-none break-all font-medium text-sm"
                                  autoFocus
                                  disabled={isCreating}
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      handleSaveTitle(
                                        originalIndex,
                                        currentName
                                      )
                                    }
                                    disabled={isCreating}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={handleCancelEditTitle}
                                    disabled={isCreating}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  handleStartEditTitle(originalIndex)
                                }
                                className="wrap-break-word line-clamp-2 flex-1 cursor-text rounded px-2 py-1 text-left font-medium text-foreground text-sm transition hover:bg-muted/50"
                                disabled={isCreating}
                              >
                                {displayIndex + 1}. {currentName}
                              </button>
                            )}

                            {/* Inline Actions Menu */}
                            <DropdownMenu
                              open={menuOpen}
                              onOpenChange={(open) => {
                                setPreviewTaskMenuOpen((prev) => ({
                                  ...prev,
                                  [originalIndex]: open,
                                }));
                              }}
                            >
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  className={cn(
                                    'h-7 w-7 shrink-0 p-0 transition-all duration-200',
                                    'hover:scale-105 hover:bg-muted',
                                    menuOpen
                                      ? 'opacity-100'
                                      : 'opacity-0 group-hover:opacity-100',
                                    menuOpen && 'bg-muted ring-1 ring-border'
                                  )}
                                  disabled={isCreating}
                                >
                                  <MoreHorizontal className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="w-56"
                                sideOffset={5}
                                onClick={(e) => {
                                  e.stopPropagation();
                                }}
                              >
                                {/* Priority Menu */}
                                <TaskPriorityMenu
                                  currentPriority={currentPriority}
                                  isLoading={isCreating}
                                  onPriorityChange={(priority) =>
                                    handlePreviewTaskPriorityChange(
                                      originalIndex,
                                      priority
                                    )
                                  }
                                  onMenuItemSelect={handleMenuItemSelect}
                                  onClose={() =>
                                    setPreviewTaskMenuOpen((prev) => ({
                                      ...prev,
                                      [originalIndex]: false,
                                    }))
                                  }
                                />

                                {/* Estimation Menu */}
                                {boardConfig?.estimation_type && (
                                  <TaskEstimationMenu
                                    currentPoints={
                                      originalIndex in previewTaskEstimations
                                        ? previewTaskEstimations[originalIndex]
                                        : null
                                    }
                                    estimationType={boardConfig.estimation_type}
                                    extendedEstimation={
                                      boardConfig.extended_estimation || false
                                    }
                                    allowZeroEstimates={
                                      boardConfig.allow_zero_estimates ?? true
                                    }
                                    isLoading={isCreating}
                                    onEstimationChange={(points) =>
                                      handlePreviewTaskEstimationChange(
                                        originalIndex,
                                        points
                                      )
                                    }
                                    onMenuItemSelect={handleMenuItemSelect}
                                  />
                                )}

                                {/* Labels Menu */}
                                {aiGenerateLabels && (
                                  <TaskLabelsMenu
                                    taskLabels={suggestions
                                      .filter((opt) => opt.selected)
                                      .map((opt) => ({
                                        id: opt.id || '',
                                        name: opt.name,
                                        color: 'gray' as const,
                                      }))}
                                    availableLabels={workspaceLabels}
                                    isLoading={false}
                                    onToggleLabel={(labelId) => {
                                      handlePreviewTaskLabelToggle(
                                        originalIndex,
                                        labelId
                                      );
                                    }}
                                    onCreateNewLabel={() => {
                                      setPreviewTaskMenuOpen((prev) => ({
                                        ...prev,
                                        [originalIndex]: false,
                                      }));
                                    }}
                                    onMenuItemSelect={handleMenuItemSelect}
                                  />
                                )}

                                {/* Projects Menu */}
                                <TaskProjectsMenu
                                  taskProjects={(
                                    previewTaskProjects[originalIndex] || []
                                  ).map((projectId) => {
                                    const project = workspaceProjects.find(
                                      (p) => p.id === projectId
                                    );
                                    return {
                                      id: projectId,
                                      name: project?.name || 'Unknown Project',
                                      status: null,
                                    };
                                  })}
                                  availableProjects={workspaceProjects.map(
                                    (p) => ({
                                      id: p.id,
                                      name: p.name,
                                      status: null,
                                    })
                                  )}
                                  isLoading={false}
                                  onToggleProject={(projectId) =>
                                    handlePreviewTaskProjectToggle(
                                      originalIndex,
                                      projectId
                                    )
                                  }
                                  onCreateNewProject={() => {
                                    setPreviewTaskMenuOpen((prev) => ({
                                      ...prev,
                                      [originalIndex]: false,
                                    }));
                                  }}
                                  onMenuItemSelect={handleMenuItemSelect}
                                />

                                <DropdownMenuSeparator />

                                {/* Remove Task */}
                                <DropdownMenuItem
                                  onSelect={(e) =>
                                    handleMenuItemSelect(
                                      e as unknown as Event,
                                      () => {
                                        handleRemovePreviewTask(originalIndex);
                                      }
                                    )
                                  }
                                  className="cursor-pointer text-dynamic-red hover:bg-dynamic-red/10 hover:text-dynamic-red/90"
                                  disabled={isCreating}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Remove task
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          <p className="font-medium text-muted-foreground text-xs">
                            Description
                          </p>
                          {aiGenerateDescriptions ? (
                            editingTaskDescription === originalIndex ? (
                              <div className="space-y-2">
                                <Textarea
                                  value={currentDescription || ''}
                                  onChange={(e) => {
                                    setPreviewTaskDescriptions((prev) => ({
                                      ...prev,
                                      [originalIndex]: e.target.value,
                                    }));
                                  }}
                                  onKeyDown={(e) => {
                                    if (
                                      e.key === 'Enter' &&
                                      e.metaKey &&
                                      !e.shiftKey
                                    ) {
                                      e.preventDefault();
                                      handleSaveDescription(
                                        originalIndex,
                                        currentDescription || ''
                                      );
                                    } else if (e.key === 'Escape') {
                                      handleCancelEditDescription();
                                    }
                                  }}
                                  className="min-h-20 w-full resize-none break-all text-sm"
                                  placeholder="Add a description..."
                                  autoFocus
                                  disabled={isCreating}
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      handleSaveDescription(
                                        originalIndex,
                                        currentDescription || ''
                                      )
                                    }
                                    disabled={isCreating}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={handleCancelEditDescription}
                                    disabled={isCreating}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  handleStartEditDescription(originalIndex)
                                }
                                className="wrap-break-word line-clamp-3 w-full cursor-text rounded px-2 py-1 text-left text-foreground text-sm leading-relaxed opacity-90 transition hover:bg-muted/50"
                                disabled={isCreating}
                              >
                                {currentDescription || 'No description'}
                              </button>
                            )
                          ) : (
                            <p className="text-muted-foreground text-sm italic">
                              Description generation disabled
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          {aiGeneratePriority ? (
                            <Badge
                              variant="outline"
                              className={priorityBadgeClass(currentPriority)}
                            >
                              {getPriorityCopy(currentPriority)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs italic">
                              Priority disabled
                            </span>
                          )}
                          {boardConfig?.estimation_type &&
                            originalIndex in previewTaskEstimations &&
                            previewTaskEstimations[originalIndex] !== null && (
                              <TaskEstimationDisplay
                                points={
                                  previewTaskEstimations[originalIndex] ?? 0
                                }
                                size="sm"
                                estimationType={boardConfig.estimation_type}
                                showIcon
                              />
                            )}
                        </div>
                      </div>

                      <div className="mt-3 space-y-1">
                        <p className="text-muted-foreground text-xs uppercase tracking-wide">
                          Due Date
                        </p>
                        <DateTimePicker
                          date={dueDateValue}
                          setDate={(date) =>
                            handleDueDateChange(originalIndex, date)
                          }
                          showTimeSelect
                          disabled={isCreating}
                          preferences={{
                            weekStartsOn,
                            timezone: tzPreference,
                            timeFormat,
                          }}
                        />
                        {!dueDateValue ? (
                          <p className="text-muted-foreground text-xs">
                            No due date set
                          </p>
                        ) : null}
                      </div>

                      {aiGenerateLabels ? (
                        <div className="mt-3 space-y-1">
                          <p className="text-muted-foreground text-xs uppercase tracking-wide">
                            Task Labels
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {suggestions.length ? (
                              suggestions.map((option, optionIndex) => {
                                if (
                                  !expandedLabelCards[originalIndex] &&
                                  optionIndex >= MAX_VISIBLE_PREVIEW_LABELS
                                ) {
                                  return null;
                                }
                                return (
                                  <button
                                    key={`${task.id ?? `${task.name}-${option.name}`}-${optionIndex}`}
                                    type="button"
                                    onClick={() =>
                                      toggleTaskLabelSuggestion(
                                        originalIndex,
                                        optionIndex
                                      )
                                    }
                                    className={cn(
                                      'rounded-full border px-3 py-1 font-medium text-xs transition',
                                      option.selected
                                        ? 'border-dynamic-purple/60 bg-dynamic-purple/15 text-dynamic-purple'
                                        : 'border-dynamic-muted/40 text-muted-foreground'
                                    )}
                                  >
                                    {option.displayName}
                                    {option.isNew ? (
                                      <span className="ml-2 text-[0.625rem] text-dynamic-purple uppercase tracking-wide">
                                        NEW
                                      </span>
                                    ) : null}
                                  </button>
                                );
                              })
                            ) : (
                              <span className="text-muted-foreground text-xs italic">
                                No label suggestions
                              </span>
                            )}
                          </div>
                          {suggestions.length > MAX_VISIBLE_PREVIEW_LABELS ? (
                            <button
                              type="button"
                              onClick={() =>
                                toggleLabelPreviewExpansion(originalIndex)
                              }
                              className="font-medium text-dynamic-blue text-xs hover:underline"
                              disabled={isCreating}
                            >
                              {expandedLabelCards[originalIndex]
                                ? 'Show less'
                                : `Show ${suggestions.length - MAX_VISIBLE_PREVIEW_LABELS} more`}
                            </button>
                          ) : null}
                          {hasNewSelections ? (
                            <p className="text-muted-foreground text-xs">
                              New labels will be created automatically
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <p className="rounded-lg border border-dynamic-muted/30 bg-dynamic-muted/10 p-3 text-center text-muted-foreground text-sm">
                No tasks to preview
              </p>
            )}
          </div>

          {/* Task Counter & Navigation */}
          {visiblePreviewTasks.length > 0 && (
            <div className="flex items-center justify-center gap-4 py-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePreviousTask}
                disabled={isCreating || currentPreviewIndex === 0}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground text-sm">
                  {currentPreviewIndex + 1}
                </span>
                <span className="text-muted-foreground text-sm">/</span>
                <span className="text-muted-foreground text-sm">
                  {visiblePreviewTasks.length}
                </span>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleNextTask}
                disabled={
                  isCreating ||
                  currentPreviewIndex === visiblePreviewTasks.length - 1
                }
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={handleCancelPreview}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirmTasks}
            disabled={disableConfirm}
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-dynamic-blue" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Create {visiblePreviewTasks.length} Task
                {visiblePreviewTasks.length !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
