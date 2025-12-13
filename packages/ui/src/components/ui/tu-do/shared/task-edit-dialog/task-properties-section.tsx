'use client';

import {
  AlertCircle,
  AlertTriangle,
  Box,
  Briefcase,
  Calendar,
  CalendarClock,
  Check,
  CheckCircle,
  ChevronDown,
  Clock,
  Flag,
  ListTodo,
  Loader2,
  Minus,
  Pen,
  Plus,
  Save,
  Scissors,
  Tag,
  Timer,
  User,
  Users,
  X,
  Zap,
} from '@tuturuuu/icons';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { CalendarHoursType } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import { useCalendarPreferences } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Progress } from '@tuturuuu/ui/progress';
import { Switch } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import { computeAccessibleLabelStyles } from '@tuturuuu/utils/label-colors';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { SchedulingSettings } from '../task-edit-dialog/hooks/use-task-mutations';
import type { WorkspaceTaskLabel } from '../task-edit-dialog/types';
import { UserAvatar } from '../user-avatar';

// Scheduled calendar event type
export interface ScheduledCalendarEvent {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  scheduled_minutes: number;
  completed: boolean;
}

interface TaskPropertiesSectionProps {
  // IDs
  wsId: string;
  taskId?: string;
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
  isCreateMode: boolean;
  // Scheduling state
  totalDuration: number | null;
  isSplittable: boolean;
  minSplitDurationMinutes: number | null;
  maxSplitDurationMinutes: number | null;
  calendarHours: CalendarHoursType | null;
  autoSchedule: boolean;
  // Saved scheduling state (for comparison)
  savedSchedulingSettings?: SchedulingSettings;
  // Scheduled events for this task
  scheduledEvents?: ScheduledCalendarEvent[];

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
  // Scheduling handlers
  onTotalDurationChange: (duration: number | null) => void;
  onIsSplittableChange: (splittable: boolean) => void;
  onMinSplitDurationChange: (minutes: number | null) => void;
  onMaxSplitDurationChange: (minutes: number | null) => void;
  onCalendarHoursChange: (hourType: CalendarHoursType | null) => void;
  onAutoScheduleChange: (autoSchedule: boolean) => void;
  onSaveSchedulingSettings: (settings: SchedulingSettings) => Promise<boolean>;
  schedulingSaving: boolean;
}

// Calendar hours type options
const CALENDAR_HOURS_OPTIONS: {
  value: CalendarHoursType;
  label: string;
  icon: typeof Briefcase;
  description: string;
}[] = [
  {
    value: 'work_hours',
    label: 'Work Hours',
    icon: Briefcase,
    description: 'Schedule during work hours',
  },
  {
    value: 'meeting_hours',
    label: 'Meeting Hours',
    icon: Calendar,
    description: 'Schedule during meeting hours',
  },
  {
    value: 'personal_hours',
    label: 'Personal Hours',
    icon: User,
    description: 'Schedule during personal hours',
  },
];

// Format duration helper - rounds to avoid floating point issues
function formatDuration(totalMinutes: number): string {
  const roundedTotal = Math.round(totalMinutes);
  const hours = Math.floor(roundedTotal / 60);
  const minutes = roundedTotal % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

// Custom duration input component with better UX
interface DurationInputProps {
  value: number;
  onChange: (value: number, direction?: 'increment' | 'decrement') => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  label: string;
  className?: string;
  // For minute inputs that need to rollover to hours
  allowRollover?: boolean;
  canDecrement?: boolean;
}

function DurationInput({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  disabled = false,
  label,
  className,
  allowRollover = false,
  canDecrement,
}: DurationInputProps) {
  const handleIncrement = () => {
    if (allowRollover) {
      // For rollover mode, pass the would-be value and direction
      onChange(value + step, 'increment');
    } else {
      const newValue = Math.min(value + step, max);
      onChange(newValue);
    }
  };

  const handleDecrement = () => {
    if (allowRollover) {
      // For rollover mode, pass the would-be value and direction
      onChange(value - step, 'decrement');
    } else {
      const newValue = Math.max(value - step, min);
      onChange(newValue);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseInt(e.target.value, 10);
    if (Number.isNaN(parsed)) {
      onChange(min);
    } else {
      onChange(Math.max(min, Math.min(parsed, max)));
    }
  };

  // Determine if decrement is allowed
  const decrementDisabled = allowRollover
    ? canDecrement === false
    : value <= min;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div className="flex h-8 items-center overflow-hidden rounded-md border bg-background">
        <button
          type="button"
          onClick={handleDecrement}
          disabled={disabled || decrementDisabled}
          className="flex h-full w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Minus className="h-3 w-3" />
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={handleInputChange}
          disabled={disabled}
          className="h-full w-10 border-x bg-transparent text-center text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={handleIncrement}
          disabled={disabled}
          className="flex h-full w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}

export function TaskPropertiesSection(props: TaskPropertiesSectionProps) {
  const {
    // wsId and taskId are passed for potential future use
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    wsId: _wsId,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    taskId: _taskId,
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
    isCreateMode,
    // Scheduling state
    totalDuration,
    isSplittable,
    minSplitDurationMinutes,
    maxSplitDurationMinutes,
    calendarHours,
    autoSchedule,
    savedSchedulingSettings,
    scheduledEvents,
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
    // Scheduling handlers
    onTotalDurationChange,
    onIsSplittableChange,
    onMinSplitDurationChange,
    onMaxSplitDurationChange,
    onCalendarHoursChange,
    onAutoScheduleChange,
    onSaveSchedulingSettings,
    schedulingSaving,
  } = props;

  const { weekStartsOn, timezone, timeFormat } = useCalendarPreferences();

  const [isMetadataExpanded, setIsMetadataExpanded] = useState(false);
  const [isPriorityPopoverOpen, setIsPriorityPopoverOpen] = useState(false);
  const [isDueDatePopoverOpen, setIsDueDatePopoverOpen] = useState(false);
  const [isEstimationPopoverOpen, setIsEstimationPopoverOpen] = useState(false);
  const [isLabelsPopoverOpen, setIsLabelsPopoverOpen] = useState(false);
  const [isProjectsPopoverOpen, setIsProjectsPopoverOpen] = useState(false);
  const [isAssigneesPopoverOpen, setIsAssigneesPopoverOpen] = useState(false);
  const [isListPopoverOpen, setIsListPopoverOpen] = useState(false);
  const [isSchedulingPopoverOpen, setIsSchedulingPopoverOpen] = useState(false);

  // Track last saved settings locally (updates after successful save)
  const [lastSavedSettings, setLastSavedSettings] = useState<
    SchedulingSettings | undefined
  >(savedSchedulingSettings);

  // Update lastSavedSettings when prop changes (e.g., task is refetched)
  // Use deep comparison since savedSchedulingSettings is a new object each render
  const previousSavedRef = useRef(savedSchedulingSettings);
  useEffect(() => {
    const propValues = savedSchedulingSettings;
    const prevValues = previousSavedRef.current;

    // Deep compare to avoid overwriting on every render
    const hasChanged =
      propValues?.totalDuration !== prevValues?.totalDuration ||
      propValues?.isSplittable !== prevValues?.isSplittable ||
      propValues?.minSplitDurationMinutes !==
        prevValues?.minSplitDurationMinutes ||
      propValues?.maxSplitDurationMinutes !==
        prevValues?.maxSplitDurationMinutes ||
      propValues?.calendarHours !== prevValues?.calendarHours ||
      propValues?.autoSchedule !== prevValues?.autoSchedule;

    if (hasChanged) {
      previousSavedRef.current = propValues;
      setLastSavedSettings(propValues);
    }
  }, [savedSchedulingSettings]);

  // Computed duration values
  const totalMinutes = (totalDuration ?? 0) * 60;
  const durationHours = Math.floor(totalMinutes / 60);
  const durationMinutes = Math.round(totalMinutes % 60);

  // Check if scheduling settings have unsaved changes
  const hasUnsavedSchedulingChanges = useMemo(() => {
    if (isCreateMode) return false; // In create mode, all changes are pending until save
    if (!lastSavedSettings) return false; // No saved state to compare against

    return (
      totalDuration !== lastSavedSettings.totalDuration ||
      isSplittable !== lastSavedSettings.isSplittable ||
      minSplitDurationMinutes !== lastSavedSettings.minSplitDurationMinutes ||
      maxSplitDurationMinutes !== lastSavedSettings.maxSplitDurationMinutes ||
      calendarHours !== lastSavedSettings.calendarHours ||
      autoSchedule !== lastSavedSettings.autoSchedule
    );
  }, [
    isCreateMode,
    lastSavedSettings,
    totalDuration,
    isSplittable,
    minSplitDurationMinutes,
    maxSplitDurationMinutes,
    calendarHours,
    autoSchedule,
  ]);

  // Check if save is allowed (must have non-zero duration, hour type selected, and unsaved changes)
  const canSaveScheduling = useMemo(() => {
    const hasDuration = durationHours > 0 || durationMinutes > 0;
    const hasHourType = calendarHours !== null;
    return (
      hasUnsavedSchedulingChanges &&
      hasDuration &&
      hasHourType &&
      !schedulingSaving
    );
  }, [
    hasUnsavedSchedulingChanges,
    durationHours,
    durationMinutes,
    calendarHours,
    schedulingSaving,
  ]);

  // Handle save scheduling settings
  const handleSaveSchedulingSettings = useCallback(async () => {
    const settings: SchedulingSettings = {
      totalDuration,
      isSplittable,
      minSplitDurationMinutes,
      maxSplitDurationMinutes,
      calendarHours,
      autoSchedule,
    };
    const success = await onSaveSchedulingSettings(settings);
    if (success) {
      // Update local saved state to reflect the successful save
      setLastSavedSettings(settings);
      setIsSchedulingPopoverOpen(false);
    }
  }, [
    totalDuration,
    isSplittable,
    minSplitDurationMinutes,
    maxSplitDurationMinutes,
    calendarHours,
    autoSchedule,
    onSaveSchedulingSettings,
  ]);

  // Handle clear and save scheduling settings
  const handleClearSchedulingSettings = useCallback(async () => {
    // Clear all local state first
    onTotalDurationChange(null);
    onIsSplittableChange(false);
    onMinSplitDurationChange(null);
    onMaxSplitDurationChange(null);
    onCalendarHoursChange(null);
    onAutoScheduleChange(false);

    // Save cleared settings to database
    const clearedSettings: SchedulingSettings = {
      totalDuration: null,
      isSplittable: false,
      minSplitDurationMinutes: null,
      maxSplitDurationMinutes: null,
      calendarHours: null,
      autoSchedule: false,
    };
    const success = await onSaveSchedulingSettings(clearedSettings);
    if (success) {
      setLastSavedSettings(clearedSettings);
      setIsSchedulingPopoverOpen(false);
    }
  }, [
    onTotalDurationChange,
    onIsSplittableChange,
    onMinSplitDurationChange,
    onMaxSplitDurationChange,
    onCalendarHoursChange,
    onAutoScheduleChange,
    onSaveSchedulingSettings,
  ]);

  // Note: Manual scheduling removed - handled by Smart Schedule button in Calendar

  // Handlers for duration inputs
  const handleDurationHoursChange = useCallback(
    (hours: number) => {
      const clampedHours = Math.max(0, hours);
      const totalHours = (clampedHours * 60 + durationMinutes) / 60;
      onTotalDurationChange(totalHours > 0 ? totalHours : null);
    },
    [durationMinutes, onTotalDurationChange]
  );

  const handleDurationMinutesChange = useCallback(
    (minutes: number, direction?: 'increment' | 'decrement') => {
      let newHours = durationHours;
      let newMinutes = minutes;

      // Handle rollover for increment/decrement
      if (direction === 'increment' && minutes > 45) {
        newMinutes = 0;
        newHours = durationHours + 1;
      } else if (direction === 'decrement' && minutes < 0) {
        if (durationHours > 0) {
          newMinutes = 45;
          newHours = durationHours - 1;
        } else {
          newMinutes = 0;
        }
      } else {
        // For direct input, snap to nearest 15-minute interval
        newMinutes = Math.round(minutes / 15) * 15;
        if (newMinutes >= 60) {
          newMinutes = 0;
          newHours = durationHours + 1;
        }
      }

      const totalHours = (newHours * 60 + newMinutes) / 60;
      onTotalDurationChange(totalHours > 0 ? totalHours : null);
    },
    [durationHours, onTotalDurationChange]
  );

  const handleSplittableChange = useCallback(
    (checked: boolean) => {
      onIsSplittableChange(checked);
      // Set defaults when enabling
      if (checked) {
        if (minSplitDurationMinutes === null) {
          onMinSplitDurationChange(30);
        }
        if (maxSplitDurationMinutes === null) {
          onMaxSplitDurationChange(120);
        }
      }
    },
    [
      minSplitDurationMinutes,
      maxSplitDurationMinutes,
      onIsSplittableChange,
      onMinSplitDurationChange,
      onMaxSplitDurationChange,
    ]
  );

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
        // If both start and end dates are empty, set start date to start of today
        if (!startDate && !endDate) {
          onStartDateChange(dayjs().startOf('day').toDate());
        }
        onEndDateChange(selectedDate.toDate());
      } else {
        onEndDateChange(undefined);
      }
    },
    [startDate, endDate, onStartDateChange, onEndDateChange]
  );

  // Wrapper for quick due date that also sets start date if both are empty
  const handleQuickDueDate = useCallback(
    (days: number | null) => {
      // If both start and end dates are empty, set start date to start of today
      if (!startDate && !endDate && days !== null) {
        onStartDateChange(dayjs().startOf('day').toDate());
      }
      onQuickDueDate(days);
    },
    [startDate, endDate, onStartDateChange, onQuickDueDate]
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
                  {getPriorityIcon(priority, 'h-2.5 w-2.5')}
                  {getPriorityLabel(priority)}
                </Badge>
              )}
              {selectedListId && (
                <Badge
                  variant="secondary"
                  className="h-5 shrink-0 gap-1 border border-dynamic-green/30 bg-dynamic-green/15 px-2 font-medium text-[10px] text-dynamic-green"
                >
                  <ListTodo className="h-2.5 w-2.5" />
                  {availableLists?.find((l) => l.id === selectedListId)?.name ||
                    'List'}
                </Badge>
              )}
              {(startDate || endDate) && (
                <Badge
                  variant="secondary"
                  className="h-5 shrink-0 gap-1 border border-dynamic-orange/30 bg-dynamic-orange/15 px-2 font-medium text-[10px] text-dynamic-orange"
                >
                  <Calendar className="h-2.5 w-2.5" />
                  {startDate || endDate
                    ? `${startDate ? new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No start'} → ${endDate ? new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No due'}`
                    : 'Dates'}
                </Badge>
              )}
              {estimationPoints != null && (
                <Badge
                  variant="secondary"
                  className="h-5 shrink-0 gap-1 border border-dynamic-purple/30 bg-dynamic-purple/15 px-2 font-medium text-[10px] text-dynamic-purple"
                >
                  <Timer className="h-2.5 w-2.5" />
                  {boardConfig?.estimation_type
                    ? mapEstimationPoints(
                        estimationPoints,
                        boardConfig.estimation_type
                      )
                    : 'Est.'}
                </Badge>
              )}
              {selectedLabels.length > 0 && (
                <Badge
                  variant="secondary"
                  className="h-5 shrink-0 gap-1 border border-dynamic-indigo/30 bg-dynamic-indigo/15 px-2 font-medium text-[10px] text-dynamic-indigo"
                >
                  <Tag className="h-2.5 w-2.5" />
                  {selectedLabels.length === 1
                    ? selectedLabels[0]?.name
                    : `${selectedLabels.length} labels`}
                </Badge>
              )}
              {selectedProjects.length > 0 && (
                <Badge
                  variant="secondary"
                  className="h-5 shrink-0 gap-1 border border-dynamic-sky/30 bg-dynamic-sky/15 px-2 font-medium text-[10px] text-dynamic-sky"
                >
                  <Box className="h-2.5 w-2.5" />
                  {selectedProjects.length === 1
                    ? selectedProjects[0]?.name
                    : `${selectedProjects.length} projects`}
                </Badge>
              )}
              {selectedAssignees.length > 0 && !isPersonalWorkspace && (
                <Badge
                  variant="secondary"
                  className="h-5 shrink-0 gap-1 border border-dynamic-cyan/30 bg-dynamic-cyan/15 px-2 font-medium text-[10px] text-dynamic-cyan"
                >
                  <Users className="h-2.5 w-2.5" />
                  {selectedAssignees.length === 1
                    ? selectedAssignees[0]?.display_name || 'Unknown'
                    : `${selectedAssignees.length} assignees`}
                </Badge>
              )}
              {totalMinutes > 0 && (
                <Badge
                  variant="secondary"
                  className={cn(
                    'h-5 shrink-0 gap-1 border px-2 font-medium text-[10px]',
                    hasUnsavedSchedulingChanges
                      ? 'border-dynamic-yellow/50 border-dashed bg-dynamic-yellow/15 text-dynamic-yellow'
                      : 'border-dynamic-teal/30 bg-dynamic-teal/15 text-dynamic-teal'
                  )}
                >
                  {hasUnsavedSchedulingChanges ? (
                    <AlertCircle className="h-2.5 w-2.5" />
                  ) : (
                    <CalendarClock className="h-2.5 w-2.5" />
                  )}
                  {formatDuration(totalMinutes)}
                  {hasUnsavedSchedulingChanges && (
                    <span className="text-[8px] opacity-75">unsaved</span>
                  )}
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
                        preferences={{ weekStartsOn, timezone, timeFormat }}
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
                        preferences={{ weekStartsOn, timezone, timeFormat }}
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
                            onClick={() => handleQuickDueDate(0)}
                            disabled={isLoading}
                            className="h-7 text-[11px] transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5 md:text-xs"
                          >
                            Today
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => handleQuickDueDate(1)}
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
                              handleQuickDueDate(daysUntilEndOfWeek);
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
                            onClick={() => handleQuickDueDate(7)}
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
                            {selectedAssignees.map((assignee, index) => (
                              <Badge
                                key={
                                  assignee.id ||
                                  assignee.user_id ||
                                  `assignee-${index}`
                                }
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
                                  (a) =>
                                    (a.id || a.user_id) === (m.user_id || m.id)
                                )
                            )
                            .map((member, index) => (
                              <button
                                key={
                                  member.user_id ||
                                  member.id ||
                                  `member-${index}`
                                }
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

            {/* Scheduling Badge */}
            <Popover
              open={isSchedulingPopoverOpen}
              onOpenChange={setIsSchedulingPopoverOpen}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 font-medium text-xs transition-colors',
                    hasUnsavedSchedulingChanges
                      ? 'border-dynamic-yellow/50 border-dashed bg-dynamic-yellow/10 text-dynamic-yellow hover:border-dynamic-yellow/70 hover:bg-dynamic-yellow/15'
                      : totalDuration
                        ? 'border-dynamic-teal/30 bg-dynamic-teal/15 text-dynamic-teal hover:border-dynamic-teal/50 hover:bg-dynamic-teal/20'
                        : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-muted hover:text-foreground'
                  )}
                >
                  {hasUnsavedSchedulingChanges ? (
                    <AlertCircle className="h-3.5 w-3.5" />
                  ) : (
                    <CalendarClock className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {totalMinutes > 0
                      ? formatDuration(totalMinutes)
                      : 'Schedule'}
                  </span>
                  {hasUnsavedSchedulingChanges && (
                    <span className="text-[10px] opacity-75">unsaved</span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-0">
                <div className="rounded-lg p-3">
                  <div className="space-y-3">
                    {/* Duration */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5 font-normal text-muted-foreground text-xs">
                        <Clock className="h-3.5 w-3.5" />
                        Estimated Duration
                        <span className="text-dynamic-red">*</span>
                      </Label>
                      <div className="flex items-center gap-3">
                        <DurationInput
                          value={durationHours}
                          onChange={handleDurationHoursChange}
                          min={0}
                          max={999}
                          disabled={isLoading}
                          label="h"
                        />
                        <DurationInput
                          value={durationMinutes}
                          onChange={handleDurationMinutesChange}
                          min={0}
                          max={45}
                          step={15}
                          disabled={isLoading}
                          label="m"
                          allowRollover={true}
                          canDecrement={
                            durationHours > 0 || durationMinutes > 0
                          }
                        />
                      </div>
                    </div>

                    {/* Splittable */}
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="splittable"
                        className="flex cursor-pointer items-center gap-1.5 font-normal text-muted-foreground text-xs"
                      >
                        <Scissors className="h-3.5 w-3.5" />
                        Splittable
                      </Label>
                      <Switch
                        id="splittable"
                        checked={isSplittable}
                        onCheckedChange={handleSplittableChange}
                        disabled={isLoading}
                      />
                    </div>

                    {/* Min/Max Split Duration */}
                    {isSplittable && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="font-normal text-muted-foreground text-xs">
                            Min split
                          </Label>
                          <DurationInput
                            value={minSplitDurationMinutes ?? 30}
                            onChange={(value) =>
                              onMinSplitDurationChange(value)
                            }
                            min={15}
                            max={maxSplitDurationMinutes ?? 480}
                            step={15}
                            disabled={isLoading}
                            label="min"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="font-normal text-muted-foreground text-xs">
                            Max split
                          </Label>
                          <DurationInput
                            value={maxSplitDurationMinutes ?? 120}
                            onChange={(value) =>
                              onMaxSplitDurationChange(value)
                            }
                            min={minSplitDurationMinutes ?? 15}
                            max={480}
                            step={15}
                            disabled={isLoading}
                            label="min"
                          />
                        </div>
                      </div>
                    )}

                    {/* Calendar Hours Type */}
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5 font-normal text-muted-foreground text-xs">
                        <Briefcase className="h-3.5 w-3.5" />
                        Hour Type
                        <span className="text-dynamic-red">*</span>
                      </Label>
                      <div
                        className={cn(
                          'inline-flex rounded-md border p-0.5',
                          !isCreateMode &&
                            hasUnsavedSchedulingChanges &&
                            !calendarHours
                            ? 'border-dynamic-red/50 bg-dynamic-red/5'
                            : 'border-border'
                        )}
                      >
                        {CALENDAR_HOURS_OPTIONS.map((option) => {
                          const Icon = option.icon;
                          const isSelected = calendarHours === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                onCalendarHoursChange(option.value)
                              }
                              className={cn(
                                'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors',
                                isSelected
                                  ? 'bg-primary text-primary-foreground'
                                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                              )}
                              title={option.label}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">
                                {option.label.split(' ')[0]}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Auto-schedule */}
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="auto-schedule"
                        className="flex cursor-pointer items-center gap-1.5 font-normal text-muted-foreground text-xs"
                      >
                        <Zap className="h-3.5 w-3.5" />
                        Auto-schedule (for me)
                      </Label>
                      <Switch
                        id="auto-schedule"
                        checked={autoSchedule}
                        onCheckedChange={onAutoScheduleChange}
                        disabled={isLoading}
                      />
                    </div>

                    {/* Scheduled Events Progress & List */}
                    {!isCreateMode && totalMinutes > 0 && (
                      <div className="space-y-2 border-t pt-2">
                        {/* Progress */}
                        {(() => {
                          const scheduledMinutes =
                            scheduledEvents?.reduce(
                              (sum, e) => sum + (e.scheduled_minutes || 0),
                              0
                            ) ?? 0;
                          const progress =
                            totalMinutes > 0
                              ? (scheduledMinutes / totalMinutes) * 100
                              : 0;
                          const isFullyScheduled = progress >= 100;

                          // Check if any events are scheduled past the deadline
                          const eventsAfterDeadline =
                            endDate && scheduledEvents
                              ? scheduledEvents.filter(
                                  (e) => new Date(e.start_at) > endDate
                                )
                              : [];
                          const hasEventsAfterDeadline =
                            eventsAfterDeadline.length > 0;

                          return (
                            <>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">
                                    {scheduledEvents &&
                                    scheduledEvents.length > 0
                                      ? `${scheduledEvents.length} event${scheduledEvents.length > 1 ? 's' : ''}`
                                      : 'Not scheduled'}
                                  </span>
                                  <span
                                    className={cn(
                                      'font-medium',
                                      isFullyScheduled
                                        ? 'text-dynamic-green'
                                        : 'text-foreground'
                                    )}
                                  >
                                    {formatDuration(scheduledMinutes)} /{' '}
                                    {formatDuration(totalMinutes)}
                                  </span>
                                </div>
                                <Progress
                                  value={Math.min(progress, 100)}
                                  className={cn(
                                    'h-1.5',
                                    isFullyScheduled &&
                                      '[&>div]:bg-dynamic-green'
                                  )}
                                />
                              </div>

                              {/* Warning: Events scheduled after deadline */}
                              {hasEventsAfterDeadline && (
                                <div className="flex items-center gap-2 rounded-md border border-dynamic-orange/30 bg-dynamic-orange/10 px-2.5 py-1.5 text-xs">
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-dynamic-orange" />
                                  <span className="text-dynamic-orange">
                                    {eventsAfterDeadline.length === 1
                                      ? '1 event scheduled after deadline'
                                      : `${eventsAfterDeadline.length} events scheduled after deadline`}
                                  </span>
                                </div>
                              )}

                              {/* Compact Events List */}
                              {scheduledEvents &&
                                scheduledEvents.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {scheduledEvents.map((event) => {
                                      const isAfterDeadline =
                                        endDate &&
                                        new Date(event.start_at) > endDate;
                                      return (
                                        <div
                                          key={event.id}
                                          className={cn(
                                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]',
                                            event.completed
                                              ? 'bg-dynamic-green/10 text-dynamic-green'
                                              : isAfterDeadline
                                                ? 'bg-dynamic-orange/10 text-dynamic-orange'
                                                : 'bg-muted text-muted-foreground'
                                          )}
                                          title={`${dayjs(event.start_at).format('MMM D, h:mm A')} - ${formatDuration(event.scheduled_minutes)}${isAfterDeadline ? ' (after deadline)' : ''}`}
                                        >
                                          {event.completed ? (
                                            <CheckCircle className="h-2.5 w-2.5" />
                                          ) : isAfterDeadline ? (
                                            <AlertTriangle className="h-2.5 w-2.5" />
                                          ) : (
                                            <Calendar className="h-2.5 w-2.5" />
                                          )}
                                          <span>
                                            {dayjs(event.start_at).format(
                                              'M/D h:mma'
                                            )}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {/* Action Buttons */}
                    {!isCreateMode && (
                      <div className="flex items-center gap-2 border-t pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleSaveSchedulingSettings}
                          disabled={!canSaveScheduling}
                          className="flex-1"
                        >
                          {schedulingSaving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <Save className="mr-1.5 h-3.5 w-3.5" />
                              Save
                            </>
                          )}
                        </Button>
                        {(durationHours > 0 || durationMinutes > 0) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleClearSchedulingSettings}
                            disabled={schedulingSaving}
                            className="px-2 text-muted-foreground hover:text-dynamic-red"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Clear Duration (create mode only) */}
                    {isCreateMode &&
                      totalDuration !== null &&
                      totalDuration > 0 && (
                        <ClearMenuItem
                          label="Clear duration"
                          onClick={() => {
                            onTotalDurationChange(null);
                            setIsSchedulingPopoverOpen(false);
                          }}
                        />
                      )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}
    </div>
  );
}
