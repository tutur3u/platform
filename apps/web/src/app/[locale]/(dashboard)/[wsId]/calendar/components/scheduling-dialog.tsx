'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  CalendarClock,
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
import { useCallback, useEffect, useState } from 'react';
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

// Duration input component
function DurationInput({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  label,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  disabled?: boolean;
}) {
  const handleDecrement = () => {
    const newValue = Math.max(min, value - step);
    onChange(newValue);
  };

  const handleIncrement = () => {
    const newValue = Math.min(max, value + step);
    onChange(newValue);
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={handleDecrement}
        disabled={disabled || value <= min}
      >
        -
      </Button>
      <div className="flex min-w-12 items-center justify-center gap-1 rounded-md border bg-background px-2 py-1 text-sm">
        <span className="font-medium tabular-nums">{value}</span>
        <span className="text-muted-foreground text-xs">{label}</span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={handleIncrement}
        disabled={disabled || value >= max}
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

  // Local state for form fields
  const [durationHours, setDurationHours] = useState(0);
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [isSplittable, setIsSplittable] = useState(false);
  const [minSplitMinutes, setMinSplitMinutes] = useState(30);
  const [maxSplitMinutes, setMaxSplitMinutes] = useState(120);
  const [calendarHours, setCalendarHours] = useState<CalendarHoursType | null>(
    null
  );
  const [autoSchedule, setAutoSchedule] = useState(false);

  // Always read per-user settings (works for both personal and workspace calendars).
  const { data: personalSchedule } = useQuery({
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

  // Initialize form state when task changes
  useEffect(() => {
    if (!task) return;
    const source = personalSchedule?.task;

    if (!source) return;

    const totalMinutes = (source.total_duration ?? 0) * 60;
    setDurationHours(Math.floor(totalMinutes / 60));
    setDurationMinutes(totalMinutes % 60);
    setIsSplittable(!!source.is_splittable);
    setMinSplitMinutes(source.min_split_duration_minutes ?? 30);
    setMaxSplitMinutes(source.max_split_duration_minutes ?? 120);
    setCalendarHours((source.calendar_hours as any) ?? null);
    setAutoSchedule(!!source.auto_schedule);
  }, [task, personalSchedule?.task]);

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
    onError: (error) => {
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

  // Round minutes to 15-minute intervals
  const handleMinutesChange = (value: number) => {
    // Snap to 15-minute intervals
    const snapped = Math.round(value / 15) * 15;
    setDurationMinutes(snapped);
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

        <div className="space-y-4 py-2">
          {/* Duration */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Estimated Duration
              <span className="text-dynamic-red">*</span>
            </Label>
            <div className="flex items-center gap-3">
              <DurationInput
                value={durationHours}
                onChange={setDurationHours}
                min={0}
                max={999}
                label="h"
                disabled={updateMutation.isPending}
              />
              <DurationInput
                value={durationMinutes}
                onChange={handleMinutesChange}
                min={0}
                max={45}
                step={15}
                label="m"
                disabled={updateMutation.isPending}
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
                    disabled={updateMutation.isPending}
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
          <div className="flex items-center justify-between rounded-lg border p-3">
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
            <Switch
              id="splittable"
              checked={isSplittable}
              onCheckedChange={setIsSplittable}
              disabled={updateMutation.isPending}
            />
          </div>

          {/* Min/Max Split Duration */}
          {isSplittable && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">
                  Min split
                </Label>
                <DurationInput
                  value={minSplitMinutes}
                  onChange={(value) =>
                    setMinSplitMinutes(Math.min(value, maxSplitMinutes))
                  }
                  min={15}
                  max={maxSplitMinutes}
                  step={15}
                  label="min"
                  disabled={updateMutation.isPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">
                  Max split
                </Label>
                <DurationInput
                  value={maxSplitMinutes}
                  onChange={(value) =>
                    setMaxSplitMinutes(Math.max(value, minSplitMinutes))
                  }
                  min={minSplitMinutes}
                  max={480}
                  step={15}
                  label="min"
                  disabled={updateMutation.isPending}
                />
              </div>
            </div>
          )}

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
              disabled={updateMutation.isPending}
            />
          </div>
        </div>

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
            disabled={!isValid || updateMutation.isPending}
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
