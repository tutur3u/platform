import dayjs from 'dayjs';
import { useMemo } from 'react';
import type { MentionOption } from './types';
import { normalizeForSearch } from './types';

interface UseMentionSuggestionsProps {
  workspaceMembers: any[];
  currentWorkspace: {
    id: string;
    name: string;
    handle: string | null;
    personal: boolean;
  } | null;
  taskProjects: any[];
  workspaceTasks: any[];
  currentTaskId?: string;
  query: string;
}

export interface UseMentionSuggestionsResult {
  mentionUserOptions: MentionOption[];
  mentionWorkspaceOptions: MentionOption[];
  mentionProjectOptions: MentionOption[];
  mentionTaskOptions: MentionOption[];
  mentionDateOptions: MentionOption[];
  allMentionOptions: MentionOption[];
  filteredMentionOptions: MentionOption[];
}

export function useMentionSuggestions({
  workspaceMembers,
  currentWorkspace,
  taskProjects,
  workspaceTasks,
  currentTaskId,
  query,
}: UseMentionSuggestionsProps): UseMentionSuggestionsResult {
  const mentionUserOptions = useMemo<MentionOption[]>(
    () =>
      [...workspaceMembers]
        .sort((a, b) =>
          (a?.display_name || '').localeCompare(b?.display_name || '')
        )
        .map((member: any) => ({
          id: member.user_id,
          label: member.display_name || 'Unknown member',
          subtitle: undefined,
          avatarUrl: member.avatar_url,
          type: 'user' as const,
          payload: member,
        })),
    [workspaceMembers]
  );

  const mentionWorkspaceOptions = useMemo<MentionOption[]>(() => {
    // Only include the current workspace if it's not personal
    if (!currentWorkspace || currentWorkspace.personal) {
      return [];
    }

    return [
      {
        id: currentWorkspace.id,
        label: currentWorkspace.name || 'Workspace',
        subtitle: currentWorkspace.handle
          ? `@${currentWorkspace.handle}`
          : currentWorkspace.id.slice(0, 8),
        avatarUrl: null,
        type: 'workspace' as const,
        payload: currentWorkspace,
      },
    ];
  }, [currentWorkspace]);

  const mentionProjectOptions = useMemo<MentionOption[]>(
    () =>
      [...taskProjects].map((project: any) => ({
        id: project.id,
        label: project.name || 'Untitled project',
        subtitle: project.status || undefined,
        avatarUrl: null,
        type: 'project' as const,
        payload: project,
      })),
    [taskProjects]
  );

  const mentionTaskOptions = useMemo<MentionOption[]>(
    () =>
      [...workspaceTasks]
        .filter((taskItem: any) => taskItem.id !== currentTaskId)
        .map((task: any) => {
          const subtitleParts: string[] = [];
          if (task.list?.name) subtitleParts.push(task.list.name);
          return {
            id: task.id,
            label: task.name || 'Untitled task',
            subtitle: subtitleParts.join(' • ') || undefined,
            avatarUrl: null,
            type: 'task' as const,
            payload: task,
          };
        }),
    [workspaceTasks, currentTaskId]
  );

  const mentionDateOptions = useMemo<MentionOption[]>(() => {
    const today = dayjs();
    const options: MentionOption[] = [
      {
        id: 'today',
        label: 'Today',
        subtitle: today.format('MMM D, YYYY'),
        avatarUrl: null,
        type: 'date' as const,
        payload: { date: today.toISOString() },
      },
      {
        id: 'tomorrow',
        label: 'Tomorrow',
        subtitle: today.add(1, 'day').format('MMM D, YYYY'),
        avatarUrl: null,
        type: 'date' as const,
        payload: { date: today.add(1, 'day').toISOString() },
      },
      {
        id: 'next-week',
        label: 'Next week',
        subtitle: today.add(1, 'week').format('MMM D, YYYY'),
        avatarUrl: null,
        type: 'date' as const,
        payload: { date: today.add(1, 'week').toISOString() },
      },
      {
        id: 'next-month',
        label: 'Next month',
        subtitle: today.add(1, 'month').format('MMM D, YYYY'),
        avatarUrl: null,
        type: 'date' as const,
        payload: { date: today.add(1, 'month').toISOString() },
      },
      {
        id: 'custom-date',
        label: 'Custom date...',
        subtitle: 'Pick a specific date',
        avatarUrl: null,
        type: 'date' as const,
        payload: { isCustom: true },
      },
    ];
    return options;
  }, []);

  const allMentionOptions = useMemo<MentionOption[]>(
    () => [
      ...mentionUserOptions,
      ...mentionWorkspaceOptions,
      ...mentionProjectOptions,
      ...mentionTaskOptions,
      ...mentionDateOptions,
    ],
    [
      mentionUserOptions,
      mentionWorkspaceOptions,
      mentionProjectOptions,
      mentionTaskOptions,
      mentionDateOptions,
    ]
  );

  const filteredMentionOptions = useMemo(() => {
    const rawQuery = query.trim();
    const normalizedQuery = normalizeForSearch(rawQuery.replace(/^[@#]/, ''));

    if (!normalizedQuery) {
      const limitedTasks = mentionTaskOptions.slice(0, 8);
      return [
        ...mentionUserOptions,
        ...mentionWorkspaceOptions,
        ...mentionProjectOptions,
        ...mentionDateOptions,
        ...limitedTasks,
      ];
    }

    const filtered = allMentionOptions.filter((option) => {
      const searchTexts = [option.label, option.subtitle || ''];

      const normalizedTexts = searchTexts.map(normalizeForSearch);
      const combinedText = normalizedTexts.join(' ');

      if (combinedText.includes(normalizedQuery)) {
        return true;
      }

      const queryWords = normalizedQuery.split(/\s+/);
      return queryWords.every((word) =>
        normalizedTexts.some((text) => text.includes(word))
      );
    });

    // Check if there are any non-task matches (users, workspaces, projects, dates)
    const NON_TASK_TYPES = new Set(['user', 'workspace', 'project', 'date']);
    const hasNonTaskMatches = filtered.some((option) =>
      NON_TASK_TYPES.has(option.type)
    );

    // If no non-task matches and query is not empty, add external user option
    // This allows adding custom guests even when tasks match the query
    if (!hasNonTaskMatches && rawQuery) {
      return [
        {
          id: `external-${rawQuery}`,
          label: rawQuery,
          subtitle: 'Not a workspace member',
          avatarUrl: null,
          type: 'external-user' as const,
          payload: { displayName: rawQuery, isExternal: true },
        },
        ...filtered.filter((option) => option.type === 'task'),
      ];
    }

    return filtered;
  }, [
    allMentionOptions,
    query,
    mentionTaskOptions,
    mentionUserOptions,
    mentionWorkspaceOptions,
    mentionProjectOptions,
    mentionDateOptions,
  ]);

  return {
    mentionUserOptions,
    mentionWorkspaceOptions,
    mentionProjectOptions,
    mentionTaskOptions,
    mentionDateOptions,
    allMentionOptions,
    filteredMentionOptions,
  };
}
