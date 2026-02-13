'use client';

import {
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  MoreHorizontal,
  Save,
  Square,
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
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
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

export interface ConfirmedTask {
  title: string;
  description: string | null;
  priority: TaskPriority | null;
  labels: Array<{ id?: string; name: string }>;
  dueDate: string | null;
  estimationPoints?: number | null;
  projectIds?: string[];
}

interface TaskPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previewEntry: string | null;
  pendingTaskTitle: string;
  lastResult: JournalTaskResponse | null;
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
  onConfirmReview: (confirmedTasks: ConfirmedTask[]) => void;
  isCreating?: boolean;
  submitShortcut?: 'enter' | 'cmd_enter';
}

export function TaskPreviewDialog({
  open,
  onOpenChange,
  previewEntry,
  pendingTaskTitle,
  lastResult,
  workspaceLabels,
  workspaceProjects,
  boardConfig,
  aiGenerateDescriptions,
  aiGeneratePriority,
  aiGenerateLabels,
  selectedLabelIds,
  setSelectedLabelIds,
  setCurrentPreviewIndex,
  onConfirmReview,
  isCreating = false,
  submitShortcut = 'enter',
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

  // Inline editing state
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
  const [expandedTaskIndex, setExpandedTaskIndex] = useState<number | null>(
    null
  );

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

  // Visible tasks (not removed)
  const visiblePreviewTasks = useMemo(() => {
    return previewTasks
      .map((task, originalIndex) => ({ task, originalIndex }))
      .filter(({ originalIndex }) => !removedTaskIndices.has(originalIndex));
  }, [previewTasks, removedTaskIndices]);

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
    setExpandedTaskIndex(null);
  }, [isCreating, onOpenChange, setCurrentPreviewIndex]);

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

  const handleRemovePreviewTask = useCallback(
    (index: number) => {
      if (isCreating) return;
      setRemovedTaskIndices((prev) => new Set([...prev, index]));
      setPreviewTaskMenuOpen((prev) => ({
        ...prev,
        [index]: false,
      }));

      if (expandedTaskIndex === index) {
        setExpandedTaskIndex(null);
      }

      const visibleTasks = previewTasks.filter(
        (_, i) => !removedTaskIndices.has(i) && i !== index
      );

      if (visibleTasks.length === 0) {
        handleCancelPreview();
      }
    },
    [
      isCreating,
      previewTasks,
      removedTaskIndices,
      expandedTaskIndex,
      handleCancelPreview,
    ]
  );

  const handleRestorePreviewTask = useCallback(
    (index: number) => {
      if (isCreating) return;
      setRemovedTaskIndices((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    },
    [isCreating]
  );

  const handleMenuItemSelect = useCallback((e: Event, action: () => void) => {
    e.preventDefault();
    action();
  }, []);

  // Build and submit confirmed tasks
  const handleConfirmTasks = useCallback(() => {
    const tasksPayload: ConfirmedTask[] = previewTasks
      .map((task, index): ConfirmedTask | null => {
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
      .filter((task): task is ConfirmedTask => task !== null);

    if (tasksPayload.length === 0) {
      toast.error('No tasks selected to create');
      return;
    }

    onConfirmReview(tasksPayload);
  }, [
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
    onConfirmReview,
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
      setExpandedTaskIndex(null);
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
    setExpandedTaskIndex(null);
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

  const contentRef = useRef<HTMLDivElement>(null);

  // Allow Enter / Cmd+Enter to submit when not editing inline
  const handleDialogKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const isModifier = e.metaKey || e.ctrlKey;

      // When submitShortcut is 'cmd_enter', only modifier+Enter submits
      if (submitShortcut === 'cmd_enter' && !isModifier) return;

      // Plain Enter: skip if inside textareas, inputs, or dropdown menus
      if (!isModifier) {
        const target = e.target as HTMLElement;
        if (
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'INPUT' ||
          target.closest('[role="menu"]') ||
          target.closest('[role="listbox"]')
        ) {
          return;
        }
      }
      if (
        !isCreating &&
        visiblePreviewTasks.length > 0 &&
        editingTaskTitle === null &&
        editingTaskDescription === null
      ) {
        e.preventDefault();
        handleConfirmTasks();
      }
    },
    [
      isCreating,
      visiblePreviewTasks.length,
      editingTaskTitle,
      editingTaskDescription,
      handleConfirmTasks,
      submitShortcut,
    ]
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          handleCancelPreview();
        }
      }}
    >
      <DialogContent
        ref={contentRef}
        className="max-h-[85vh] overflow-hidden sm:max-w-2xl"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          contentRef.current?.focus();
        }}
        onKeyDown={handleDialogKeyDown}
        tabIndex={-1}
      >
        <DialogHeader>
          <DialogTitle>
            {t('ws-tasks.review_tasks', {
              fallback: `Review Generated ${previewTasks.length} Task${previewTasks.length !== 1 ? 's' : ''}`,
            })}
          </DialogTitle>
          <DialogDescription>
            {t('ws-tasks.select_tasks_to_keep', {
              fallback:
                'Select the tasks you want to keep, then choose a destination.',
            })}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh] pr-4">
          <div className="space-y-4 py-2">
            {/* Workspace Labels */}
            {aiGenerateLabels && sortedLabels.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="font-medium text-sm">
                    Workspace Labels
                  </Label>
                  <span className="text-muted-foreground text-xs">
                    Apply to all tasks
                  </span>
                </div>

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
              </div>
            )}

            {/* Task List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-foreground text-sm">
                  {generatedWithAI
                    ? `AI-Generated Tasks (${previewTasks.length})`
                    : `Tasks (${previewTasks.length})`}
                </p>
                <Badge
                  variant="outline"
                  className="border-dynamic-blue/40 bg-transparent text-foreground text-xs"
                >
                  {visiblePreviewTasks.length} of {previewTasks.length} selected
                </Badge>
              </div>

              <div className="space-y-2">
                {previewTasks.map((task, originalIndex) => {
                  const isRemoved = removedTaskIndices.has(originalIndex);
                  const isExpanded = expandedTaskIndex === originalIndex;
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

                  // Removed task — compact row with restore button
                  if (isRemoved) {
                    return (
                      <div
                        key={task.id ?? `${task.name}-${originalIndex}`}
                        className="flex items-center gap-3 rounded-lg border border-muted-foreground/20 border-dashed bg-muted/30 px-3 py-2 opacity-60"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            handleRestorePreviewTask(originalIndex)
                          }
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-muted-foreground/30"
                          disabled={isCreating}
                        >
                          <Square className="h-3 w-3 text-muted-foreground/40" />
                        </button>
                        <span className="flex-1 truncate text-muted-foreground text-sm line-through">
                          {currentName}
                        </span>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() =>
                            handleRestorePreviewTask(originalIndex)
                          }
                          className="h-6 px-2 text-xs"
                          disabled={isCreating}
                        >
                          Restore
                        </Button>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={task.id ?? `${task.name}-${originalIndex}`}
                      className="group rounded-lg border bg-background/80 transition-colors hover:border-border"
                    >
                      {/* Compact row */}
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        {/* Checkbox (keep/discard) */}
                        <button
                          type="button"
                          onClick={() => handleRemovePreviewTask(originalIndex)}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-dynamic-green/60 bg-dynamic-green/15"
                          disabled={isCreating}
                          title="Click to discard"
                        >
                          <Check className="h-3 w-3 text-dynamic-green" />
                        </button>

                        {/* Title (click to expand) */}
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedTaskIndex(
                              isExpanded ? null : originalIndex
                            )
                          }
                          className="flex flex-1 items-center gap-2 text-left"
                          disabled={isCreating}
                        >
                          <span className="flex-1 truncate font-medium text-sm">
                            {currentName}
                          </span>
                        </button>

                        {/* Priority badge */}
                        {aiGeneratePriority && currentPriority && (
                          <Badge
                            variant="outline"
                            className={cn(
                              'shrink-0 text-[10px]',
                              priorityBadgeClass(currentPriority)
                            )}
                          >
                            {getPriorityCopy(currentPriority)}
                          </Badge>
                        )}

                        {/* Estimation */}
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

                        {/* Due date chip */}
                        {dueDateValue && (
                          <span className="shrink-0 text-muted-foreground text-xs">
                            {dueDateValue.toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        )}

                        {/* Expand/collapse */}
                        <Button
                          variant="ghost"
                          size="xs"
                          className="h-6 w-6 shrink-0 p-0"
                          onClick={() =>
                            setExpandedTaskIndex(
                              isExpanded ? null : originalIndex
                            )
                          }
                          disabled={isCreating}
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="border-t px-3 py-3">
                          <div className="space-y-3">
                            {/* Title editing */}
                            <div className="space-y-1">
                              <p className="font-medium text-muted-foreground text-xs">
                                Title
                              </p>
                              {editingTaskTitle === originalIndex ? (
                                <div className="space-y-2">
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
                                        setEditingTaskTitle(null);
                                      }
                                    }}
                                    className="min-h-10 w-full resize-none text-sm"
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
                                      onClick={() => setEditingTaskTitle(null)}
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
                                    setEditingTaskTitle(originalIndex)
                                  }
                                  className="w-full cursor-text rounded px-2 py-1 text-left font-medium text-sm transition hover:bg-muted/50"
                                  disabled={isCreating}
                                >
                                  {currentName}
                                </button>
                              )}
                            </div>

                            {/* Description */}
                            <div className="space-y-1">
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
                                          setEditingTaskDescription(null);
                                        }
                                      }}
                                      className="min-h-20 w-full resize-none text-sm"
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
                                        onClick={() =>
                                          setEditingTaskDescription(null)
                                        }
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
                                      setEditingTaskDescription(originalIndex)
                                    }
                                    className="line-clamp-3 w-full cursor-text rounded px-2 py-1 text-left text-sm leading-relaxed opacity-90 transition hover:bg-muted/50"
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

                            {/* Inline actions row */}
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Priority / Estimation / Labels / Projects menu */}
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
                                    variant="outline"
                                    size="xs"
                                    className="h-7 gap-1.5 px-2 text-xs"
                                    disabled={isCreating}
                                  >
                                    <MoreHorizontal className="h-3 w-3" />
                                    Options
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="start"
                                  className="w-56"
                                  sideOffset={5}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                  }}
                                >
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

                                  {boardConfig?.estimation_type && (
                                    <TaskEstimationMenu
                                      currentPoints={
                                        originalIndex in previewTaskEstimations
                                          ? previewTaskEstimations[
                                              originalIndex
                                            ]
                                          : null
                                      }
                                      estimationType={
                                        boardConfig.estimation_type
                                      }
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

                                  <TaskProjectsMenu
                                    taskProjects={(
                                      previewTaskProjects[originalIndex] || []
                                    ).map((projectId) => {
                                      const project = workspaceProjects.find(
                                        (p) => p.id === projectId
                                      );
                                      return {
                                        id: projectId,
                                        name:
                                          project?.name || 'Unknown Project',
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

                                  <DropdownMenuItem
                                    onSelect={(e) =>
                                      handleMenuItemSelect(
                                        e as unknown as Event,
                                        () => {
                                          handleRemovePreviewTask(
                                            originalIndex
                                          );
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

                              {/* Due date picker */}
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
                            </div>

                            {/* Label suggestions */}
                            {aiGenerateLabels && suggestions.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                                  Task Labels
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {suggestions.map((option, optionIndex) => {
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
                                          'rounded-full border px-2.5 py-0.5 font-medium text-xs transition',
                                          option.selected
                                            ? 'border-dynamic-purple/60 bg-dynamic-purple/15 text-dynamic-purple'
                                            : 'border-dynamic-muted/40 text-muted-foreground'
                                        )}
                                      >
                                        {option.displayName}
                                        {option.isNew ? (
                                          <span className="ml-1.5 text-[0.5625rem] text-dynamic-purple uppercase tracking-wide">
                                            NEW
                                          </span>
                                        ) : null}
                                      </button>
                                    );
                                  })}
                                </div>
                                {suggestions.length >
                                MAX_VISIBLE_PREVIEW_LABELS ? (
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
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {visiblePreviewTasks.length === 0 && (
                <p className="rounded-lg border border-dynamic-muted/30 bg-dynamic-muted/10 p-3 text-center text-muted-foreground text-sm">
                  No tasks to preview
                </p>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          <p className="text-muted-foreground text-xs">
            {visiblePreviewTasks.length} of {previewTasks.length} tasks selected
          </p>
          <div className="flex gap-2">
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
              disabled={isCreating || visiblePreviewTasks.length === 0}
            >
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-dynamic-blue" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save {visiblePreviewTasks.length} Task
                  {visiblePreviewTasks.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
