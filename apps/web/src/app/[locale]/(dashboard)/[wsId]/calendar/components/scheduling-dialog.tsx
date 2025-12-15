'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Clock,
  Coffee,
  Handshake,
  Loader2,
  Scissors,
  Zap,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExtendedWorkspaceTask } from '../../time-tracker/types';

// Calendar hours type for task scheduling (matches database enum)
type CalendarHoursType = 'work_hours' | 'personal_hours' | 'meeting_hours';

// Calendar hours options
const CALENDAR_HOURS_OPTIONS: Array<{
  value: CalendarHoursType;
  label: string;
  icon: typeof Briefcase;
}> = [
  { value: 'work_hours', label: 'Work', icon: Briefcase },
  { value: 'personal_hours', label: 'Personal', icon: Coffee },
  { value: 'meeting_hours', label: 'Meeting', icon: Handshake },
];

// Duration input component with inline editing
function DurationInput({
  value,
  onChange,
  step = 1,
  label,
  disabled,
  canDecrement = true,
  min = 0,
  max = 999,
}: {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  label: string;
  disabled?: boolean;
  /** Whether decrement button should be enabled (independent of disabled prop) */
  canDecrement?: boolean;
  /** Minimum value for typed input validation */
  min?: number;
  /** Maximum value for typed input validation */
  max?: number;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync input value when value prop changes (and not editing)
  useEffect(() => {
    if (!isEditing) {
      setInputValue(String(value));
    }
  }, [value, isEditing]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDecrement = () => {
    // Let the onChange handler decide what to do (allows wrap-around)
    onChange(value - step);
  };

  const handleIncrement = () => {
    // Let the onChange handler decide what to do (allows wrap-around)
    onChange(value + step);
  };

  const handleInputSubmit = () => {
    const parsed = parseInt(inputValue, 10);
    if (!Number.isNaN(parsed)) {
      // Clamp to min/max for typed values
      const clamped = Math.max(min, Math.min(max, parsed));
      onChange(clamped);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleInputSubmit();
    } else if (e.key === 'Escape') {
      setInputValue(String(value));
      setIsEditing(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={handleDecrement}
        disabled={disabled || !canDecrement}
      >
        -
      </Button>
      {isEditing ? (
        <input
          ref={inputRef}
          type="number"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleInputSubmit}
          onKeyDown={handleKeyDown}
          className="h-7 w-16 rounded-md border bg-background px-2 text-center font-medium text-sm tabular-nums outline-none ring-1 ring-primary focus:ring-2"
          min={min}
          max={max}
        />
      ) : (
        <button
          type="button"
          onClick={() => !disabled && setIsEditing(true)}
          disabled={disabled}
          className="flex min-w-12 cursor-text items-center justify-center gap-1 rounded-md border bg-background px-2 py-1 text-sm transition-colors hover:border-primary hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="font-medium tabular-nums">{value}</span>
          <span className="text-muted-foreground text-xs">{label}</span>
        </button>
      )}
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={handleIncrement}
        disabled={disabled}
      >
        +
      </Button>
    </div>
  );
}

interface SchedulingDialogProps {
  wsId: string;
  task: ExtendedWorkspaceTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * NOTE: Scheduling settings are stored per-user in `task_user_scheduling_settings`.
   * This flag is kept only for UX differences in personal calendar views.
   */
  isPersonalWorkspace?: boolean;
}

export function SchedulingDialog({
  // wsId retained for legacy routes; per-user scheduling no longer needs it
  wsId: _wsId,
  task,
  open,
  onOpenChange,
  // retained for UX differences; not used in logic currently
  isPersonalWorkspace: _isPersonalWorkspace = false,
}: SchedulingDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Track whether we've initialized from fetched data to avoid re-initializing
  const [hasInitialized, setHasInitialized] = useState(false);

  // Local state for form fields - defaults optimized for quick scheduling
  const [durationHours, setDurationHours] = useState(1); // Default to 1 hour
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [isSplittable, setIsSplittable] = useState(true); // Default to splittable
  const [isSplitSettingsExpanded, setIsSplitSettingsExpanded] = useState(false);
  const [minSplitMinutes, setMinSplitMinutes] = useState(30);
  const [maxSplitMinutes, setMaxSplitMinutes] = useState(120);
  const [calendarHours, setCalendarHours] = useState<CalendarHoursType | null>(
    'personal_hours' // Default to personal hours
  );
  const [autoSchedule, setAutoSchedule] = useState(true); // Default to auto-schedule

  // Always read per-user settings (works for both personal and workspace calendars).
  const {
    data: personalSchedule,
    isLoading: isLoadingPersonalSchedule,
    isFetching: isFetchingPersonalSchedule,
  } = useQuery({
    queryKey: ['task-personal-schedule', task?.id, open],
    enabled: open && !!task?.id,
    queryFn: async () => {
      const res = await fetch(`/api/v1/users/me/tasks/${task!.id}/schedule`);
      if (!res.ok) return null;
      return (await res.json()) as null | {
        task: {
          total_duration: number | null;
          is_splittable: boolean | null;
          min_split_duration_minutes: number | null;
          max_split_duration_minutes: number | null;
          calendar_hours: CalendarHoursType | null;
          auto_schedule: boolean | null;
        };
      };
    },
    staleTime: 30_000,
  });

  const isScheduleSettingsReady =
    !open || !task?.id
      ? true
      : !isLoadingPersonalSchedule && !isFetchingPersonalSchedule;

  // Reset initialization state and form defaults when dialog opens with a new task
  useEffect(() => {
    if (open) {
      setHasInitialized(false);
      // Reset to defaults
      setDurationHours(1);
      setDurationMinutes(0);
      setAutoSchedule(true);
      setIsSplittable(true);
      setMinSplitMinutes(30);
      setMaxSplitMinutes(120);
      setCalendarHours('personal_hours');
      setIsSplitSettingsExpanded(false);
    }
  }, [open]);

  // Initialize form state when task changes or data is loaded
  useEffect(() => {
    if (!task || !isScheduleSettingsReady || hasInitialized) return;

    const source = personalSchedule?.task;

    // Mark as initialized - we'll use defaults if no saved settings
    setHasInitialized(true);

    // If we have saved settings, use them; otherwise keep the defaults
    if (source) {
      const totalMinutes = (source.total_duration ?? 1) * 60; // Default 1 hour if null
      setDurationHours(Math.floor(totalMinutes / 60) || 1);
      setDurationMinutes(totalMinutes % 60);
      // Use saved values - only override defaults if explicitly set (not null/undefined)
      // Check for null/undefined explicitly since false and 0 are valid saved values
      if (source.is_splittable !== null && source.is_splittable !== undefined) {
        setIsSplittable(source.is_splittable);
      }
      setMinSplitMinutes(source.min_split_duration_minutes ?? 30);
      setMaxSplitMinutes(source.max_split_duration_minutes ?? 120);
      if (
        source.calendar_hours !== null &&
        source.calendar_hours !== undefined
      ) {
        setCalendarHours(source.calendar_hours);
      }
      if (source.auto_schedule !== null && source.auto_schedule !== undefined) {
        setAutoSchedule(source.auto_schedule);
      }
    }
    // If no source, the defaults from useState are already set correctly
  }, [task, personalSchedule?.task, isScheduleSettingsReady, hasInitialized]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: {
      total_duration: number;
      is_splittable: boolean;
      min_split_duration_minutes: number;
      max_split_duration_minutes: number;
      calendar_hours: CalendarHoursType | null;
      auto_schedule: boolean;
    }) => {
      if (!task) throw new Error('No task selected');

      const supabase = createClient();
      return supabase.auth.getUser().then(async ({ data: authData, error }) => {
        if (error || !authData.user?.id) {
          throw error ?? new Error('Not signed in');
        }

        const { error: upsertError } = await (supabase as any)
          .from('task_user_scheduling_settings')
          .upsert(
            {
              task_id: task.id,
              user_id: authData.user.id,
              total_duration: data.total_duration,
              is_splittable: data.is_splittable,
              min_split_duration_minutes: data.min_split_duration_minutes,
              max_split_duration_minutes: data.max_split_duration_minutes,
              calendar_hours: data.calendar_hours,
              auto_schedule: data.auto_schedule,
            },
            { onConflict: 'task_id,user_id' }
          );

        if (upsertError) throw upsertError;
        return { ok: true };
      });
    },
    onSuccess: () => {
      toast.success('Scheduling settings updated');
      queryClient.invalidateQueries({ queryKey: ['schedulable-tasks'] });
      queryClient.invalidateQueries({
        queryKey: ['task-personal-schedule', task?.id],
      });
      router.refresh();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update scheduling settings');
    },
  });

  const handleSave = useCallback(() => {
    const totalDurationHours = durationHours + durationMinutes / 60;

    updateMutation.mutate({
      total_duration: totalDurationHours,
      is_splittable: isSplittable,
      min_split_duration_minutes: minSplitMinutes,
      max_split_duration_minutes: maxSplitMinutes,
      calendar_hours: calendarHours,
      auto_schedule: autoSchedule,
    });
  }, [
    durationHours,
    durationMinutes,
    isSplittable,
    minSplitMinutes,
    maxSplitMinutes,
    calendarHours,
    autoSchedule,
    updateMutation,
  ]);

  // Round minutes to 15-minute intervals, handle wrap-around to hours
  const handleMinutesChange = (value: number) => {
    // Snap to 15-minute intervals
    const snapped = Math.round(value / 15) * 15;

    // If incrementing past 59, wrap to 0 and increment hour
    if (snapped >= 60) {
      setDurationMinutes(0);
      setDurationHours((h) => h + 1);
    } else if (snapped < 0) {
      // If decrementing below 0 and we have hours, wrap to 45 and decrement hour
      if (durationHours > 0) {
        setDurationMinutes(45);
        setDurationHours((h) => h - 1);
      } else {
        // Can't go below 0 hours and 0 minutes
        setDurationMinutes(0);
      }
    } else {
      setDurationMinutes(snapped);
    }
  };

  // Handle hours change, prevent going below 0
  const handleHoursChange = (value: number) => {
    if (value < 0) {
      setDurationHours(0);
    } else {
      setDurationHours(value);
    }
  };

  if (!task) return null;

  const totalMinutes = durationHours * 60 + durationMinutes;
  const isValid = totalMinutes > 0 && calendarHours !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-dynamic-teal" />
            Scheduling Settings
          </DialogTitle>
          <DialogDescription className="line-clamp-1">
            {task.name || 'Untitled Task'}
          </DialogDescription>
        </DialogHeader>

        {!isScheduleSettingsReady ? (
          <div className="flex items-center justify-center gap-2 py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-muted-foreground text-sm">
              Loading scheduling settings...
            </span>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Estimated Duration
                <span className="text-dynamic-red">*</span>
              </Label>
              <div className="flex items-center gap-3">
                <DurationInput
                  value={durationHours}
                  onChange={handleHoursChange}
                  label="h"
                  disabled={
                    !isScheduleSettingsReady || updateMutation.isPending
                  }
                  canDecrement={durationHours * 60 + durationMinutes > 0}
                />
                <DurationInput
                  value={durationMinutes}
                  onChange={handleMinutesChange}
                  step={15}
                  label="m"
                  disabled={
                    !isScheduleSettingsReady || updateMutation.isPending
                  }
                  canDecrement={durationHours * 60 + durationMinutes > 0}
                />
              </div>
            </div>

            {/* Calendar Hours Type */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                Hour Type
                <span className="text-dynamic-red">*</span>
              </Label>
              <div className="inline-flex rounded-md border p-0.5">
                {CALENDAR_HOURS_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const isSelected = calendarHours === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setCalendarHours(option.value)}
                      disabled={
                        !isScheduleSettingsReady || updateMutation.isPending
                      }
                      className={cn(
                        'flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Splittable */}
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() =>
                      setIsSplitSettingsExpanded(!isSplitSettingsExpanded)
                    }
                    disabled={
                      !isSplittable ||
                      !isScheduleSettingsReady ||
                      updateMutation.isPending
                    }
                  >
                    {isSplitSettingsExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                  <Label
                    htmlFor="splittable"
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <Scissors className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm">Splittable</div>
                      <div className="text-muted-foreground text-xs">
                        Allow breaking into multiple sessions
                      </div>
                    </div>
                  </Label>
                </div>
                <Switch
                  id="splittable"
                  checked={isSplittable}
                  onCheckedChange={(checked) => {
                    setIsSplittable(checked);
                    if (checked) {
                      setIsSplitSettingsExpanded(true);
                    } else {
                      setIsSplitSettingsExpanded(false);
                    }
                  }}
                  disabled={
                    !isScheduleSettingsReady || updateMutation.isPending
                  }
                />
              </div>

              {/* Min/Max Split Duration */}
              {isSplittable && isSplitSettingsExpanded && (
                <div className="ml-8 grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">
                      Min split
                    </Label>
                    <DurationInput
                      value={minSplitMinutes}
                      onChange={(value) =>
                        setMinSplitMinutes(
                          Math.max(15, Math.min(value, maxSplitMinutes))
                        )
                      }
                      step={15}
                      label="min"
                      disabled={
                        !isScheduleSettingsReady || updateMutation.isPending
                      }
                      min={15}
                      max={maxSplitMinutes}
                      canDecrement={minSplitMinutes > 15}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">
                      Max split
                    </Label>
                    <DurationInput
                      value={maxSplitMinutes}
                      onChange={(value) =>
                        setMaxSplitMinutes(
                          Math.min(480, Math.max(value, minSplitMinutes))
                        )
                      }
                      step={15}
                      label="min"
                      disabled={
                        !isScheduleSettingsReady || updateMutation.isPending
                      }
                      min={minSplitMinutes}
                      max={480}
                      canDecrement={maxSplitMinutes > minSplitMinutes}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Auto-schedule */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label
                htmlFor="auto-schedule"
                className="flex cursor-pointer items-center gap-2"
              >
                <Zap className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-sm">Auto-schedule</div>
                  <div className="text-muted-foreground text-xs">
                    Automatically find time slots
                  </div>
                </div>
              </Label>
              <Switch
                id="auto-schedule"
                checked={autoSchedule}
                onCheckedChange={setAutoSchedule}
                disabled={!isScheduleSettingsReady || updateMutation.isPending}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              !isScheduleSettingsReady || !isValid || updateMutation.isPending
            }
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
