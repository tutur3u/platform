import {
  Briefcase,
  Calendar,
  CalendarClock,
  ChevronDown,
  Clock,
  Loader2,
  Scissors,
  User,
  Zap,
} from '@tuturuuu/icons';
import type { CalendarHoursType, TaskWithScheduling } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Progress } from '@tuturuuu/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Switch } from '@tuturuuu/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';

type TaskSchedulingFieldsProps = {
  task: TaskWithScheduling;
  onUpdate: (updates: Partial<TaskWithScheduling>) => void;
  onSchedule?: () => void;
  isScheduling?: boolean;
  disabled?: boolean;
  compact?: boolean;
};

const HOUR_TYPE_OPTIONS: {
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

function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function parseDurationToMinutes(hours: number, minutes: number): number {
  return hours * 60 + minutes;
}

export function TaskSchedulingFields({
  task,
  onUpdate,
  onSchedule,
  isScheduling = false,
  disabled = false,
  compact = false,
}: TaskSchedulingFieldsProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Convert total_duration (hours) to hours and minutes for inputs
  const totalMinutes = (task.total_duration ?? 0) * 60;
  const durationHours = Math.floor(totalMinutes / 60);
  const durationMinutes = Math.round(totalMinutes % 60);

  const scheduledMinutes = task.scheduled_minutes ?? 0;
  const completedMinutes = task.completed_minutes ?? 0;
  const progress =
    totalMinutes > 0 ? (scheduledMinutes / totalMinutes) * 100 : 0;

  const handleDurationHoursChange = (value: string) => {
    const hours = parseInt(value, 10) || 0;
    const totalHours = parseDurationToMinutes(hours, durationMinutes) / 60;
    onUpdate({ total_duration: totalHours });
  };

  const handleDurationMinutesChange = (value: string) => {
    const minutes = parseInt(value, 10) || 0;
    const totalHours = parseDurationToMinutes(durationHours, minutes) / 60;
    onUpdate({ total_duration: totalHours });
  };

  const handleSplittableChange = (checked: boolean) => {
    onUpdate({
      is_splittable: checked,
      // Set defaults when enabling
      ...(checked && !task.min_split_duration_minutes
        ? { min_split_duration_minutes: 30 }
        : {}),
      ...(checked && !task.max_split_duration_minutes
        ? { max_split_duration_minutes: 120 }
        : {}),
    });
  };

  const handleMinSplitChange = (value: string) => {
    const minutes = parseInt(value, 10) || 30;
    onUpdate({ min_split_duration_minutes: minutes });
  };

  const handleMaxSplitChange = (value: string) => {
    const minutes = parseInt(value, 10) || 120;
    onUpdate({ max_split_duration_minutes: minutes });
  };

  const handleHourTypeChange = (value: CalendarHoursType) => {
    onUpdate({ calendar_hours: value });
  };

  const handleAutoScheduleChange = (checked: boolean) => {
    onUpdate({ auto_schedule: checked });
  };

  const canSchedule = totalMinutes > 0 && !isScheduling && !disabled;
  const hasScheduledEvents = scheduledMinutes > 0;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">
            {totalMinutes > 0 ? formatDuration(totalMinutes) : 'No duration'}
          </span>
        </div>
        {hasScheduledEvents && (
          <Badge variant="secondary" className="text-xs">
            {formatDuration(scheduledMinutes)} scheduled
          </Badge>
        )}
        {onSchedule && canSchedule && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSchedule}
            disabled={!canSchedule}
            className="h-7"
          >
            <CalendarClock className="mr-1 h-3 w-3" />
            Schedule
          </Button>
        )}
      </div>
    );
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="flex w-full items-center justify-between p-2 hover:bg-muted/50"
        >
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            <span className="font-medium text-sm">Scheduling</span>
            {totalMinutes > 0 && (
              <Badge variant="outline" className="ml-2 text-xs">
                {formatDuration(totalMinutes)}
              </Badge>
            )}
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform',
              isExpanded && 'rotate-180'
            )}
          />
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-4 px-2 pb-2">
        {/* Duration */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Clock className="h-4 w-4" />
            Estimated Duration
          </Label>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                max={999}
                value={durationHours}
                onChange={(e) => handleDurationHoursChange(e.target.value)}
                disabled={disabled}
                className="h-8 w-16 text-center"
              />
              <span className="text-muted-foreground text-sm">h</span>
            </div>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                max={59}
                value={durationMinutes}
                onChange={(e) => handleDurationMinutesChange(e.target.value)}
                disabled={disabled}
                className="h-8 w-16 text-center"
              />
              <span className="text-muted-foreground text-sm">m</span>
            </div>
          </div>
        </div>

        {/* Splittable */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="splittable"
              className="flex cursor-pointer items-center gap-1.5 text-sm"
            >
              <Scissors className="h-4 w-4" />
              Splittable
            </Label>
            <Switch
              id="splittable"
              checked={task.is_splittable ?? false}
              onCheckedChange={handleSplittableChange}
              disabled={disabled}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            Allow task to be split across multiple calendar events
          </p>
        </div>

        {/* Min/Max Split Duration */}
        {task.is_splittable && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Min split</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={15}
                  max={task.max_split_duration_minutes ?? 480}
                  value={task.min_split_duration_minutes ?? 30}
                  onChange={(e) => handleMinSplitChange(e.target.value)}
                  disabled={disabled}
                  className="h-8 w-16 text-center"
                />
                <span className="text-muted-foreground text-xs">min</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Max split</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={task.min_split_duration_minutes ?? 15}
                  max={480}
                  value={task.max_split_duration_minutes ?? 120}
                  onChange={(e) => handleMaxSplitChange(e.target.value)}
                  disabled={disabled}
                  className="h-8 w-16 text-center"
                />
                <span className="text-muted-foreground text-xs">min</span>
              </div>
            </div>
          </div>
        )}

        {/* Hour Type */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Briefcase className="h-4 w-4" />
            Hour Type
          </Label>
          <Select
            value={task.calendar_hours ?? 'work_hours'}
            onValueChange={handleHourTypeChange}
            disabled={disabled}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select hour type" />
            </SelectTrigger>
            <SelectContent>
              {HOUR_TYPE_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span>{option.label}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Auto-schedule */}
        <div className="flex items-center justify-between">
          <Tooltip>
            <TooltipTrigger asChild>
              <Label
                htmlFor="auto-schedule"
                className="flex cursor-pointer items-center gap-1.5 text-sm"
              >
                <Zap className="h-4 w-4" />
                Auto-schedule
              </Label>
            </TooltipTrigger>
            <TooltipContent>
              Automatically schedule when task is saved with a duration
            </TooltipContent>
          </Tooltip>
          <Switch
            id="auto-schedule"
            checked={task.auto_schedule ?? false}
            onCheckedChange={handleAutoScheduleChange}
            disabled={disabled}
          />
        </div>

        {/* Progress */}
        {totalMinutes > 0 && (
          <div className="space-y-2 rounded-md bg-muted/30 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">
                {formatDuration(scheduledMinutes)} /{' '}
                {formatDuration(totalMinutes)}
              </span>
            </div>
            <Progress value={progress} className="h-2" />
            {completedMinutes > 0 && (
              <p className="text-muted-foreground text-xs">
                {formatDuration(completedMinutes)} completed
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        {onSchedule && (
          <div className="flex gap-2 pt-2">
            <Button
              variant="default"
              size="sm"
              onClick={onSchedule}
              disabled={!canSchedule}
              className="flex-1"
            >
              {isScheduling ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Scheduling...
                </>
              ) : (
                <>
                  <CalendarClock className="mr-1.5 h-4 w-4" />
                  {hasScheduledEvents ? 'Reschedule' : 'Schedule Now'}
                </>
              )}
            </Button>
            {hasScheduledEvents && (
              <Button variant="outline" size="sm">
                View Events
              </Button>
            )}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
