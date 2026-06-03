'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  Calendar,
  CalendarClock,
  Clock,
  Loader2,
  Minus,
  Plus,
  Save,
  Scissors,
  User,
  X,
  Zap,
} from '@tuturuuu/icons';
import {
  getCurrentUserTaskSchedule,
  updateCurrentUserTaskSchedulingSettings,
} from '@tuturuuu/internal-api';
import type { CalendarHoursType, Task } from '@tuturuuu/types/primitives/Task';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import type { ChangeEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  formatTaskDurationLabel,
  taskDurationHoursToMinutes,
  taskDurationMinutesToHours,
} from './task-scheduling-utils';

interface TaskSchedulingMenuTranslations {
  schedule?: string;
  estimatedDuration?: string;
  h?: string;
  m?: string;
  splittable?: string;
  minSplit?: string;
  maxSplit?: string;
  hourType?: string;
  workHours?: string;
  meetingHours?: string;
  personalHours?: string;
  autoSchedule?: string;
  save?: string;
  clear?: string;
  saved?: string;
  error?: string;
}

interface TaskSchedulingMenuProps {
  task: Task;
  boardId: string;
  isLoading?: boolean;
  onUpdate: () => void;
  onClose?: () => void;
  translations?: TaskSchedulingMenuTranslations;
}

const DEFAULT_MIN_SPLIT_MINUTES = 30;
const DEFAULT_MAX_SPLIT_MINUTES = 120;

function getTranslations(translations?: TaskSchedulingMenuTranslations) {
  return {
    schedule: translations?.schedule ?? 'Schedule',
    estimatedDuration: translations?.estimatedDuration ?? 'Estimated Duration',
    h: translations?.h ?? 'h',
    m: translations?.m ?? 'm',
    splittable: translations?.splittable ?? 'Splittable',
    minSplit: translations?.minSplit ?? 'Min split',
    maxSplit: translations?.maxSplit ?? 'Max split',
    hourType: translations?.hourType ?? 'Hour Type',
    workHours: translations?.workHours ?? 'Work Hours',
    meetingHours: translations?.meetingHours ?? 'Meeting Hours',
    personalHours: translations?.personalHours ?? 'Personal Hours',
    autoSchedule: translations?.autoSchedule ?? 'Auto-schedule',
    save: translations?.save ?? 'Save',
    clear: translations?.clear ?? 'Clear',
    saved: translations?.saved ?? 'Saved',
    error: translations?.error ?? 'Error',
  };
}

function clampDuration(value: number, min = 0, max = 999) {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(value, max));
}

interface DurationInputProps {
  value: number;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}

function DurationInput({
  value,
  label,
  min = 0,
  max = 999,
  step = 1,
  disabled = false,
  onChange,
}: DurationInputProps) {
  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(clampDuration(Number.parseInt(event.target.value, 10), min, max));
  };

  return (
    <div className="flex items-center gap-1">
      <div className="flex h-8 items-center overflow-hidden rounded-md border bg-background">
        <button
          type="button"
          className="flex h-full w-7 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled || value <= min}
          onClick={() => onChange(clampDuration(value - step, min, max))}
        >
          <Minus className="h-3 w-3" />
        </button>
        <input
          aria-label={label}
          className="h-full w-10 border-x bg-transparent text-center text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          disabled={disabled}
          inputMode="numeric"
          onChange={handleInputChange}
          pattern="[0-9]*"
          type="text"
          value={value}
        />
        <button
          type="button"
          className="flex h-full w-7 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled || value >= max}
          onClick={() => onChange(clampDuration(value + step, min, max))}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}

function getInitialDurationMinutes(task: Task) {
  return taskDurationHoursToMinutes(task.total_duration ?? null);
}

export function TaskSchedulingMenu({
  task,
  boardId,
  isLoading = false,
  onUpdate,
  onClose,
  translations,
}: TaskSchedulingMenuProps) {
  const queryClient = useQueryClient();
  const t = useMemo(() => getTranslations(translations), [translations]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(() =>
    getInitialDurationMinutes(task)
  );
  const [isSplittable, setIsSplittable] = useState(
    () => task.is_splittable ?? false
  );
  const [minSplitDurationMinutes, setMinSplitDurationMinutes] = useState(
    () => task.min_split_duration_minutes ?? DEFAULT_MIN_SPLIT_MINUTES
  );
  const [maxSplitDurationMinutes, setMaxSplitDurationMinutes] = useState(
    () => task.max_split_duration_minutes ?? DEFAULT_MAX_SPLIT_MINUTES
  );
  const [calendarHours, setCalendarHours] = useState<CalendarHoursType | null>(
    () => task.calendar_hours ?? null
  );
  const [autoSchedule, setAutoSchedule] = useState(
    () => task.auto_schedule ?? false
  );

  const { data: personalSchedule, isFetching } = useQuery({
    queryKey: ['task-personal-schedule', task.id],
    queryFn: () => getCurrentUserTaskSchedule(task.id),
    enabled: open && Boolean(task.id) && task.id !== 'new',
    staleTime: 5000,
  });

  useEffect(() => {
    const source = personalSchedule?.task ?? task;
    setDurationMinutes(
      taskDurationHoursToMinutes(source.total_duration ?? null)
    );
    setIsSplittable(source.is_splittable ?? false);
    setMinSplitDurationMinutes(
      source.min_split_duration_minutes ?? DEFAULT_MIN_SPLIT_MINUTES
    );
    setMaxSplitDurationMinutes(
      source.max_split_duration_minutes ?? DEFAULT_MAX_SPLIT_MINUTES
    );
    setCalendarHours(source.calendar_hours ?? null);
    setAutoSchedule(source.auto_schedule ?? false);
  }, [personalSchedule, task]);

  const durationHours = Math.floor(durationMinutes / 60);
  const minutesRemainder = durationMinutes % 60;
  const disabled = isLoading || saving || isFetching;
  const formattedDuration = formatTaskDurationLabel(
    taskDurationMinutesToHours(durationMinutes)
  );

  const updateTaskCache = (updates: Partial<Task>) => {
    queryClient.setQueryData(
      ['tasks', boardId],
      (oldTasks: Task[] | undefined) =>
        oldTasks?.map((cachedTask) =>
          cachedTask.id === task.id ? { ...cachedTask, ...updates } : cachedTask
        )
    );
  };

  const saveSettings = async (clear = false) => {
    const nextDurationMinutes = clear ? 0 : durationMinutes;
    const nextDuration = taskDurationMinutesToHours(nextDurationMinutes);
    const updates = {
      total_duration: nextDuration,
      is_splittable: clear ? false : isSplittable,
      min_split_duration_minutes:
        clear || !isSplittable ? null : minSplitDurationMinutes,
      max_split_duration_minutes:
        clear || !isSplittable ? null : maxSplitDurationMinutes,
      calendar_hours: clear ? null : calendarHours,
      auto_schedule: clear ? false : autoSchedule,
    } satisfies Partial<Task>;

    const previousTasks = queryClient.getQueryData<Task[]>(['tasks', boardId]);
    updateTaskCache(updates);
    setSaving(true);

    try {
      await updateCurrentUserTaskSchedulingSettings(task.id, updates);
      queryClient.setQueryData(
        ['task-personal-schedule', task.id],
        (oldSchedule: typeof personalSchedule | undefined) =>
          oldSchedule
            ? {
                ...oldSchedule,
                task: {
                  ...oldSchedule.task,
                  ...updates,
                },
              }
            : oldSchedule
      );
      await queryClient.invalidateQueries({
        queryKey: ['task-personal-schedule', task.id],
      });
      toast.success(t.saved);
      onUpdate();
      setOpen(false);
      onClose?.();
    } catch (error) {
      queryClient.setQueryData(['tasks', boardId], previousTasks);
      toast.error(error instanceof Error ? error.message : t.error);
    } finally {
      setSaving(false);
    }
  };

  const hourTypeOptions = [
    {
      value: 'work_hours' as const,
      label: t.workHours,
      icon: Briefcase,
    },
    {
      value: 'meeting_hours' as const,
      label: t.meetingHours,
      icon: Calendar,
    },
    {
      value: 'personal_hours' as const,
      label: t.personalHours,
      icon: User,
    },
  ];

  return (
    <DropdownMenuSub open={open} onOpenChange={setOpen}>
      <DropdownMenuSubTrigger>
        <CalendarClock className="h-4 w-4 text-dynamic-amber" />
        <div className="flex w-full items-center justify-between gap-2">
          <span>{t.schedule}</span>
          {formattedDuration && (
            <span className="ml-auto text-muted-foreground text-xs">
              {formattedDuration}
            </span>
          )}
        </div>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        className="w-72 p-0"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div className="space-y-3 p-3">
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 font-normal text-muted-foreground text-xs">
              <Clock className="h-3.5 w-3.5" />
              {t.estimatedDuration}
            </Label>
            <div className="flex items-center gap-3">
              <DurationInput
                disabled={disabled}
                label={t.h}
                onChange={(value) =>
                  setDurationMinutes(value * 60 + minutesRemainder)
                }
                value={durationHours}
              />
              <DurationInput
                disabled={disabled}
                label={t.m}
                max={45}
                onChange={(value) =>
                  setDurationMinutes(durationHours * 60 + value)
                }
                step={15}
                value={minutesRemainder}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label className="flex cursor-pointer items-center gap-1.5 font-normal text-muted-foreground text-xs">
              <Scissors className="h-3.5 w-3.5" />
              {t.splittable}
            </Label>
            <Switch
              checked={isSplittable}
              disabled={disabled}
              onCheckedChange={setIsSplittable}
            />
          </div>

          {isSplittable && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-normal text-muted-foreground text-xs">
                  {t.minSplit}
                </Label>
                <DurationInput
                  disabled={disabled}
                  label={t.m}
                  max={maxSplitDurationMinutes}
                  min={15}
                  onChange={setMinSplitDurationMinutes}
                  step={15}
                  value={minSplitDurationMinutes}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-normal text-muted-foreground text-xs">
                  {t.maxSplit}
                </Label>
                <DurationInput
                  disabled={disabled}
                  label={t.m}
                  max={480}
                  min={minSplitDurationMinutes}
                  onChange={setMaxSplitDurationMinutes}
                  step={15}
                  value={maxSplitDurationMinutes}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 font-normal text-muted-foreground text-xs">
              <Briefcase className="h-3.5 w-3.5" />
              {t.hourType}
            </Label>
            <div className="inline-flex rounded-md border border-border p-0.5">
              {hourTypeOptions.map((option) => {
                const Icon = option.icon;
                const selected = calendarHours === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      'flex items-center gap-1.5 rounded px-2 py-1 text-xs',
                      selected
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                    disabled={disabled}
                    onClick={() => setCalendarHours(option.value)}
                    title={option.label}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{option.label.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label className="flex cursor-pointer items-center gap-1.5 font-normal text-muted-foreground text-xs">
              <Zap className="h-3.5 w-3.5" />
              {t.autoSchedule}
            </Label>
            <Switch
              checked={autoSchedule}
              disabled={disabled}
              onCheckedChange={setAutoSchedule}
            />
          </div>

          <div className="flex items-center gap-2 border-t pt-3">
            <Button
              className="h-8 flex-1 gap-1.5"
              disabled={disabled}
              onClick={() => void saveSettings(false)}
              size="sm"
              type="button"
              variant="default"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {t.save}
            </Button>
            <Button
              className="h-8 gap-1.5"
              disabled={disabled}
              onClick={() => void saveSettings(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              <X className="h-3.5 w-3.5" />
              {t.clear}
            </Button>
          </div>
        </div>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
