'use client';

import {
  AlertTriangle,
  Box,
  Calendar,
  Check,
  ChevronDown,
  Flag,
  ListTodo,
  Pen,
  Plus,
  Tag,
  Timer,
  Users,
  X,
} from '@tuturuuu/icons';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { computeAccessibleLabelStyles } from '@tuturuuu/utils/label-colors';
import dayjs from 'dayjs';
import { useCallback, useMemo, useState } from 'react';
import { PRIORITY_BADGE_COLORS } from '../../utils/taskConstants';
import {
  getPriorityIcon,
  getPriorityLabel,
} from '../../utils/taskPriorityUtils';
import { ClearMenuItem } from '../clear-menu-item';
import { EmptyStateCard } from '../empty-state-card';
import {
  buildEstimationIndices,
  mapEstimationPoints,
} from '../estimation-mapping';
import type { WorkspaceTaskLabel } from '../task-edit-dialog/types';
import { UserAvatar } from '../user-avatar';

interface TaskPropertiesSectionProps {
  // State
  priority: TaskPriority | null;
  startDate: Date | undefined;
  endDate: Date | undefined;
  estimationPoints: number | null | undefined;
  selectedLabels: WorkspaceTaskLabel[];
  selectedProjects: any[];
  selectedListId: string;
  selectedAssignees: any[];
  isLoading: boolean;
  isPersonalWorkspace: boolean;

  // Data
  availableLists: TaskList[];
  availableLabels: WorkspaceTaskLabel[];
  taskProjects: any[];
  workspaceMembers: any[];
  boardConfig: any;

  // Handlers
  onPriorityChange: (priority: TaskPriority | null) => void;
  onStartDateChange: (date: Date | undefined) => void;
  onEndDateChange: (date: Date | undefined) => void;
  onEstimationChange: (points: number | null) => void;
  onLabelToggle: (label: WorkspaceTaskLabel) => void;
  onProjectToggle: (project: any) => void;
  onListChange: (listId: string) => void;
  onAssigneeToggle: (assignee: any) => void;
  onQuickDueDate: (days: number | null) => void;
  onShowNewLabelDialog: () => void;
  onShowNewProjectDialog: () => void;
  onShowEstimationConfigDialog: () => void;
}

export function TaskPropertiesSection(props: TaskPropertiesSectionProps) {
  const {
    priority,
    startDate,
    endDate,
    estimationPoints,
    selectedLabels,
    selectedProjects,
    selectedListId,
    selectedAssignees,
    isLoading,
    isPersonalWorkspace,
    availableLists,
    availableLabels,
    taskProjects,
    workspaceMembers,
    boardConfig,
    onPriorityChange,
    onStartDateChange,
    onEndDateChange,
    onEstimationChange,
    onLabelToggle,
    onProjectToggle,
    onListChange,
    onAssigneeToggle,
    onQuickDueDate,
    onShowNewLabelDialog,
    onShowNewProjectDialog,
    onShowEstimationConfigDialog,
  } = props;

  const [isMetadataExpanded, setIsMetadataExpanded] = useState(true);
  const [isPriorityPopoverOpen, setIsPriorityPopoverOpen] = useState(false);
  const [isDueDatePopoverOpen, setIsDueDatePopoverOpen] = useState(false);
  const [isEstimationPopoverOpen, setIsEstimationPopoverOpen] = useState(false);
  const [isLabelsPopoverOpen, setIsLabelsPopoverOpen] = useState(false);
  const [isProjectsPopoverOpen, setIsProjectsPopoverOpen] = useState(false);
  const [isAssigneesPopoverOpen, setIsAssigneesPopoverOpen] = useState(false);
  const [isListPopoverOpen, setIsListPopoverOpen] = useState(false);

  const estimationIndices: number[] = useMemo(() => {
    return boardConfig?.estimation_type
      ? buildEstimationIndices({
          extended: boardConfig?.extended_estimation,
          allowZero: boardConfig?.allow_zero_estimates,
        })
      : [];
  }, [
    boardConfig?.estimation_type,
    boardConfig?.extended_estimation,
    boardConfig?.allow_zero_estimates,
  ]);

  const handleEndDateChange = useCallback(
    (date: Date | undefined) => {
      if (date) {
        let selectedDate = dayjs(date);
        if (
          selectedDate.hour() === 0 &&
          selectedDate.minute() === 0 &&
          selectedDate.second() === 0 &&
          selectedDate.millisecond() === 0
        ) {
          selectedDate = selectedDate.endOf('day');
        }
        onEndDateChange(selectedDate.toDate());
      } else {
        onEndDateChange(undefined);
      }
    },
    [onEndDateChange]
  );

  return (
    <div className="border-y bg-muted/30">
      {/* Header with toggle button */}
      <button
        type="button"
        onClick={() => setIsMetadataExpanded(!isMetadataExpanded)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-muted/50 md:px-8"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
              !isMetadataExpanded && '-rotate-90'
            )}
          />
          <span className="shrink-0 font-semibold text-foreground text-sm">
            Properties
          </span>

          {/* Summary badges when collapsed */}
          {!isMetadataExpanded && (
            <div className="scrollbar-hide ml-2 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
              {priority && (
                <Badge
                  variant="secondary"
                  className={cn(
                    'h-5 shrink-0 gap-1 border px-2 font-medium text-[10px]',
                    PRIORITY_BADGE_COLORS[priority]
                  )}
                >
                  <Flag className="h-2.5 w-2.5" />
                  {getPriorityLabel(priority)}
                </Badge>
              )}
              {(startDate || endDate) && (
                <Badge
                  variant="secondary"
                  className="h-5 shrink-0 gap-1 border border-dynamic-orange/30 bg-dynamic-orange/10 px-2 font-medium text-[10px] text-dynamic-orange"
                >
                  <Calendar className="h-2.5 w-2.5" />
                  {startDate && endDate
                    ? 'Scheduled'
                    : endDate
                      ? 'Due'
                      : 'Start'}
                </Badge>
              )}
              {estimationPoints != null && (
                <Badge
                  variant="secondary"
                  className="h-5 shrink-0 gap-1 border border-dynamic-purple/30 bg-dynamic-purple/10 px-2 font-medium text-[10px] text-dynamic-purple"
                >
                  <Timer className="h-2.5 w-2.5" />
                  Est.
                </Badge>
              )}
              {selectedLabels.length > 0 && (
                <Badge
                  variant="secondary"
                  className="h-5 shrink-0 gap-1 border border-dynamic-indigo/30 bg-dynamic-indigo/10 px-2 font-medium text-[10px] text-dynamic-indigo"
                >
                  <Tag className="h-2.5 w-2.5" />
                  {selectedLabels.length}
                </Badge>
              )}
              {selectedProjects.length > 0 && (
                <Badge
                  variant="secondary"
                  className="h-5 shrink-0 gap-1 border border-dynamic-sky/30 bg-dynamic-sky/10 px-2 font-medium text-[10px] text-dynamic-sky"
                >
                  <Box className="h-2.5 w-2.5" />
                  {selectedProjects.length === 1
                    ? selectedProjects[0]?.name
                    : selectedProjects.length}
                </Badge>
              )}
              {selectedListId && (
                <Badge
                  variant="secondary"
                  className="h-5 shrink-0 gap-1 border border-dynamic-green/30 bg-dynamic-green/10 px-2 font-medium text-[10px] text-dynamic-green"
                >
                  <ListTodo className="h-2.5 w-2.5" />
                  {availableLists?.find((l) => l.id === selectedListId)?.name ||
                    'List'}
                </Badge>
              )}
              {selectedAssignees.length > 0 && !isPersonalWorkspace && (
                <Badge
                  variant="secondary"
                  className="h-5 shrink-0 gap-1 border border-dynamic-cyan/30 bg-dynamic-cyan/10 px-2 font-medium text-[10px] text-dynamic-cyan"
                >
                  <Users className="h-2.5 w-2.5" />
                  {selectedAssignees.length}
                </Badge>
              )}
            </div>
          )}
        </div>
      </button>

      {/* Expandable badges section */}
      {isMetadataExpanded && (
        <div className="border-t px-4 py-3 md:px-8">
          <div className="flex flex-wrap items-center gap-2">
            {/* Priority Badge */}
            <Popover
              open={isPriorityPopoverOpen}
              onOpenChange={setIsPriorityPopoverOpen}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 font-medium text-xs transition-colors',
                    priority
                      ? PRIORITY_BADGE_COLORS[priority]
                      : 'border-input bg-background text-foreground hover:bg-muted'
                  )}
                >
                  {priority ? (
                    getPriorityIcon(priority, 'h-3.5 w-3.5')
                  ) : (
                    <Flag className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {priority ? getPriorityLabel(priority) : 'Priority'}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-0">
                <div className="p-1">
                  {[
                    {
                      value: 'critical',
                      label: 'Urgent',
                      color: 'text-dynamic-red',
                    },
                    {
                      value: 'high',
                      label: 'High',
                      color: 'text-dynamic-orange',
                    },
                    {
                      value: 'normal',
                      label: 'Medium',
                      color: 'text-dynamic-yellow',
                    },
                    { value: 'low', label: 'Low', color: 'text-dynamic-blue' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        onPriorityChange(opt.value as TaskPriority);
                        setIsPriorityPopoverOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted',
                        priority === opt.value && 'bg-muted font-medium'
                      )}
                    >
                      {getPriorityIcon(
                        opt.value as TaskPriority,
                        cn('h-4 w-4', opt.color)
                      )}
                      <span className="flex-1">{opt.label}</span>
                      {priority === opt.value && (
                        <Check className="h-4 w-4 shrink-0 text-primary" />
                      )}
                    </button>
                  ))}
                  {priority && (
                    <ClearMenuItem
                      label="Clear priority"
                      onClick={() => {
                        onPriorityChange(null);
                        setIsPriorityPopoverOpen(false);
                      }}
                    />
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* List Badge */}
            <Popover
              open={isListPopoverOpen}
              onOpenChange={setIsListPopoverOpen}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 font-medium text-xs transition-colors',
                    selectedListId
                      ? 'border-dynamic-green/30 bg-dynamic-green/15 text-dynamic-green hover:border-dynamic-green/50 hover:bg-dynamic-green/20'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-muted hover:text-foreground'
                  )}
                >
                  <ListTodo className="h-3.5 w-3.5" />
                  <span>
                    {selectedListId
                      ? availableLists?.find((l) => l.id === selectedListId)
                          ?.name || 'List'
                      : 'List'}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-0">
                {!availableLists || availableLists.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    No lists found
                  </div>
                ) : (
                  <div
                    className="max-h-60 overflow-y-auto overscroll-contain"
                    onWheel={(e) => e.stopPropagation()}
                  >
                    <div className="p-1">
                      {availableLists.map((list) => (
                        <button
                          key={list.id}
                          type="button"
                          onClick={() => {
                            onListChange(list.id);
                            setIsListPopoverOpen(false);
                          }}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted',
                            selectedListId === list.id && 'bg-muted font-medium'
                          )}
                        >
                          <span className="flex-1">{list.name}</span>
                          {selectedListId === list.id && (
                            <Check className="h-4 w-4 shrink-0 text-primary" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {/* Dates Badge */}
            <Popover
              open={isDueDatePopoverOpen}
              onOpenChange={setIsDueDatePopoverOpen}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 font-medium text-xs transition-colors',
                    startDate || endDate
                      ? 'border-dynamic-orange/30 bg-dynamic-orange/15 text-dynamic-orange hover:border-dynamic-orange/50 hover:bg-dynamic-orange/20'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Calendar className="h-3.5 w-3.5" />
                  <span>
                    {startDate || endDate
                      ? `${startDate ? new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No start'} → ${endDate ? new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No due'}`
                      : 'Dates'}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-0">
                <div className="rounded-lg p-3.5">
                  <div className="space-y-3">
                    {/* Start Date */}
                    <div className="space-y-1.5">
                      <Label className="font-normal text-muted-foreground text-xs">
                        Start Date
                      </Label>
                      <DateTimePicker
                        date={startDate}
                        setDate={onStartDateChange}
                        showTimeSelect={true}
                        allowClear={true}
                        showFooterControls={true}
                        maxDate={endDate}
                      />
                    </div>

                    {/* Due Date */}
                    <div className="space-y-1.5">
                      <Label className="font-normal text-muted-foreground text-xs">
                        Due Date
                      </Label>
                      <DateTimePicker
                        date={endDate}
                        setDate={handleEndDateChange}
                        showTimeSelect={true}
                        allowClear={true}
                        showFooterControls={true}
                        minDate={startDate}
                      />

                      {/* Date Range Warning */}
                      {startDate && endDate && startDate > endDate && (
                        <div className="flex items-center gap-2 rounded-md border border-dynamic-orange/30 bg-dynamic-orange/10 px-3 py-2 text-xs">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-dynamic-orange" />
                          <span className="text-dynamic-orange">
                            Start date is after due date
                          </span>
                        </div>
                      )}

                      {/* Quick Due Date Actions */}
                      <div className="space-y-1.5 pt-2">
                        <Label className="font-normal text-muted-foreground text-xs">
                          Quick Actions
                        </Label>
                        <div className="grid grid-cols-2 gap-1.5 md:gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => onQuickDueDate(0)}
                            disabled={isLoading}
                            className="h-7 text-[11px] transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5 md:text-xs"
                          >
                            Today
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => onQuickDueDate(1)}
                            disabled={isLoading}
                            className="h-7 text-[11px] transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5 md:text-xs"
                          >
                            Tomorrow
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => {
                              const daysUntilEndOfWeek = 6 - dayjs().day();
                              onQuickDueDate(daysUntilEndOfWeek);
                            }}
                            disabled={isLoading}
                            className="h-7 text-[11px] transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5 md:text-xs"
                          >
                            This week
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => onQuickDueDate(7)}
                            disabled={isLoading}
                            className="h-7 text-[11px] transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5 md:text-xs"
                          >
                            Next week
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Estimation Points Badge */}
            <Popover
              open={isEstimationPopoverOpen}
              onOpenChange={setIsEstimationPopoverOpen}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 font-medium text-xs transition-colors',
                    estimationPoints != null
                      ? 'border-dynamic-purple/30 bg-dynamic-purple/15 text-dynamic-purple hover:border-dynamic-purple/50 hover:bg-dynamic-purple/20'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Timer className="h-3.5 w-3.5" />
                  <span>
                    {boardConfig?.estimation_type
                      ? estimationPoints != null
                        ? mapEstimationPoints(
                            estimationPoints,
                            boardConfig.estimation_type
                          )
                        : 'Estimate'
                      : 'Estimate'}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-0">
                {!boardConfig?.estimation_type ? (
                  <EmptyStateCard
                    title="No estimation configured yet"
                    description="Configure estimation for this board"
                    actionLabel="Configure"
                    ActionIcon={Pen}
                    onAction={() => {
                      setIsEstimationPopoverOpen(false);
                      onShowEstimationConfigDialog();
                    }}
                  />
                ) : (
                  <div className="p-1">
                    {estimationIndices.map((idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          onEstimationChange(idx);
                          setIsEstimationPopoverOpen(false);
                        }}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted',
                          estimationPoints === idx && 'bg-muted font-medium'
                        )}
                      >
                        <Timer className="h-4 w-4 text-dynamic-purple" />
                        <span className="flex-1">
                          {mapEstimationPoints(
                            idx,
                            boardConfig.estimation_type
                          )}
                        </span>
                        {estimationPoints === idx && (
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                        )}
                      </button>
                    ))}
                    {estimationPoints != null && (
                      <ClearMenuItem
                        label="Clear estimate"
                        onClick={() => {
                          onEstimationChange(null);
                          setIsEstimationPopoverOpen(false);
                        }}
                      />
                    )}
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {/* Labels Badge */}
            <Popover
              open={isLabelsPopoverOpen}
              onOpenChange={setIsLabelsPopoverOpen}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 font-medium text-xs transition-colors',
                    selectedLabels.length > 0
                      ? 'border-dynamic-indigo/30 bg-dynamic-indigo/15 text-dynamic-indigo hover:border-dynamic-indigo/50 hover:bg-dynamic-indigo/20'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Tag className="h-3.5 w-3.5" />
                  <span>
                    {selectedLabels.length === 0
                      ? 'Labels'
                      : selectedLabels.length === 1
                        ? selectedLabels[0]?.name
                        : `${selectedLabels.length} labels`}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-0">
                {availableLabels.length === 0 ? (
                  <EmptyStateCard
                    title="No labels configured yet"
                    description="Create labels to organize your tasks"
                    actionLabel="Create Label"
                    ActionIcon={Plus}
                    onAction={() => {
                      setIsLabelsPopoverOpen(false);
                      onShowNewLabelDialog();
                    }}
                  />
                ) : (
                  <>
                    {selectedLabels.length > 0 && (
                      <div className="border-b p-2">
                        <div className="flex flex-wrap gap-1.5">
                          {selectedLabels.map((label) => {
                            const styles = computeAccessibleLabelStyles(
                              label.color
                            );
                            return (
                              <Badge
                                key={label.id}
                                variant="secondary"
                                className="h-6 cursor-pointer gap-1 px-2 text-xs transition-opacity hover:opacity-80"
                                style={
                                  styles
                                    ? {
                                        backgroundColor: styles.bg,
                                        borderColor: styles.border,
                                        color: styles.text,
                                      }
                                    : undefined
                                }
                                onClick={() => onLabelToggle(label)}
                              >
                                {label.name}
                                <X className="h-2.5 w-2.5" />
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div
                      className="max-h-60 overflow-y-auto overscroll-contain"
                      onWheel={(e) => e.stopPropagation()}
                    >
                      <div className="p-1">
                        {availableLabels
                          .filter(
                            (l) => !selectedLabels.some((sl) => sl.id === l.id)
                          )
                          .map((label) => {
                            const styles = computeAccessibleLabelStyles(
                              label.color
                            );
                            return (
                              <button
                                key={label.id}
                                type="button"
                                onClick={() => onLabelToggle(label)}
                                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                              >
                                <span
                                  className="h-3 w-3 shrink-0 rounded-full"
                                  style={{
                                    backgroundColor: styles?.bg || '#ccc',
                                  }}
                                />
                                <span className="flex-1">{label.name}</span>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                    <div className="border-t p-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setIsLabelsPopoverOpen(false);
                          onShowNewLabelDialog();
                        }}
                        className="h-8 w-full justify-start"
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Create New Label
                      </Button>
                    </div>
                  </>
                )}
              </PopoverContent>
            </Popover>

            {/* Projects Badge */}
            <Popover
              open={isProjectsPopoverOpen}
              onOpenChange={setIsProjectsPopoverOpen}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 font-medium text-xs transition-colors',
                    selectedProjects.length > 0
                      ? 'border-dynamic-sky/30 bg-dynamic-sky/15 text-dynamic-sky hover:border-dynamic-sky/50 hover:bg-dynamic-sky/20'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Box className="h-3.5 w-3.5" />
                  <span>
                    {selectedProjects.length === 0
                      ? 'Projects'
                      : selectedProjects.length === 1
                        ? selectedProjects[0]?.name
                        : `${selectedProjects.length} projects`}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-0">
                {taskProjects.length === 0 ? (
                  <EmptyStateCard
                    title="No projects configured yet"
                    description="Create projects to coordinate tasks across boards"
                    actionLabel="Create Project"
                    ActionIcon={Plus}
                    onAction={() => {
                      setIsProjectsPopoverOpen(false);
                      onShowNewProjectDialog();
                    }}
                  />
                ) : (
                  <>
                    {selectedProjects.length > 0 && (
                      <div className="border-b p-2">
                        <div className="flex flex-wrap gap-1.5">
                          {selectedProjects.map((project) => (
                            <Badge
                              key={project.id}
                              variant="secondary"
                              className="item-center h-auto cursor-pointer gap-1 whitespace-normal border-dynamic-sky/30 bg-dynamic-sky/10 px-2 text-dynamic-sky text-xs transition-opacity hover:opacity-80"
                              onClick={() => onProjectToggle(project)}
                            >
                              <span className="wrap-break-word">
                                {project.name}
                              </span>
                              <X className="h-2.5 w-2.5 shrink-0" />
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    <div
                      className="max-h-60 overflow-y-auto overscroll-contain"
                      onWheel={(e) => e.stopPropagation()}
                    >
                      <div className="p-1">
                        {taskProjects
                          .filter(
                            (p) =>
                              !selectedProjects.some((sp) => sp.id === p.id)
                          )
                          .map((project) => (
                            <button
                              key={project.id}
                              type="button"
                              onClick={() => onProjectToggle(project)}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                            >
                              <Box className="h-4 w-4 text-dynamic-sky" />
                              <span className="wrap-break-word flex-1 whitespace-normal">
                                {project.name}
                              </span>
                            </button>
                          ))}
                      </div>
                    </div>
                    <div className="border-t p-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setIsProjectsPopoverOpen(false);
                          onShowNewProjectDialog();
                        }}
                        className="h-8 w-full justify-start"
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Create New Project
                      </Button>
                    </div>
                  </>
                )}
              </PopoverContent>
            </Popover>

            {/* Assignees Badge */}
            {!isPersonalWorkspace && (
              <Popover
                open={isAssigneesPopoverOpen}
                onOpenChange={setIsAssigneesPopoverOpen}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 font-medium text-xs transition-colors',
                      selectedAssignees.length > 0
                        ? 'border-dynamic-cyan/30 bg-dynamic-cyan/15 text-dynamic-cyan hover:border-dynamic-cyan/50 hover:bg-dynamic-cyan/20'
                        : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Users className="h-3.5 w-3.5" />
                    <span>
                      {selectedAssignees.length === 0
                        ? 'Assignees'
                        : selectedAssignees.length === 1
                          ? selectedAssignees[0]?.display_name || 'Unknown'
                          : `${selectedAssignees.length} assignees`}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-0">
                  {workspaceMembers.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      No members found
                    </div>
                  ) : (
                    <>
                      {selectedAssignees.length > 0 && (
                        <div className="border-b p-2">
                          <div className="flex flex-wrap gap-1.5">
                            {selectedAssignees.map((assignee) => (
                              <Badge
                                key={assignee.id || assignee.user_id}
                                variant="secondary"
                                className="h-6 cursor-pointer gap-1.5 px-2 text-xs transition-opacity hover:opacity-80"
                                onClick={() => onAssigneeToggle(assignee)}
                              >
                                <UserAvatar user={assignee} size="xs" />
                                {assignee.display_name || 'Unknown'}
                                <X className="h-2.5 w-2.5" />
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      <div
                        className="max-h-60 overflow-y-auto overscroll-contain"
                        onWheel={(e) => e.stopPropagation()}
                      >
                        <div className="p-1">
                          {workspaceMembers
                            .filter(
                              (m) =>
                                !selectedAssignees.some(
                                  (a) => (a.id || a.user_id) === m.user_id
                                )
                            )
                            .map((member) => (
                              <button
                                key={member.user_id}
                                type="button"
                                onClick={() => onAssigneeToggle(member)}
                                className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                              >
                                <UserAvatar
                                  user={member}
                                  size="sm"
                                  className="shrink-0 border"
                                />
                                <span className="flex-1">
                                  {member.display_name || 'Unknown'}
                                </span>
                                <Plus className="h-4 w-4 shrink-0" />
                              </button>
                            ))}
                        </div>
                      </div>
                    </>
                  )}
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
