'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Calendar as CalendarIcon,
  Check,
  Filter,
  Flag,
  Hash,
  Tag,
  User,
  UserStar,
  Users,
  UserX,
  X,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Calendar } from '@tuturuuu/ui/calendar';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useWorkspaceMembers } from '@tuturuuu/ui/hooks/use-workspace-members';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type {
  SortOption,
  TaskAssignee,
  TaskFilters,
  TaskLabel,
  TaskProject,
} from '../../shared/task-filter.types';

// Re-export types for backward compatibility
export type { SortOption, TaskAssignee, TaskFilters, TaskLabel, TaskProject };

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

export function TaskFilter({
  wsId,
  currentUserId,
  filters,
  onFiltersChange,
}: Props) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  // Fetch available labels
  const { data: availableLabels = [] } = useQuery({
    queryKey: ['workspace-labels', wsId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/labels`);
      if (!response.ok) throw new Error('Failed to fetch labels');
      return response.json() as Promise<TaskLabel[]>;
    },
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
      const supabase = createClient();
      const { data } = await supabase
        .from('task_projects')
        .select('id, name')
        .eq('ws_id', wsId)
        .eq('deleted', false);

      return (data || []) as TaskProject[];
    },
    enabled: !!wsId,
  });

  const toggleLabel = (label: TaskLabel) => {
    const isSelected = filters.labels.some((l) => l.id === label.id);
    onFiltersChange({
      ...filters,
      labels: isSelected
        ? filters.labels.filter((l) => l.id !== label.id)
        : [...filters.labels, label],
    });
  };

  const toggleAssignee = (assignee: TaskAssignee) => {
    const isSelected = filters.assignees.some((a) => a.id === assignee.id);
    const isCurrentUser = currentUserId === assignee.id;

    const newAssignees = isSelected
      ? filters.assignees.filter((a) => a.id !== assignee.id)
      : [...filters.assignees, assignee];

    // Determine if "Assigned to me" should be checked:
    // - If toggling current user: sync with their selection state
    // - If adding a non-current-user: uncheck "Assigned to me"
    // - If removing someone while current user remains: keep "Assigned to me" if only current user left
    const shouldIncludeMyTasks = isCurrentUser
      ? !isSelected
      : newAssignees.length === 1 && newAssignees[0]?.id === currentUserId;

    onFiltersChange({
      ...filters,
      assignees: newAssignees,
      includeMyTasks: shouldIncludeMyTasks,
      // Auto-deselect "Unassigned" when selecting any assignee
      includeUnassigned:
        newAssignees.length > 0 ? false : filters.includeUnassigned,
    });
  };

  const toggleProject = (project: TaskProject) => {
    const isSelected = filters.projects.some((p) => p.id === project.id);
    onFiltersChange({
      ...filters,
      projects: isSelected
        ? filters.projects.filter((p) => p.id !== project.id)
        : [...filters.projects, project],
    });
  };

  const togglePriority = (priority: TaskPriority) => {
    const isSelected = filters.priorities.includes(priority);
    onFiltersChange({
      ...filters,
      priorities: isSelected
        ? filters.priorities.filter((p) => p !== priority)
        : [...filters.priorities, priority],
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
      sortBy: undefined,
    });
  };

  const hasFilters =
    filters.labels.length > 0 ||
    filters.assignees.length > 0 ||
    filters.projects.length > 0 ||
    filters.priorities.length > 0 ||
    filters.dueDateRange !== null ||
    filters.estimationRange !== null ||
    filters.includeMyTasks ||
    filters.includeUnassigned;

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
    (filters.includeUnassigned ? 1 : 0);

  return (
    <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            size="xs"
            variant="outline"
            className={cn(
              'text-[10px] sm:text-xs',
              hasFilters && 'border-primary/50 bg-primary/5'
            )}
          >
            <Filter className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            <span className="hidden sm:inline">{t('common.filters')}</span>
            {hasFilters && (
              <Badge
                variant="secondary"
                className="h-3.5 px-1 text-[9px] sm:h-4 sm:text-[10px]"
              >
                {filterCount}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[280px] sm:w-[320px]" align="start">
          <ScrollArea className="max-h-[70vh] sm:max-h-[400px]">
            {/* My Tasks */}
            {currentUserId && (
              <>
                <DropdownMenuLabel className="flex items-center gap-2 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                  <User className="h-3.5 w-3.5" />
                  {t('common.quick_filters')}
                </DropdownMenuLabel>
                <div className="space-y-1 px-2 pb-2">
                  <label className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent">
                    <Checkbox
                      checked={filters.includeMyTasks}
                      onCheckedChange={(checked) => {
                        const currentUser = availableAssignees.find(
                          (a) => a.id === currentUserId
                        );

                        onFiltersChange({
                          ...filters,
                          includeMyTasks: !!checked,
                          // Replace all assignees with only current user when checked
                          assignees:
                            checked && currentUser ? [currentUser] : [],
                          // Auto-deselect "Unassigned" when selecting "Assigned to me"
                          includeUnassigned: checked
                            ? false
                            : filters.includeUnassigned,
                        });
                      }}
                    />
                    <UserStar className="h-4 w-4 text-dynamic-yellow" />
                    <span>{t('common.assigned_to_me')}</span>
                  </label>
                  <label className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent">
                    <Checkbox
                      checked={filters.includeUnassigned}
                      onCheckedChange={(checked) =>
                        onFiltersChange({
                          ...filters,
                          includeUnassigned: !!checked,
                          // Auto-deselect all assignees when selecting "Unassigned"
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
                <DropdownMenuSeparator />
              </>
            )}

            {/* Assignees */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2 py-2.5">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1">{t('common.assignees')}</span>
                {filters.assignees.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="h-4 min-w-[1.25rem] justify-center px-1 text-[10px]"
                  >
                    {filters.assignees.length}
                  </Badge>
                )}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-[260px] p-0">
                {availableAssignees.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    {t('common.no_members_found')}
                  </div>
                ) : (
                  <div className="max-h-[240px] overflow-y-auto">
                    <div className="p-1">
                      {availableAssignees.map((assignee) => (
                        <DropdownMenuItem
                          key={assignee.id}
                          onClick={() => toggleAssignee(assignee)}
                          className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2"
                        >
                          <Checkbox
                            checked={filters.assignees.some(
                              (a) => a.id === assignee.id
                            )}
                            className="pointer-events-none"
                          />
                          <Avatar className="h-6 w-6 border">
                            {assignee.avatar_url && (
                              <AvatarImage src={assignee.avatar_url} />
                            )}
                            <AvatarFallback className="font-medium text-[10px]">
                              {getInitials(
                                assignee.display_name || assignee.email || ''
                              )}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-1 flex-col overflow-hidden">
                            <span className="truncate font-medium text-sm">
                              {assignee.display_name || assignee.email}
                            </span>
                            {assignee.display_name && assignee.email && (
                              <span className="truncate text-muted-foreground text-xs">
                                {assignee.email}
                              </span>
                            )}
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </div>
                  </div>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            {/* Labels */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2 py-2.5">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1">{t('common.labels')}</span>
                {filters.labels.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="h-4 min-w-[1.25rem] justify-center px-1 text-[10px]"
                  >
                    {filters.labels.length}
                  </Badge>
                )}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-[240px] p-0">
                {availableLabels.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    {t('common.no_labels_found')}
                  </div>
                ) : (
                  <div className="max-h-[240px] overflow-y-auto">
                    <div className="p-1">
                      {availableLabels.map((label) => (
                        <DropdownMenuItem
                          key={label.id}
                          onClick={() => toggleLabel(label)}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2"
                        >
                          <Checkbox
                            checked={filters.labels.some(
                              (l) => l.id === label.id
                            )}
                            className="pointer-events-none"
                          />
                          <Badge
                            style={getColorStyles(label.color)}
                            className="border-0 font-medium text-xs"
                          >
                            {label.name}
                          </Badge>
                        </DropdownMenuItem>
                      ))}
                    </div>
                  </div>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            {/* Projects */}
            {availableProjects.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2 py-2.5">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">{t('common.projects')}</span>
                  {filters.projects.length > 0 && (
                    <Badge
                      variant="secondary"
                      className="h-4 min-w-[1.25rem] justify-center px-1 text-[10px]"
                    >
                      {filters.projects.length}
                    </Badge>
                  )}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-[240px] p-0">
                  <div className="max-h-[240px] overflow-y-auto">
                    <div className="p-1">
                      {availableProjects.map((project) => (
                        <DropdownMenuItem
                          key={project.id}
                          onClick={() => toggleProject(project)}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2"
                        >
                          <Checkbox
                            checked={filters.projects.some(
                              (p) => p.id === project.id
                            )}
                            className="pointer-events-none"
                          />
                          <span className="font-medium text-sm">
                            {project.name}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </div>
                  </div>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}

            {/* Priority */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2 py-2.5">
                <Flag className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1">{t('common.priority')}</span>
                {filters.priorities.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="h-4 min-w-[1.25rem] justify-center px-1 text-[10px]"
                  >
                    {filters.priorities.length}
                  </Badge>
                )}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-[200px] p-0">
                <div className="p-1">
                  {PRIORITIES.map((priority) => (
                    <DropdownMenuItem
                      key={priority.value}
                      onClick={() => togglePriority(priority.value)}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2"
                    >
                      <Checkbox
                        checked={filters.priorities.includes(priority.value)}
                        className="pointer-events-none"
                      />
                      <Flag className={cn(priority.color, 'h-4 w-4')} />
                      <span className="font-medium text-sm">
                        {t(priority.labelKey as any)}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            {/* Due Date */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2 py-2.5">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1">{t('common.due_date')}</span>
                {filters.dueDateRange && (
                  <Check className="h-3.5 w-3.5 text-primary" />
                )}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-auto p-0">
                <Calendar
                  mode="range"
                  selected={
                    filters.dueDateRange
                      ? {
                          from: filters.dueDateRange.from,
                          to: filters.dueDateRange.to,
                        }
                      : undefined
                  }
                  onSelect={(range) =>
                    onFiltersChange({
                      ...filters,
                      dueDateRange: range
                        ? { from: range.from, to: range.to }
                        : null,
                    })
                  }
                  numberOfMonths={1}
                  className="rounded-md border-0"
                />
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            {/* Clear All */}
            {hasFilters && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={clearAllFilters}
                  className="gap-2 text-dynamic-red/80 focus:text-dynamic-red"
                >
                  <X className="h-4 w-4" />
                  {t('common.clear_all_filters')}
                </DropdownMenuItem>
              </>
            )}
          </ScrollArea>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Active filter chips */}
      {/* {filters.labels.map((label) => (
        <Badge
          key={label.id}
          style={getColorStyles(label.color)}
          className="h-5 cursor-pointer border-0 px-1.5 text-[10px] hover:opacity-80 sm:h-6 sm:px-2 sm:text-xs"
          onClick={() => toggleLabel(label)}
        >
          {label.name}
          <X className="ml-0.5 h-2.5 w-2.5 sm:ml-1 sm:h-3 sm:w-3" />
        </Badge>
      ))}
      {filters.assignees.map((assignee) => (
        <Badge
          key={assignee.id}
          variant="secondary"
          className="h-5 cursor-pointer px-1.5 text-[10px] hover:opacity-80 sm:h-6 sm:px-2 sm:text-xs"
          onClick={() => toggleAssignee(assignee)}
        >
          {assignee.display_name || assignee.email}
          <X className="ml-0.5 h-2.5 w-2.5 sm:ml-1 sm:h-3 sm:w-3" />
        </Badge>
      ))}
      {filters.projects.map((project) => (
        <Badge
          key={project.id}
          variant="outline"
          className="h-5 cursor-pointer px-1.5 text-[10px] hover:opacity-80 sm:h-6 sm:px-2 sm:text-xs"
          onClick={() => toggleProject(project)}
        >
          {project.name}
          <X className="ml-0.5 h-2.5 w-2.5 sm:ml-1 sm:h-3 sm:w-3" />
        </Badge>
      ))}
      {filters.priorities.map((priority) => {
        const priorityConfig = PRIORITIES.find((p) => p.value === priority);
        return (
          <Badge
            key={priority}
            variant="outline"
            className="h-5 cursor-pointer px-1.5 text-[10px] hover:opacity-80 sm:h-6 sm:px-2 sm:text-xs"
            onClick={() => togglePriority(priority)}
          >
            {priorityConfig?.label}
            <X className="ml-0.5 h-2.5 w-2.5 sm:ml-1 sm:h-3 sm:w-3" />
          </Badge>
        );
      })} */}
    </div>
  );
}
