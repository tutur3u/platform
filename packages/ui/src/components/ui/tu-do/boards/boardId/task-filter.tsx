'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  Calendar as CalendarIcon,
  Filter,
  Flag,
  Globe2,
  Hash,
  LayoutDashboard,
  ListFilter,
  Tag,
  User,
  UserStar,
  Users,
  UserX,
  X,
} from '@tuturuuu/icons';
import {
  listWorkspaceLabels,
  listWorkspaceTaskBoards,
  listWorkspaceTaskProjects,
  type WorkspaceTaskBoardListItem,
} from '@tuturuuu/internal-api/tasks';
import { listWorkspaces } from '@tuturuuu/internal-api/workspaces';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { useWorkspaceMembers } from '@tuturuuu/ui/hooks/use-workspace-members';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';
import type {
  SortOption,
  TaskAssignee,
  TaskFilters,
  TaskLabel,
  TaskProject,
  TaskSourceScope,
} from '../../shared/task-filter.types';

// Re-export types for backward compatibility
export type { SortOption, TaskAssignee, TaskFilters, TaskLabel, TaskProject };

type SourceBoardOption = WorkspaceTaskBoardListItem & {
  workspaceId: string;
  workspaceName: string;
};

const SOURCE_SCOPE_ICONS = {
  all_visible: Globe2,
  current_board: LayoutDashboard,
  external_current_workspace: Building2,
  external_specific: ListFilter,
} satisfies Record<TaskSourceScope, typeof Globe2>;

const SOURCE_SCOPE_OPTIONS: TaskSourceScope[] = [
  'all_visible',
  'current_board',
  'external_current_workspace',
  'external_specific',
];

interface Props {
  wsId: string;
  currentUserId?: string;
  filters: TaskFilters;
  onFiltersChange: (filters: TaskFilters) => void;
}

function getColorStyles(color: string) {
  // If it's a hex color, use luminance-based calculations
  if (color.startsWith('#') || color.startsWith('rgb')) {
    // Parse hex color to RGB
    let r: number, g: number, b: number;

    if (color.startsWith('#')) {
      const hex = color.slice(1);
      if (hex.length === 3) {
        r = parseInt((hex[0] || '0') + (hex[0] || '0'), 16);
        g = parseInt((hex[1] || '0') + (hex[1] || '0'), 16);
        b = parseInt((hex[2] || '0') + (hex[2] || '0'), 16);
      } else if (hex.length === 6) {
        r = parseInt(hex.substring(0, 2) || '00', 16);
        g = parseInt(hex.substring(2, 4) || '00', 16);
        b = parseInt(hex.substring(4, 6) || '00', 16);
      } else {
        // Invalid hex format, fallback to CSS custom property
        return {
          backgroundColor: color,
          color: '#ffffff',
        };
      }
    } else if (color.startsWith('rgb')) {
      const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (!match || match.length < 4) {
        return {
          backgroundColor: color,
          color: '#ffffff',
        };
      }
      r = Number(match[1]);
      g = Number(match[2]);
      b = Number(match[3]);
    } else {
      return {
        backgroundColor: color,
        color: '#ffffff',
      };
    }

    // Validate RGB values
    if (
      Number.isNaN(r) ||
      Number.isNaN(g) ||
      Number.isNaN(b) ||
      r < 0 ||
      r > 255 ||
      g < 0 ||
      g > 255 ||
      b < 0 ||
      b > 255
    ) {
      return {
        backgroundColor: color,
        color: '#ffffff',
      };
    }

    // Calculate relative luminance using sRGB formula
    const toLinear = (c: number) => {
      const normalized = c / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    };

    const luminance =
      0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

    // Use white text for dark colors (luminance < 0.5), black for light colors
    const textColor = luminance < 0.5 ? '#ffffff' : '#000000';

    return {
      backgroundColor: color,
      color: textColor,
    };
  }

  // For CSS custom properties or other color formats, use the color directly
  return {
    backgroundColor: color,
    color: '#ffffff',
  };
}

const PRIORITIES: { value: TaskPriority; labelKey: string; color: string }[] = [
  {
    value: 'critical',
    labelKey: 'tasks.priority_critical',
    color: 'text-dynamic-red',
  },
  {
    value: 'high',
    labelKey: 'tasks.priority_high',
    color: 'text-dynamic-orange',
  },
  {
    value: 'normal',
    labelKey: 'tasks.priority_normal',
    color: 'text-dynamic-blue',
  },
  { value: 'low', labelKey: 'tasks.priority_low', color: 'text-dynamic-gray' },
];

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

function formatDateInputValue(date: Date | undefined) {
  if (!date) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function parseDateInputValue(value: string) {
  if (!value) return undefined;

  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;

  return new Date(year, month - 1, day);
}

function FilterPickerField({
  badge,
  children,
  icon,
  label,
}: {
  badge?: ReactNode;
  children: ReactNode;
  icon: ReactNode;
  label: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex min-w-0 items-center gap-2 text-muted-foreground text-xs">
        {icon}
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        {badge}
      </div>
      {children}
    </div>
  );
}

export function TaskFilter({
  wsId,
  currentUserId,
  filters,
  onFiltersChange,
}: Props) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const sourceScope = filters.sourceScope ?? 'all_visible';
  const selectedSourceWorkspaceIds = filters.sourceWorkspaceIds ?? [];
  const selectedSourceBoardIds = filters.sourceBoardIds ?? [];

  // Fetch available labels
  const { data: availableLabels = [] } = useQuery({
    queryKey: ['workspace-labels', wsId],
    queryFn: () => listWorkspaceLabels(wsId) as Promise<TaskLabel[]>,
    enabled: !!wsId,
  });

  // Fetch available assignees
  const { data: fetchedMembers = [] } = useWorkspaceMembers(wsId);

  // Deduplicate members by ID
  const availableAssignees: TaskAssignee[] = Array.from(
    fetchedMembers
      .reduce((map: Map<string, TaskAssignee>, member: any) => {
        if (member.id) {
          map.set(member.id, {
            id: member.id,
            display_name: member.display_name,
            avatar_url: member.avatar_url,
            email: member.email,
          });
        }
        return map;
      }, new Map<string, TaskAssignee>())
      .values()
  );

  // Fetch available projects
  const { data: availableProjects = [] } = useQuery({
    queryKey: ['workspace-projects', wsId],
    queryFn: async () => {
      return (await listWorkspaceTaskProjects(wsId))
        .filter((project) => project.status !== 'deleted')
        .map((project) => ({
          id: project.id,
          name: project.name,
        })) as TaskProject[];
    },
    enabled: !!wsId,
  });

  const { data: availableWorkspaces = [] } = useQuery({
    queryKey: ['task-source-workspaces'],
    queryFn: () => listWorkspaces(),
    enabled: open && sourceScope === 'external_specific',
    staleTime: 60_000,
  });

  const sourceWorkspaces = useMemo(
    () =>
      [...(availableWorkspaces as InternalApiWorkspaceSummary[])]
        .filter((workspace) => workspace.id)
        .sort((a, b) => {
          if (a.id === wsId) return -1;
          if (b.id === wsId) return 1;
          return (a.name ?? '').localeCompare(b.name ?? '');
        }),
    [availableWorkspaces, wsId]
  );

  const sourceWorkspaceKey = useMemo(
    () => [...selectedSourceWorkspaceIds].sort().join(','),
    [selectedSourceWorkspaceIds]
  );
  const sourceWorkspaceNameKey = useMemo(
    () =>
      sourceWorkspaces
        .map((workspace) => `${workspace.id}:${workspace.name ?? ''}`)
        .sort()
        .join('|'),
    [sourceWorkspaces]
  );

  const { data: sourceBoards = [], isLoading: sourceBoardsLoading } = useQuery({
    queryKey: [
      'task-source-boards',
      sourceWorkspaceKey,
      sourceWorkspaceNameKey,
    ],
    queryFn: async () => {
      if (selectedSourceWorkspaceIds.length === 0) return [];

      const boardsByWorkspace = await Promise.all(
        selectedSourceWorkspaceIds.map(async (workspaceId) => {
          const workspace = sourceWorkspaces.find(
            (item) => item.id === workspaceId
          );
          const response = await listWorkspaceTaskBoards(workspaceId, {
            pageSize: 100,
            status: 'active',
          });

          return response.boards.map(
            (board): SourceBoardOption => ({
              ...board,
              workspaceId: board.ws_id ?? workspaceId,
              workspaceName: workspace?.name ?? workspaceId,
            })
          );
        })
      );

      return boardsByWorkspace.flat().sort((a, b) => {
        const workspaceCompare = a.workspaceName.localeCompare(b.workspaceName);
        if (workspaceCompare !== 0) return workspaceCompare;
        return (a.name ?? '').localeCompare(b.name ?? '');
      });
    },
    enabled:
      open &&
      sourceScope === 'external_specific' &&
      selectedSourceWorkspaceIds.length > 0 &&
      sourceWorkspaces.length > 0,
    staleTime: 60_000,
  });

  const sourceScopeOptions = SOURCE_SCOPE_OPTIONS.map((scope) => {
    const Icon = SOURCE_SCOPE_ICONS[scope];

    return {
      value: scope,
      label: t(`ws-tasks.filter_source_scope_${scope}` as any),
      icon: <Icon className="h-4 w-4 text-muted-foreground" />,
    };
  });

  const sourceWorkspaceOptions = sourceWorkspaces.map((workspace) => ({
    value: workspace.id,
    label: workspace.name ?? workspace.id,
    icon: <Building2 className="h-4 w-4 text-muted-foreground" />,
  }));

  const sourceBoardOptions = sourceBoards.map((board) => ({
    value: board.id,
    label: board.name ?? t('common.untitled'),
    description: board.workspaceName,
    searchValue: `${board.name ?? ''} ${board.workspaceName}`,
    icon: <LayoutDashboard className="h-4 w-4 text-muted-foreground" />,
  }));

  const assigneeOptions = availableAssignees.map((assignee) => {
    const label =
      assignee.display_name ||
      assignee.email ||
      assignee.id ||
      t('common.untitled');

    return {
      value: assignee.id,
      label,
      description:
        assignee.display_name && assignee.email ? assignee.email : undefined,
      searchValue: `${label} ${assignee.email ?? ''}`,
      icon: (
        <Avatar className="h-5 w-5 border">
          {assignee.avatar_url && <AvatarImage src={assignee.avatar_url} />}
          <AvatarFallback className="font-medium text-[9px]">
            {getInitials(label)}
          </AvatarFallback>
        </Avatar>
      ),
    };
  });

  const labelOptions = availableLabels.map((label) => ({
    value: label.id,
    label: label.name,
    icon: (
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={getColorStyles(label.color)}
      />
    ),
  }));

  const projectOptions = availableProjects.map((project) => ({
    value: project.id,
    label: project.name,
    icon: <Hash className="h-4 w-4 text-muted-foreground" />,
  }));

  const priorityOptions = PRIORITIES.map((priority) => ({
    value: priority.value,
    label: t(priority.labelKey as any),
    icon: <Flag className={cn(priority.color, 'h-4 w-4')} />,
  }));

  const setLabelIds = (labelIds: string[]) => {
    onFiltersChange({
      ...filters,
      labels: availableLabels.filter((label) => labelIds.includes(label.id)),
    });
  };

  const setAssigneeIds = (assigneeIds: string[]) => {
    const newAssignees = availableAssignees.filter((assignee) =>
      assigneeIds.includes(assignee.id)
    );
    const shouldIncludeMyTasks =
      newAssignees.length === 1 && newAssignees[0]?.id === currentUserId;

    onFiltersChange({
      ...filters,
      assignees: newAssignees,
      includeMyTasks: shouldIncludeMyTasks,
      includeUnassigned:
        newAssignees.length > 0 ? false : filters.includeUnassigned,
    });
  };

  const setProjectIds = (projectIds: string[]) => {
    onFiltersChange({
      ...filters,
      projects: availableProjects.filter((project) =>
        projectIds.includes(project.id)
      ),
    });
  };

  const setPriorityValues = (priorities: string[]) => {
    onFiltersChange({
      ...filters,
      priorities: priorities.filter((priority): priority is TaskPriority =>
        PRIORITIES.some((option) => option.value === priority)
      ),
    });
  };

  const setSourceScope = (nextSourceScope: TaskSourceScope) => {
    onFiltersChange({
      ...filters,
      sourceScope: nextSourceScope,
      sourceBoardIds:
        nextSourceScope === 'external_specific' ? selectedSourceBoardIds : [],
      sourceWorkspaceIds:
        nextSourceScope === 'external_specific'
          ? selectedSourceWorkspaceIds
          : [],
    });
  };

  const setSourceWorkspaceIds = (nextWorkspaceIds: string[]) => {
    const selectedWorkspaces = new Set(nextWorkspaceIds);

    onFiltersChange({
      ...filters,
      sourceScope: 'external_specific',
      sourceWorkspaceIds: nextWorkspaceIds,
      sourceBoardIds: selectedSourceBoardIds.filter((boardId) => {
        const board = sourceBoards.find((item) => item.id === boardId);
        return !board || selectedWorkspaces.has(board.workspaceId);
      }),
    });
  };

  const setSourceBoardIds = (nextBoardIds: string[]) => {
    const workspaceIds = new Set(selectedSourceWorkspaceIds);
    for (const board of sourceBoards.filter((board) =>
      nextBoardIds.includes(board.id)
    )) {
      workspaceIds.add(board.workspaceId);
    }

    onFiltersChange({
      ...filters,
      sourceScope: 'external_specific',
      sourceBoardIds: nextBoardIds,
      sourceWorkspaceIds: Array.from(workspaceIds),
    });
  };

  const clearAllFilters = () => {
    onFiltersChange({
      labels: [],
      assignees: [],
      projects: [],
      priorities: [],
      dueDateRange: null,
      estimationRange: null,
      includeMyTasks: false,
      includeUnassigned: false,
      sourceScope: 'all_visible',
      sourceWorkspaceIds: [],
      sourceBoardIds: [],
      sortBy: undefined,
    });
  };

  const isSourceFilterActive = sourceScope !== 'all_visible';
  const hasFilters =
    filters.labels.length > 0 ||
    filters.assignees.length > 0 ||
    filters.projects.length > 0 ||
    filters.priorities.length > 0 ||
    filters.dueDateRange !== null ||
    filters.estimationRange !== null ||
    filters.includeMyTasks ||
    filters.includeUnassigned ||
    isSourceFilterActive;

  // Calculate filter count, avoiding double-counting when "Assigned to me" is checked
  // and the current user is also in the assignees list
  const isCurrentUserInAssignees =
    currentUserId && filters.assignees.some((a) => a.id === currentUserId);
  const assigneeCount =
    filters.includeMyTasks && isCurrentUserInAssignees
      ? filters.assignees.length - 1
      : filters.assignees.length;

  const filterCount =
    filters.labels.length +
    assigneeCount +
    filters.projects.length +
    filters.priorities.length +
    (filters.dueDateRange ? 1 : 0) +
    (filters.estimationRange ? 1 : 0) +
    (filters.includeMyTasks ? 1 : 0) +
    (filters.includeUnassigned ? 1 : 0) +
    (isSourceFilterActive
      ? Math.max(
          1,
          selectedSourceWorkspaceIds.length + selectedSourceBoardIds.length
        )
      : 0);
  const dueDateSummary = filters.dueDateRange
    ? [
        filters.dueDateRange.from
          ? formatShortDate(filters.dueDateRange.from)
          : null,
        filters.dueDateRange.to
          ? formatShortDate(filters.dueDateRange.to)
          : null,
      ]
        .filter(Boolean)
        .join(' - ') || t('common.due_date')
    : t('common.due_date');

  return (
    <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                size="xs"
                variant="outline"
                aria-label={t('common.filters')}
                className={cn(
                  'relative h-7 w-7 px-0 text-muted-foreground transition-colors hover:text-foreground sm:h-8 sm:w-8',
                  hasFilters && 'border-primary/50 bg-primary/5 text-foreground'
                )}
              >
                <Filter className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                {hasFilters && (
                  <Badge
                    variant="secondary"
                    className="absolute -top-1 -right-1 h-4 min-w-4 justify-center px-1 text-[9px]"
                  >
                    {filterCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{t('common.filters')}</TooltipContent>
        </Tooltip>
        <PopoverContent
          className="max-h-[min(82dvh,40rem)] w-[min(22rem,calc(100vw-1rem))] overflow-hidden p-0"
          align="end"
          collisionPadding={8}
          sideOffset={6}
        >
          <ScrollArea className="h-[min(76dvh,36rem)]">
            <div className="space-y-3 p-3">
              {currentUserId && (
                <div className="space-y-1 rounded-md border p-2">
                  <div className="mb-1 flex items-center gap-2 text-muted-foreground text-xs">
                    <User className="h-3.5 w-3.5" />
                    <span className="font-medium">
                      {t('common.quick_filters')}
                    </span>
                  </div>
                  <label className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                    <Checkbox
                      checked={filters.includeMyTasks}
                      onCheckedChange={(checked) => {
                        const currentUser = availableAssignees.find(
                          (assignee) => assignee.id === currentUserId
                        );

                        onFiltersChange({
                          ...filters,
                          includeMyTasks: !!checked,
                          assignees:
                            checked && currentUser ? [currentUser] : [],
                          includeUnassigned: checked
                            ? false
                            : filters.includeUnassigned,
                        });
                      }}
                    />
                    <UserStar className="h-4 w-4 text-dynamic-yellow" />
                    <span>{t('common.assigned_to_me')}</span>
                  </label>
                  <label className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                    <Checkbox
                      checked={filters.includeUnassigned}
                      onCheckedChange={(checked) =>
                        onFiltersChange({
                          ...filters,
                          includeUnassigned: !!checked,
                          includeMyTasks: checked
                            ? false
                            : filters.includeMyTasks,
                          assignees: checked ? [] : filters.assignees,
                        })
                      }
                    />
                    <UserX className="h-4 w-4 text-dynamic-red" />
                    <span>{t('common.unassigned')}</span>
                  </label>
                </div>
              )}

              <FilterPickerField
                icon={<ListFilter className="h-3.5 w-3.5" />}
                label={t('ws-tasks.filter_source_scope')}
                badge={
                  isSourceFilterActive ? (
                    <Badge
                      variant="secondary"
                      className="h-4 min-w-5 justify-center px-1 text-[10px]"
                    >
                      {sourceScope === 'external_specific'
                        ? Math.max(
                            1,
                            selectedSourceWorkspaceIds.length +
                              selectedSourceBoardIds.length
                          )
                        : 1}
                    </Badge>
                  ) : null
                }
              >
                <Combobox
                  mode="single"
                  options={sourceScopeOptions}
                  selected={sourceScope}
                  onChange={(value) => setSourceScope(value as TaskSourceScope)}
                  placeholder={t('ws-tasks.filter_source_scope')}
                  searchPlaceholder={t('common.search_tasks')}
                  className="[&_button]:h-9"
                />
              </FilterPickerField>

              {sourceScope === 'external_specific' && (
                <div className="grid gap-3 rounded-md border p-2">
                  <FilterPickerField
                    icon={<Building2 className="h-3.5 w-3.5" />}
                    label={t('ws-tasks.filter_workspaces')}
                    badge={
                      selectedSourceWorkspaceIds.length ? (
                        <Badge variant="secondary">
                          {selectedSourceWorkspaceIds.length}
                        </Badge>
                      ) : null
                    }
                  >
                    <Combobox
                      mode="multiple"
                      options={sourceWorkspaceOptions}
                      selected={selectedSourceWorkspaceIds}
                      onChange={(value) =>
                        setSourceWorkspaceIds(value as string[])
                      }
                      placeholder={t('ws-tasks.filter_workspaces')}
                      searchPlaceholder={t('common.search_tasks')}
                      emptyText={t('ws-tasks.filter_no_workspaces_available')}
                      className="[&_button]:h-9"
                    />
                  </FilterPickerField>

                  <FilterPickerField
                    icon={<LayoutDashboard className="h-3.5 w-3.5" />}
                    label={t('ws-tasks.filter_boards')}
                    badge={
                      selectedSourceBoardIds.length ? (
                        <Badge variant="secondary">
                          {selectedSourceBoardIds.length}
                        </Badge>
                      ) : null
                    }
                  >
                    <Combobox
                      mode="multiple"
                      options={sourceBoardOptions}
                      selected={selectedSourceBoardIds}
                      onChange={(value) => setSourceBoardIds(value as string[])}
                      placeholder={
                        selectedSourceWorkspaceIds.length
                          ? t('ws-tasks.filter_boards')
                          : t('ws-tasks.filter_select_source_prompt')
                      }
                      searchPlaceholder={t('common.search_boards')}
                      emptyText={
                        sourceBoardsLoading
                          ? t('common.loading')
                          : t('ws-tasks.filter_no_boards_for_workspaces')
                      }
                      disabled={selectedSourceWorkspaceIds.length === 0}
                      className="[&_button]:h-9"
                    />
                  </FilterPickerField>
                </div>
              )}

              <FilterPickerField
                icon={<Users className="h-3.5 w-3.5" />}
                label={t('common.assignees')}
                badge={
                  filters.assignees.length ? (
                    <Badge variant="secondary">
                      {filters.assignees.length}
                    </Badge>
                  ) : null
                }
              >
                <Combobox
                  mode="multiple"
                  options={assigneeOptions}
                  selected={filters.assignees.map((assignee) => assignee.id)}
                  onChange={(value) => setAssigneeIds(value as string[])}
                  placeholder={t('common.assignees')}
                  searchPlaceholder={t('common.search_members')}
                  emptyText={t('common.no_members_found')}
                  className="[&_button]:h-9"
                />
              </FilterPickerField>

              <FilterPickerField
                icon={<Tag className="h-3.5 w-3.5" />}
                label={t('common.labels')}
                badge={
                  filters.labels.length ? (
                    <Badge variant="secondary">{filters.labels.length}</Badge>
                  ) : null
                }
              >
                <Combobox
                  mode="multiple"
                  options={labelOptions}
                  selected={filters.labels.map((label) => label.id)}
                  onChange={(value) => setLabelIds(value as string[])}
                  placeholder={t('common.labels')}
                  searchPlaceholder={t('common.search_labels')}
                  emptyText={t('common.no_labels_found')}
                  className="[&_button]:h-9"
                />
              </FilterPickerField>

              {availableProjects.length > 0 && (
                <FilterPickerField
                  icon={<Hash className="h-3.5 w-3.5" />}
                  label={t('common.projects')}
                  badge={
                    filters.projects.length ? (
                      <Badge variant="secondary">
                        {filters.projects.length}
                      </Badge>
                    ) : null
                  }
                >
                  <Combobox
                    mode="multiple"
                    options={projectOptions}
                    selected={filters.projects.map((project) => project.id)}
                    onChange={(value) => setProjectIds(value as string[])}
                    placeholder={t('common.projects')}
                    searchPlaceholder={t('common.search_projects')}
                    emptyText={t('common.empty')}
                    className="[&_button]:h-9"
                  />
                </FilterPickerField>
              )}

              <FilterPickerField
                icon={<Flag className="h-3.5 w-3.5" />}
                label={t('common.priority')}
                badge={
                  filters.priorities.length ? (
                    <Badge variant="secondary">
                      {filters.priorities.length}
                    </Badge>
                  ) : null
                }
              >
                <Combobox
                  mode="multiple"
                  options={priorityOptions}
                  selected={filters.priorities}
                  onChange={(value) => setPriorityValues(value as string[])}
                  placeholder={t('common.priority')}
                  searchPlaceholder={t('common.search_tasks')}
                  className="[&_button]:h-9"
                />
              </FilterPickerField>

              <FilterPickerField
                icon={<CalendarIcon className="h-3.5 w-3.5" />}
                label={t('common.due_date')}
                badge={
                  filters.dueDateRange ? (
                    <Badge variant="secondary">1</Badge>
                  ) : null
                }
              >
                <div className="space-y-2">
                  <div className="flex min-w-0 items-center gap-2 rounded-md border bg-muted/20 px-2 py-1.5 text-muted-foreground text-xs">
                    <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 truncate">{dueDateSummary}</span>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                    <Input
                      aria-label={t('common.from')}
                      className="h-9 min-w-0"
                      type="date"
                      value={formatDateInputValue(filters.dueDateRange?.from)}
                      onChange={(event) => {
                        const nextFrom = parseDateInputValue(
                          event.target.value
                        );
                        const nextTo = filters.dueDateRange?.to;

                        onFiltersChange({
                          ...filters,
                          dueDateRange:
                            nextFrom || nextTo
                              ? { from: nextFrom, to: nextTo }
                              : null,
                        });
                      }}
                    />
                    <Input
                      aria-label={t('common.to')}
                      className="h-9 min-w-0"
                      type="date"
                      value={formatDateInputValue(filters.dueDateRange?.to)}
                      onChange={(event) => {
                        const nextFrom = filters.dueDateRange?.from;
                        const nextTo = parseDateInputValue(event.target.value);

                        onFiltersChange({
                          ...filters,
                          dueDateRange:
                            nextFrom || nextTo
                              ? { from: nextFrom, to: nextTo }
                              : null,
                        });
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      aria-label={t('common.clear')}
                      onClick={() =>
                        onFiltersChange({
                          ...filters,
                          dueDateRange: null,
                        })
                      }
                      disabled={!filters.dueDateRange}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </FilterPickerField>

              {hasFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={clearAllFilters}
                  className="h-8 w-full justify-start gap-2 text-dynamic-red/80 hover:text-dynamic-red"
                >
                  <X className="h-4 w-4" />
                  {t('common.clear_all_filters')}
                </Button>
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}
