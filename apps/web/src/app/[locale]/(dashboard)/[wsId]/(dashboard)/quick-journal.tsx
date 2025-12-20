'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/react';
import { Loader2, NotebookPen, Plus } from '@tuturuuu/icons';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { cn } from '@tuturuuu/utils/format';
import { invalidateTaskCaches } from '@tuturuuu/utils/task-helper';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

dayjs.extend(utc);
dayjs.extend(timezone);

const COMPLETED_STATUSES = new Set(['done', 'closed']);
const MAX_LABEL_SUGGESTIONS = 6;
const MAX_VISIBLE_PREVIEW_LABELS = 3;
const MAX_VISIBLE_WORKSPACE_LABELS = 12;
const BLOCK_BREAK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'listItem',
  'bulletList',
  'orderedList',
]);

const normalizeLabel = (value: string) => value.trim().toLowerCase();

const formatLabel = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(' ');

const deriveFallbackSuggestions = (
  title: string,
  description: string | null,
  disallowed: Set<string>
) => {
  const collected = new Set<string>();
  const text = `${title} ${description ?? ''}`.toLowerCase();
  const tokens = text.match(/[a-z0-9]{3,}/g) ?? [];

  for (const token of tokens) {
    if (collected.size >= MAX_LABEL_SUGGESTIONS) break;
    const normalized = normalizeLabel(token);
    if (!normalized || disallowed.has(normalized)) continue;
    collected.add(normalized);
  }

  if (!collected.size) {
    const fallback =
      title
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .find((word) => word.length > 2 && !disallowed.has(word)) ?? 'task';
    const normalizedFallback = normalizeLabel(fallback);
    if (normalizedFallback) {
      collected.add(normalizedFallback);
    }
  }

  return Array.from(collected).slice(0, MAX_LABEL_SUGGESTIONS).map(formatLabel);
};

const extractPlainText = (content: JSONContent | null): string => {
  if (!content) return '';

  const pieces: string[] = [];

  const visit = (node: JSONContent | null | undefined) => {
    if (!node) return;

    if (typeof node.text === 'string') {
      pieces.push(node.text);
    }

    if (Array.isArray(node.content)) {
      node.content.forEach((child) => {
        visit(child);
      });
    }

    if (node.type && BLOCK_BREAK_TYPES.has(node.type)) {
      pieces.push('\n');
    }
  };

  if (Array.isArray(content)) {
    content.forEach((node) => {
      visit(node);
    });
  } else {
    visit(content);
  }

  return pieces
    .join('')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

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

interface QuickJournalProps {
  wsId: string;
  enabled?: boolean;
}

interface QuickJournalContentProps {
  wsId: string;
}

interface WorkspaceBoardResponse {
  boards?: BoardWithLists[];
}

interface BoardWithLists {
  id: string;
  name: string | null;
  task_lists?: TaskList[] | null;
}

interface TaskList {
  id: string;
  name: string | null;
  status: string | null;
  position?: number | null;
}

interface ListOption {
  id: string;
  name: string | null;
  boardId: string;
  boardName: string | null;
  status: string | null;
  position?: number | null;
}

interface JournalTaskResponse {
  tasks?: Array<{
    id: string;
    name: string;
    description: string | null;
    priority: TaskPriority | null;
    labelSuggestions?: string[];
    dueDate?: string | null;
    labels?: ProvidedTaskLabelPayload[];
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

interface ProvidedTaskPayload {
  title: string;
  description: string | null;
  priority: TaskPriority | null;
  labelSuggestions?: string[];
  labels?: ProvidedTaskLabelPayload[];
  dueDate?: string | null;
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

interface WorkspaceLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

const PRIORITY_STYLES: Record<string, string> = {
  critical: 'border-dynamic-red/40 bg-dynamic-red/10 text-dynamic-red',
  high: 'border-dynamic-orange/40 bg-dynamic-orange/10 text-dynamic-orange',
  normal: 'border-dynamic-green/40 bg-dynamic-green/10 text-dynamic-green',
  low: 'border-dynamic-blue/40 bg-dynamic-blue/10 text-dynamic-blue',
  none: 'border-dynamic-muted/40 bg-dynamic-muted/10 text-dynamic-muted-foreground',
};

const LABEL_COLOR_CLASSES: Record<string, string> = {
  red: 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red',
  orange: 'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange',
  yellow: 'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow',
  green: 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green',
  blue: 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue',
  purple: 'border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple',
  pink: 'border-dynamic-pink/30 bg-dynamic-pink/10 text-dynamic-pink',
  gray: 'border-dynamic-muted/30 bg-dynamic-muted/10 text-dynamic-muted-foreground',
};

function QuickJournalContent({ wsId }: QuickJournalContentProps) {
  const t = useTranslations('dashboard.quick_journal');
  const router = useRouter();
  const queryClient = useQueryClient();

  const [entry, setEntry] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const [selectedListId, setSelectedListId] = useState('');
  const [previewEntry, setPreviewEntry] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<JournalTaskResponse | null>(
    null
  );
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [isPreviewOpen, setPreviewOpen] = useState(false);
  const [enableDescriptions, setEnableDescriptions] = useState(true);
  const [enablePriority, setEnablePriority] = useState(true);
  const [enableLabels, setEnableLabels] = useState(true);
  const [taskLabelSelections, setTaskLabelSelections] = useState<
    TaskLabelSelection[]
  >([]);
  const [taskDueDates, setTaskDueDates] = useState<(Date | undefined)[]>([]);
  const lastInitializedLabelsKey = useRef<string | null>(null);
  const lastInitializedDueDatesKey = useRef<string | null>(null);
  const [expandedLabelCards, setExpandedLabelCards] = useState<
    Record<number, boolean>
  >({});
  const [workspaceLabelsExpanded, setWorkspaceLabelsExpanded] = useState(false);
  const clientTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
    } catch {
      return 'UTC';
    }
  }, []);

  const handleDescriptionsToggle = useCallback((checked: boolean) => {
    const next = Boolean(checked);
    setEnableDescriptions((prev) => (prev !== next ? next : prev));
  }, []);

  const handlePriorityToggle = useCallback((checked: boolean) => {
    const next = Boolean(checked);
    setEnablePriority((prev) => (prev !== next ? next : prev));
  }, []);

  const handleLabelsToggle = useCallback((checked: boolean) => {
    const next = Boolean(checked);
    setEnableLabels((prev) => (prev !== next ? next : prev));
  }, []);

  const toggleWorkspaceLabelsExpansion = useCallback(() => {
    setWorkspaceLabelsExpanded((prev) => !prev);
  }, []);

  const { data, isLoading, isError, error } = useQuery<WorkspaceBoardResponse>({
    queryKey: ['workspace', wsId, 'boards-with-lists'],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/boards-with-lists`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
        }
      );

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          payload && typeof payload === 'object' && 'error' in payload
            ? (payload as { error?: string }).error
            : undefined;

        throw new Error(message || t('errors.fetch_lists'));
      }

      return (payload ?? {}) as WorkspaceBoardResponse;
    },
    enabled: Boolean(wsId),
    staleTime: 60_000,
  });

  const defaultBoardLabel = t('default_board_name');
  const defaultListLabel = t('default_list_name');

  const listOptions = useMemo<ListOption[]>(() => {
    if (!data?.boards?.length) {
      return [];
    }

    return data.boards.flatMap((board) => {
      const orderedLists = [...(board.task_lists ?? [])].sort((a, b) => {
        const aPosition = a.position ?? Number.MAX_SAFE_INTEGER;
        const bPosition = b.position ?? Number.MAX_SAFE_INTEGER;
        return aPosition - bPosition;
      });

      return orderedLists
        .filter((list) => {
          const normalizedStatus = (list.status ?? '').toLowerCase();
          return !COMPLETED_STATUSES.has(normalizedStatus);
        })
        .map((list) => ({
          id: list.id,
          name: list.name,
          boardId: board.id,
          boardName: board.name,
          status: list.status,
          position: list.position ?? undefined,
        }));
    });
  }, [data?.boards]);

  useEffect(() => {
    if (!listOptions.length) {
      if (selectedListId) {
        setSelectedListId('');
      }
      return;
    }

    const alreadySelected = listOptions.some(
      (option) => option.id === selectedListId
    );
    if (!alreadySelected && previewEntry) {
      setSelectedListId(listOptions[0]?.id ?? '');
    }
  }, [listOptions, selectedListId, previewEntry]);

  const selectedList = useMemo(
    () => listOptions.find((option) => option.id === selectedListId) || null,
    [listOptions, selectedListId]
  );

  const clearPreviewArtifacts = () => {
    setPreviewOpen(false);
    setLastResult(null);
    setPreviewEntry(null);
    setSelectedListId('');
    setSelectedLabelIds([]);
    setTaskLabelSelections([]);
    setTaskDueDates([]);
    lastInitializedLabelsKey.current = null;
    lastInitializedDueDatesKey.current = null;
    setExpandedLabelCards({});
    setWorkspaceLabelsExpanded(false);
  };

  const previewMutation = useMutation<
    JournalTaskResponse,
    Error,
    {
      entry: string;
      generateDescriptions: boolean;
      generatePriority: boolean;
      generateLabels: boolean;
      clientTimezone: string;
      clientTimestamp: string;
    }
  >({
    mutationFn: async ({
      entry: previewText,
      generateDescriptions: shouldGenerateDescriptions,
      generatePriority: shouldGeneratePriority,
      generateLabels: shouldGenerateLabels,
      clientTimezone: timezone,
      clientTimestamp,
    }) => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/tasks/journal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entry: previewText,
          previewOnly: true,
          generateDescriptions: shouldGenerateDescriptions,
          generatePriority: shouldGeneratePriority,
          generateLabels: shouldGenerateLabels,
          clientTimezone: timezone,
          clientTimestamp,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          payload && typeof payload === 'object' && 'error' in payload
            ? (payload as { error?: string }).error
            : undefined;

        throw new Error(message || t('errors.generic'));
      }

      return payload;
    },
    onSuccess: (payload, variables) => {
      setLastResult(payload ?? null);
      setPreviewEntry(variables.entry);
      setSelectedLabelIds([]);
      if (!selectedListId && listOptions.length > 0) {
        setSelectedListId(listOptions[0]?.id ?? '');
      }
      setPreviewOpen(true);
    },
    onError: (mutationError) => {
      toast.error(mutationError.message || t('errors.generic'));
    },
  });

  const createTaskMutation = useMutation<
    JournalTaskResponse,
    Error,
    {
      entry: string;
      listId: string;
      generatedWithAI: boolean;
      tasks: ProvidedTaskPayload[];
      labelIds: string[];
      generateDescriptions: boolean;
      generatePriority: boolean;
      generateLabels: boolean;
      clientTimezone: string;
      clientTimestamp: string;
    }
  >({
    mutationFn: async ({
      entry: createText,
      listId,
      generatedWithAI,
      tasks,
      labelIds,
      generateDescriptions: shouldGenerateDescriptions,
      generatePriority: shouldGeneratePriority,
      generateLabels: shouldGenerateLabels,
      clientTimezone: timezone,
      clientTimestamp,
    }) => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/tasks/journal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entry: createText,
          listId,
          tasks,
          generatedWithAI,
          labelIds,
          generateDescriptions: shouldGenerateDescriptions,
          generatePriority: shouldGeneratePriority,
          generateLabels: shouldGenerateLabels,
          clientTimezone: timezone,
          clientTimestamp,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          payload && typeof payload === 'object' && 'error' in payload
            ? (payload as { error?: string }).error
            : undefined;

        throw new Error(message || t('errors.generic'));
      }

      return payload;
    },
    onSuccess: (payload, variables) => {
      const targetList = listOptions.find(
        (option) => option.id === variables.listId
      );
      const listName = targetList?.name || defaultListLabel;
      const createdCount =
        payload?.metadata?.totalTasks ??
        payload?.tasks?.length ??
        variables.tasks.length ??
        1;

      toast.success(
        t(payload?.metadata?.generatedWithAI ? 'success_ai' : 'success', {
          listName,
          count: createdCount,
        })
      );

      clearPreviewArtifacts();
      setEntry('');
      setEditorKey((previous) => previous + 1);

      const boardIdForInvalidation =
        targetList?.boardId || selectedList?.boardId;
      if (boardIdForInvalidation) {
        invalidateTaskCaches(queryClient, boardIdForInvalidation);
      }
      router.refresh();
    },
    onError: (mutationError) => {
      toast.error(mutationError.message || t('errors.generic'));
    },
  });

  const handleEditorContentChange = (content: JSONContent | null) => {
    const textValue = extractPlainText(content);
    setEntry(textValue);
    if (lastResult) {
      clearPreviewArtifacts();
    }
  };

  const handleGeneratePreview = () => {
    const trimmedEntry = entry.trim();
    if (!trimmedEntry) {
      toast.error(t('errors.missing_title'));
      return;
    }

    let timestampMoment = dayjs().tz(clientTimezone);
    if (!timestampMoment.isValid()) {
      timestampMoment = dayjs();
    }
    const clientTimestamp = timestampMoment.toISOString();

    previewMutation.mutate({
      entry: trimmedEntry,
      generateDescriptions: enableDescriptions,
      generatePriority: enablePriority,
      generateLabels: enableLabels,
      clientTimezone,
      clientTimestamp,
    });
  };

  const handleCancelPreview = () => {
    if (createTaskMutation.isPending) return;
    clearPreviewArtifacts();
  };

  const toggleTaskLabelSuggestion = (
    taskIndex: number,
    optionIndex: number
  ) => {
    if (!enableLabels || createTaskMutation.isPending) return;

    setTaskLabelSelections((prev) => {
      if (!prev[taskIndex]) {
        return prev;
      }

      const next = prev.map((selection, index) => {
        if (index !== taskIndex) {
          return selection;
        }

        return {
          suggestions: selection.suggestions.map((option, currentIndex) => {
            if (currentIndex !== optionIndex) {
              return option;
            }

            return {
              ...option,
              selected: !option.selected,
            };
          }),
        };
      });

      return next;
    });
  };

  const handleDueDateChange = (taskIndex: number, value: Date | undefined) => {
    if (createTaskMutation.isPending) {
      return;
    }
    setTaskDueDates((prev) => {
      const next = [...prev];
      next[taskIndex] = value ? adjustDateToEndOfDay(value) : undefined;
      return next;
    });
  };

  const toggleLabelPreviewExpansion = useCallback((taskIndex: number) => {
    setExpandedLabelCards((prev) => ({
      ...prev,
      [taskIndex]: !prev[taskIndex],
    }));
  }, []);

  const handleConfirmTasks = () => {
    if (!selectedList) {
      toast.error(t('errors.no_list_selected'));
      return;
    }

    const previewTasks = lastResult?.tasks ?? [];
    if (!previewTasks.length) {
      toast.error(t('errors.generic'));
      return;
    }

    const createText = (previewEntry ?? entry).trim();
    if (!createText) {
      toast.error(t('errors.missing_title'));
      return;
    }

    const tasksPayload = previewTasks.map((task, index) => {
      const selections = enableLabels
        ? (taskLabelSelections[index]?.suggestions.filter(
            (option) => option.selected
          ) ?? [])
        : [];

      return {
        title: task.name,
        description: enableDescriptions ? task.description : null,
        priority: enablePriority ? task.priority : null,
        labels: selections.map((option) => ({
          id: option.id ?? undefined,
          name: option.name,
        })),
        dueDate: formatDueDateForPayload(taskDueDates[index]),
      } satisfies ProvidedTaskPayload;
    });

    let timestampMoment = dayjs().tz(clientTimezone);
    if (!timestampMoment.isValid()) {
      timestampMoment = dayjs();
    }
    const clientTimestamp = timestampMoment.toISOString();

    createTaskMutation.mutate({
      entry: createText,
      listId: selectedList.id,
      generatedWithAI: Boolean(lastResult?.metadata?.generatedWithAI),
      tasks: tasksPayload,
      labelIds: selectedLabelIds,
      generateDescriptions: enableDescriptions,
      generatePriority: enablePriority,
      generateLabels: enableLabels,
      clientTimezone,
      clientTimestamp,
    });
  };

  const fetchErrorMessage =
    error instanceof Error ? error.message : t('errors.fetch_lists');

  const previewTasks = lastResult?.tasks ?? [];
  const generatedWithAI = Boolean(lastResult?.metadata?.generatedWithAI);
  const isPreviewing = previewMutation.isPending;
  const isCreating = createTaskMutation.isPending;
  const disableGenerate = isPreviewing || entry.trim().length === 0;

  const { data: workspaceLabels = [], isLoading: labelsLoading } = useQuery({
    queryKey: ['workspace', wsId, 'labels'],
    queryFn: async () => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/labels`);
      if (!response.ok) {
        throw new Error(t('errors.fetch_labels'));
      }
      return (await response.json()) as WorkspaceLabel[];
    },
    enabled: isPreviewOpen && enableLabels,
  });

  const toggleLabel = (labelId: string) => {
    if (!enableLabels || createTaskMutation.isPending) return;
    setSelectedLabelIds((prev) =>
      prev.includes(labelId)
        ? prev.filter((id) => id !== labelId)
        : [...prev, labelId]
    );
  };

  const getPriorityCopy = (priority: TaskPriority | null | undefined) => {
    if (!priority) return t('priority_labels.none');
    return t(`priority_labels.${priority}` as const);
  };

  const priorityBadgeClass = (priority: TaskPriority | null | undefined) => {
    const key = priority ?? 'none';
    return PRIORITY_STYLES[key] ?? PRIORITY_STYLES.none;
  };

  useEffect(() => {
    if (!enableLabels) {
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
    enableLabels,
    selectedLabelIds.length,
    taskLabelSelections.length,
    workspaceLabelsExpanded,
    expandedLabelCards,
  ]);

  const sortedLabels = useMemo(
    () =>
      enableLabels
        ? [...workspaceLabels].sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
          )
        : [],
    [workspaceLabels, enableLabels]
  );

  useEffect(() => {
    setWorkspaceLabelsExpanded(false);
  }, []);

  const displayedWorkspaceLabels = useMemo(
    () =>
      workspaceLabelsExpanded
        ? sortedLabels
        : sortedLabels.slice(0, MAX_VISIBLE_WORKSPACE_LABELS),
    [sortedLabels, workspaceLabelsExpanded]
  );

  useEffect(() => {
    if (!enableLabels) {
      return;
    }

    if (!previewTasks.length) {
      if (taskLabelSelections.length > 0) {
        setTaskLabelSelections([]);
      }
      if (Object.keys(expandedLabelCards).length > 0) {
        setExpandedLabelCards({});
      }
      lastInitializedLabelsKey.current = null;
      return;
    }

    const previewKey = `${previewEntry ?? entry}:${previewTasks.length}`;

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

    const normalizedExistingKeys = new Set<string>();
    normalizedExisting.forEach((_value, key) => {
      normalizedExistingKeys.add(key);
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

      if (!options.length) {
        deriveFallbackSuggestions(
          task.name,
          task.description ?? '',
          new Set([...normalizedExistingKeys, ...seen])
        )
          .slice(0, MAX_LABEL_SUGGESTIONS)
          .forEach((suggestion) => {
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
              options.push({
                id: null,
                name: suggestion,
                displayName: suggestion,
                isNew: true,
                selected: false,
              });
            }
          });
      }

      return {
        suggestions: options.slice(0, MAX_LABEL_SUGGESTIONS),
      };
    });

    setTaskLabelSelections(nextSelections);
    lastInitializedLabelsKey.current = previewKey;
    setExpandedLabelCards({});
  }, [
    enableLabels,
    previewTasks,
    previewEntry,
    entry,
    sortedLabels,
    taskLabelSelections.length,
    expandedLabelCards,
  ]);

  useEffect(() => {
    if (!previewTasks.length) {
      if (taskDueDates.length) {
        setTaskDueDates([]);
      }
      lastInitializedDueDatesKey.current = null;
      return;
    }

    const previewKey = `${previewEntry ?? entry}:${previewTasks.length}`;
    if (lastInitializedDueDatesKey.current === previewKey) {
      return;
    }

    setTaskDueDates(
      previewTasks.map((task) => parseDueDateToState(task.dueDate ?? null))
    );
    lastInitializedDueDatesKey.current = previewKey;
  }, [previewTasks, previewEntry, entry, taskDueDates.length]);

  useEffect(() => {
    if (!enableLabels || !sortedLabels.length || !taskLabelSelections.length) {
      return;
    }

    const normalizedExisting = new Map<string, WorkspaceLabel>();
    sortedLabels.forEach((label) => {
      const normalized = normalizeLabel(label.name);
      if (normalized) {
        normalizedExisting.set(normalized, label);
      }
    });

    let shouldUpdate = false;

    const nextSelections = taskLabelSelections.map((selection) => {
      const nextOptions = selection.suggestions.map((option) => {
        if (option.id) {
          return option;
        }

        const normalized = normalizeLabel(option.name);
        const match = normalized
          ? normalizedExisting.get(normalized)
          : undefined;

        if (match) {
          shouldUpdate = true;
          return {
            ...option,
            id: match.id,
            name: match.name,
            displayName: match.name,
            isNew: false,
          };
        }

        return option;
      });

      return {
        suggestions: nextOptions,
      };
    });

    if (shouldUpdate) {
      setTaskLabelSelections(nextSelections);
    }
  }, [enableLabels, sortedLabels, taskLabelSelections]);

  const disableConfirm =
    isCreating || !selectedList || previewTasks.length === 0;

  return (
    <>
      <Card className="group overflow-hidden border border-dynamic-blue/20 bg-background/80 shadow-sm backdrop-blur">
        <CardHeader className="border-dynamic-blue/15 border-b bg-linear-to-r from-dynamic-blue/10 via-dynamic-indigo/10 to-dynamic-purple/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 font-semibold text-base">
                <span className="rounded-lg bg-dynamic-blue/10 p-2 text-dynamic-blue">
                  <NotebookPen className="h-4 w-4" />
                </span>
                {t('title')}
              </CardTitle>
              <CardDescription className="mt-1 text-muted-foreground text-sm">
                {t('description')}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-6">
          {isError ? (
            <Alert
              variant="destructive"
              className="border-dynamic-red/40 bg-dynamic-red/10 text-dynamic-red"
            >
              <AlertDescription>{fetchErrorMessage}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-3">
            <RichTextEditor
              key={`quick-journal-editor-${editorKey}`}
              content={null}
              onChange={handleEditorContentChange}
              writePlaceholder={t('placeholder')}
              readOnly={isCreating}
              className="min-h-40"
            />
            <p className="text-muted-foreground text-xs">{t('helper_text')}</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="flex items-start justify-between gap-3 rounded-lg border border-dynamic-muted/40 bg-dynamic-muted/5 p-3">
              <div>
                <p className="font-medium text-foreground text-sm">
                  {t('toggle_descriptions_label')}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t('toggle_hint')}
                </p>
              </div>
              <Switch
                checked={enableDescriptions}
                onCheckedChange={handleDescriptionsToggle}
                disabled={isCreating || isPreviewing}
              />
            </div>

            <div className="flex items-start justify-between gap-3 rounded-lg border border-dynamic-muted/40 bg-dynamic-muted/5 p-3">
              <div>
                <p className="font-medium text-foreground text-sm">
                  {t('toggle_priority_label')}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t('toggle_hint')}
                </p>
              </div>
              <Switch
                checked={enablePriority}
                onCheckedChange={handlePriorityToggle}
                disabled={isCreating || isPreviewing}
              />
            </div>

            <div className="flex items-start justify-between gap-3 rounded-lg border border-dynamic-muted/40 bg-dynamic-muted/5 p-3">
              <div>
                <p className="font-medium text-foreground text-sm">
                  {t('toggle_labels_label')}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t('toggle_hint')}
                </p>
              </div>
              <Switch
                checked={enableLabels}
                onCheckedChange={handleLabelsToggle}
                disabled={isCreating || isPreviewing}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={handleGeneratePreview}
              disabled={disableGenerate}
              className="sm:w-auto"
            >
              {isPreviewing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-dynamic-blue" />
                  {t('generate_pending')}
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('generate_button')}
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const trimmedEntry = entry.trim();
                if (!trimmedEntry) {
                  toast.error(t('errors.missing_title'));
                  return;
                }
                // Create manual preview without AI
                setLastResult({
                  tasks: [
                    {
                      id: 'manual-task',
                      name: trimmedEntry,
                      description: null,
                      priority: null,
                    },
                  ],
                  metadata: {
                    generatedWithAI: false,
                    totalTasks: 1,
                  },
                });
                setPreviewEntry(trimmedEntry);
                if (!selectedListId && listOptions.length > 0) {
                  setSelectedListId(listOptions[0]?.id ?? '');
                }
                setPreviewOpen(true);
              }}
              disabled={disableGenerate}
              className="sm:w-auto"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Manually
            </Button>
          </div>

          {isPreviewing ? (
            <div className="flex items-center gap-2 rounded-lg border border-dynamic-blue/30 bg-dynamic-blue/10 px-3 py-2 text-dynamic-blue text-xs">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t('status_generating')}</span>
            </div>
          ) : null}

          {isCreating ? (
            <div className="flex items-center gap-2 rounded-lg border border-dynamic-blue/30 bg-dynamic-blue/10 px-3 py-2 text-dynamic-blue text-xs">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t('status_creating')}</span>
            </div>
          ) : null}

          {!isLoading && !isError && listOptions.length === 0 ? (
            <Alert className="border-dynamic-yellow/40 bg-dynamic-yellow/10 text-dynamic-yellow">
              <AlertDescription>{t('no_lists_description')}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={isPreviewOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCancelPreview();
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t('modal_title', { count: previewTasks.length })}
            </DialogTitle>
            <DialogDescription>
              {selectedList
                ? t('modal_subtitle', {
                    listName: selectedList.name || defaultListLabel,
                  })
                : t('modal_subtitle_pending')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label
                htmlFor="preview-list-dialog"
                className="font-medium text-sm"
              >
                {t('select_label')}
              </Label>
              <Select
                value={selectedListId}
                onValueChange={setSelectedListId}
                disabled={isCreating || listOptions.length === 0}
              >
                <SelectTrigger id="preview-list-dialog" className="w-full">
                  <SelectValue placeholder={t('select_placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {listOptions.map((option) => {
                    const boardName = option.boardName || defaultBoardLabel;
                    const listName = option.name || defaultListLabel;
                    return (
                      <SelectItem key={option.id} value={option.id}>
                        {boardName} • {listName}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {listOptions.length === 0 ? (
                <Alert className="border-dynamic-yellow/40 bg-dynamic-yellow/10 text-dynamic-yellow">
                  <AlertDescription>
                    {t('no_lists_description')}
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-medium text-sm">
                  {t('labels_heading')}
                </Label>
                <span className="text-muted-foreground text-xs">
                  {t('labels_select_hint')}
                </span>
              </div>

              {!enableLabels ? (
                <p className="rounded-lg border border-dynamic-muted/30 bg-dynamic-muted/10 p-3 text-muted-foreground text-xs">
                  {t('labels_disabled_notice')}
                </p>
              ) : labelsLoading ? (
                <div className="flex items-center gap-2 rounded-lg border border-dynamic-blue/30 bg-dynamic-blue/10 px-3 py-2 text-dynamic-blue text-xs">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t('labels_loading')}</span>
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
                        ? t('labels_show_less')
                        : t('labels_show_more', {
                            count:
                              sortedLabels.length -
                              MAX_VISIBLE_WORKSPACE_LABELS,
                          })}
                    </button>
                  ) : null}
                </>
              ) : (
                <p className="rounded-lg border border-dynamic-muted/30 bg-dynamic-muted/10 p-3 text-muted-foreground text-xs">
                  {t('labels_none')}
                </p>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-foreground text-sm">
                  {t(
                    generatedWithAI
                      ? 'preview_heading_ai'
                      : 'preview_heading_manual',
                    { count: previewTasks.length }
                  )}
                </p>
                <Badge
                  variant="outline"
                  className="border-dynamic-blue/40 bg-transparent text-foreground text-xs"
                >
                  {t('preview_total_badge', { count: previewTasks.length })}
                </Badge>
              </div>

              <div className="space-y-3">
                {previewTasks.map((task, index) => {
                  const selection = taskLabelSelections[index];
                  const suggestions = enableLabels
                    ? (selection?.suggestions ?? [])
                    : [];
                  const hasNewSelections = suggestions.some(
                    (option) => option.isNew && option.selected
                  );
                  const dueDateValue = taskDueDates[index];

                  return (
                    <div
                      key={task.id ?? `${task.name}-${index}`}
                      className="rounded-md border border-dynamic-surface/30 bg-background/80 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <p className="font-medium text-foreground text-sm">
                            {index + 1}. {task.name}
                          </p>
                          <p className="font-medium text-muted-foreground text-xs">
                            {t('preview_description_label')}
                          </p>
                          {enableDescriptions ? (
                            <p className="text-foreground text-sm leading-relaxed opacity-90">
                              {task.description ||
                                t('preview_description_empty')}
                            </p>
                          ) : (
                            <p className="text-muted-foreground text-sm italic">
                              {t('preview_description_disabled')}
                            </p>
                          )}
                        </div>
                        {enablePriority ? (
                          <Badge
                            variant="outline"
                            className={priorityBadgeClass(task.priority)}
                          >
                            {getPriorityCopy(task.priority)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs italic">
                            {t('preview_priority_disabled')}
                          </span>
                        )}
                      </div>

                      <div className="mt-3 space-y-1">
                        <p className="text-muted-foreground text-xs uppercase tracking-wide">
                          {t('due_date_label')}
                        </p>
                        <DateTimePicker
                          date={dueDateValue}
                          setDate={(date) => handleDueDateChange(index, date)}
                          showTimeSelect
                          disabled={isCreating}
                        />
                        {!dueDateValue ? (
                          <p className="text-muted-foreground text-xs">
                            {t('due_date_empty')}
                          </p>
                        ) : null}
                      </div>

                      {enableLabels ? (
                        <div className="mt-3 space-y-1">
                          <p className="text-muted-foreground text-xs uppercase tracking-wide">
                            {t('labels_task_suggestions')}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {suggestions.length ? (
                              suggestions.map((option, optionIndex) => {
                                if (
                                  !expandedLabelCards[index] &&
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
                                        index,
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
                                        {t('labels_task_suggestions_new')}
                                      </span>
                                    ) : null}
                                  </button>
                                );
                              })
                            ) : (
                              <span className="text-muted-foreground text-xs italic">
                                {t('labels_task_suggestions_empty')}
                              </span>
                            )}
                          </div>
                          {suggestions.length > MAX_VISIBLE_PREVIEW_LABELS ? (
                            <button
                              type="button"
                              onClick={() => toggleLabelPreviewExpansion(index)}
                              className="font-medium text-dynamic-blue text-xs hover:underline"
                              disabled={isCreating}
                            >
                              {expandedLabelCards[index]
                                ? t('labels_task_suggestions_show_less')
                                : t('labels_task_suggestions_show_more', {
                                    count:
                                      suggestions.length -
                                      MAX_VISIBLE_PREVIEW_LABELS,
                                  })}
                            </button>
                          ) : null}
                          {hasNewSelections ? (
                            <p className="text-muted-foreground text-xs">
                              {t('labels_task_suggestions_create_note')}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleCancelPreview}
              disabled={isCreating}
            >
              {t('cancel_preview')}
            </Button>
            <Button
              type="button"
              onClick={handleConfirmTasks}
              disabled={disableConfirm}
            >
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-dynamic-blue" />
                  {t('confirm_pending')}
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('confirm_button')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function QuickJournal({
  wsId,
  enabled = true,
}: QuickJournalProps) {
  const t = useTranslations('dashboard.quick_journal');

  if (!enabled) {
    return (
      <Card className="border-dynamic-muted/50">
        <CardHeader>
          <CardTitle>{t('restricted_title')}</CardTitle>
          <CardDescription>{t('restricted_description')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return <QuickJournalContent wsId={wsId} />;
}
