'use client';

import { Loader2 } from '@tuturuuu/icons';
import type { CalendarHoursType } from '@tuturuuu/types';
import type {
  Habit,
  HabitFrequency,
  HabitInput,
  MonthlyRecurrenceType,
  TimeOfDayPreference,
} from '@tuturuuu/types/primitives/Habit';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useEffect, useState } from 'react';

interface HabitFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wsId: string;
  habit?: Habit;
  onSuccess: () => void;
}

const COLORS = [
  { value: 'BLUE', label: 'Blue', class: 'bg-blue-500' },
  { value: 'GREEN', label: 'Green', class: 'bg-green-500' },
  { value: 'RED', label: 'Red', class: 'bg-red-500' },
  { value: 'YELLOW', label: 'Yellow', class: 'bg-yellow-500' },
  { value: 'PURPLE', label: 'Purple', class: 'bg-purple-500' },
  { value: 'PINK', label: 'Pink', class: 'bg-pink-500' },
  { value: 'CYAN', label: 'Cyan', class: 'bg-cyan-500' },
  { value: 'ORANGE', label: 'Orange', class: 'bg-orange-500' },
];

const FREQUENCIES: { value: HabitFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom Interval' },
];

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];

const CALENDAR_HOURS: { value: CalendarHoursType; label: string }[] = [
  { value: 'personal_hours', label: 'Personal Hours' },
  { value: 'work_hours', label: 'Work Hours' },
  { value: 'meeting_hours', label: 'Meeting Hours' },
];

const TIME_PREFERENCES: { value: TimeOfDayPreference; label: string }[] = [
  { value: 'morning', label: 'Morning (6am-12pm)' },
  { value: 'afternoon', label: 'Afternoon (12pm-5pm)' },
  { value: 'evening', label: 'Evening (5pm-9pm)' },
  { value: 'night', label: 'Night (9pm-12am)' },
];

export default function HabitFormDialog({
  open,
  onOpenChange,
  wsId,
  habit,
  onSuccess,
}: HabitFormDialogProps) {
  const isEditing = !!habit;
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState(habit?.name || '');
  const [description, setDescription] = useState(habit?.description || '');
  const [color, setColor] = useState(habit?.color || 'BLUE');
  const [priority, setPriority] = useState<TaskPriority>(
    habit?.priority || 'normal'
  );
  const [calendarHours, setCalendarHours] = useState<CalendarHoursType>(
    habit?.calendar_hours || 'personal_hours'
  );

  // Duration
  const [durationMinutes, setDurationMinutes] = useState(
    habit?.duration_minutes || 30
  );
  const [minDuration, setMinDuration] = useState<number | undefined>(
    habit?.min_duration_minutes ?? undefined
  );
  const [maxDuration, setMaxDuration] = useState<number | undefined>(
    habit?.max_duration_minutes ?? undefined
  );

  // Time preference
  const [idealTime, setIdealTime] = useState(habit?.ideal_time || '');
  const [timePreference, setTimePreference] = useState<
    TimeOfDayPreference | ''
  >(habit?.time_preference || '');

  // Recurrence
  const [frequency, setFrequency] = useState<HabitFrequency>(
    habit?.frequency || 'daily'
  );
  const [recurrenceInterval, setRecurrenceInterval] = useState(
    habit?.recurrence_interval || 1
  );
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    habit?.days_of_week || []
  );
  const [monthlyType, setMonthlyType] = useState<MonthlyRecurrenceType>(
    habit?.monthly_type || 'day_of_month'
  );
  const [dayOfMonth, setDayOfMonth] = useState(habit?.day_of_month || 1);
  const [weekOfMonth, setWeekOfMonth] = useState(habit?.week_of_month || 1);
  const [dayOfWeekMonthly, setDayOfWeekMonthly] = useState(
    habit?.day_of_week_monthly || 0
  );

  // Date bounds
  const [startDate, setStartDate] = useState(
    habit?.start_date || (new Date().toISOString().split('T')[0] ?? '')
  );
  const [endDate, setEndDate] = useState(habit?.end_date || '');

  // Settings
  const [isActive, setIsActive] = useState(habit?.is_active !== false);
  const [autoSchedule, setAutoSchedule] = useState(
    habit?.auto_schedule !== false
  );

  // Reset form state when habit prop changes (for edit mode)
  useEffect(() => {
    if (open) {
      setName(habit?.name || '');
      setDescription(habit?.description || '');
      setColor(habit?.color || 'BLUE');
      setPriority(habit?.priority || 'normal');
      setCalendarHours(habit?.calendar_hours || 'personal_hours');
      setDurationMinutes(habit?.duration_minutes || 30);
      setMinDuration(habit?.min_duration_minutes ?? undefined);
      setMaxDuration(habit?.max_duration_minutes ?? undefined);
      setIdealTime(habit?.ideal_time || '');
      setTimePreference(habit?.time_preference || '');
      setFrequency(habit?.frequency || 'daily');
      setRecurrenceInterval(habit?.recurrence_interval || 1);
      setDaysOfWeek(habit?.days_of_week || []);
      setMonthlyType(habit?.monthly_type || 'day_of_month');
      setDayOfMonth(habit?.day_of_month || 1);
      setWeekOfMonth(habit?.week_of_month || 1);
      setDayOfWeekMonthly(habit?.day_of_week_monthly || 0);
      setStartDate(
        habit?.start_date || (new Date().toISOString().split('T')[0] ?? '')
      );
      setEndDate(habit?.end_date || '');
      setIsActive(habit?.is_active !== false);
      setAutoSchedule(habit?.auto_schedule !== false);
    }
  }, [habit, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Please enter a habit name');
      return;
    }

    if (durationMinutes <= 0) {
      toast.error('Duration must be greater than 0');
      return;
    }

    setIsSubmitting(true);

    const habitData: HabitInput = {
      name: name.trim(),
      description: description.trim() || null,
      color,
      calendar_hours: calendarHours,
      priority,
      duration_minutes: durationMinutes,
      min_duration_minutes: minDuration || null,
      max_duration_minutes: maxDuration || null,
      ideal_time: idealTime || null,
      time_preference: timePreference || null,
      frequency,
      recurrence_interval: recurrenceInterval,
      days_of_week: frequency === 'weekly' ? daysOfWeek : null,
      monthly_type: frequency === 'monthly' ? monthlyType : null,
      day_of_month:
        frequency === 'monthly' && monthlyType === 'day_of_month'
          ? dayOfMonth
          : null,
      week_of_month:
        frequency === 'monthly' && monthlyType === 'day_of_week'
          ? weekOfMonth
          : null,
      day_of_week_monthly:
        frequency === 'monthly' && monthlyType === 'day_of_week'
          ? dayOfWeekMonthly
          : null,
      start_date: startDate,
      end_date: endDate || null,
      is_active: isActive,
      auto_schedule: autoSchedule,
    };

    try {
      const url = isEditing
        ? `/api/v1/workspaces/${wsId}/habits/${habit.id}`
        : `/api/v1/workspaces/${wsId}/habits`;

      const response = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(habitData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save habit');
      }

      onSuccess();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save habit');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleDayOfWeek = (day: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Habit' : 'Create New Habit'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update your habit settings'
              : 'Define a new recurring habit to track'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="schedule">Schedule</TabsTrigger>
              <TabsTrigger value="recurrence">Recurrence</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            {/* Basic Tab */}
            <TabsContent value="basic" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Morning Exercise"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="flex flex-wrap gap-2">
                    {COLORS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setColor(c.value)}
                        className={`h-8 w-8 rounded-full ${c.class} ${
                          color === c.value ? 'ring-2 ring-offset-2' : ''
                        }`}
                        title={c.label}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select
                    value={priority}
                    onValueChange={(v) => setPriority(v as TaskPriority)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            {/* Schedule Tab */}
            <TabsContent value="schedule" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="duration">Preferred Duration (minutes) *</Label>
                <Input
                  id="duration"
                  type="number"
                  min={1}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                />
                <p className="text-muted-foreground text-xs">
                  The scheduler will use this duration in most time slots
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="minDuration">Min Duration (optional)</Label>
                  <Input
                    id="minDuration"
                    type="number"
                    min={1}
                    value={minDuration || ''}
                    onChange={(e) =>
                      setMinDuration(
                        e.target.value ? Number(e.target.value) : undefined
                      )
                    }
                    placeholder={`~${Math.max(15, Math.floor(durationMinutes * 0.5))} min`}
                  />
                  <p className="text-muted-foreground text-xs">
                    Used when time is limited
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxDuration">Max Duration (optional)</Label>
                  <Input
                    id="maxDuration"
                    type="number"
                    min={1}
                    value={maxDuration || ''}
                    onChange={(e) =>
                      setMaxDuration(
                        e.target.value ? Number(e.target.value) : undefined
                      )
                    }
                    placeholder={`~${Math.min(180, Math.ceil(durationMinutes * 1.5))} min`}
                  />
                  <p className="text-muted-foreground text-xs">
                    Used at ideal times to maximize benefit
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="calendarHours">Calendar Category</Label>
                <Select
                  value={calendarHours}
                  onValueChange={(v) =>
                    setCalendarHours(v as CalendarHoursType)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CALENDAR_HOURS.map((ch) => (
                      <SelectItem key={ch.value} value={ch.value}>
                        {ch.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="idealTime">Ideal Time (optional)</Label>
                <Input
                  id="idealTime"
                  type="time"
                  value={idealTime}
                  onChange={(e) => setIdealTime(e.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  Scheduler will try to place habit at this time
                </p>
              </div>

              <div className="space-y-2">
                <Label>Or Time Preference</Label>
                <Select
                  value={timePreference || 'none'}
                  onValueChange={(v) =>
                    setTimePreference(
                      v === 'none' ? '' : (v as TimeOfDayPreference)
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Any time</SelectItem>
                    {TIME_PREFERENCES.map((tp) => (
                      <SelectItem key={tp.value} value={tp.value}>
                        {tp.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            {/* Recurrence Tab */}
            <TabsContent value="recurrence" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="frequency">Frequency *</Label>
                <Select
                  value={frequency}
                  onValueChange={(v) => setFrequency(v as HabitFrequency)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(frequency === 'weekly' ||
                frequency === 'monthly' ||
                frequency === 'yearly' ||
                frequency === 'custom') && (
                <div className="space-y-2">
                  <Label htmlFor="interval">
                    Every{' '}
                    {frequency === 'weekly'
                      ? 'week(s)'
                      : frequency === 'monthly'
                        ? 'month(s)'
                        : frequency === 'yearly'
                          ? 'year(s)'
                          : 'day(s)'}
                  </Label>
                  <Input
                    id="interval"
                    type="number"
                    min={1}
                    value={recurrenceInterval}
                    onChange={(e) =>
                      setRecurrenceInterval(Number(e.target.value))
                    }
                  />
                </div>
              )}

              {frequency === 'weekly' && (
                <div className="space-y-2">
                  <Label>Days of Week</Label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS_OF_WEEK.map((day) => (
                      <label
                        key={day.value}
                        className="flex cursor-pointer items-center gap-2"
                      >
                        <Checkbox
                          checked={daysOfWeek.includes(day.value)}
                          onCheckedChange={() => toggleDayOfWeek(day.value)}
                        />
                        <span className="text-sm">{day.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {frequency === 'monthly' && (
                <>
                  <div className="space-y-2">
                    <Label>Monthly Type</Label>
                    <Select
                      value={monthlyType}
                      onValueChange={(v) =>
                        setMonthlyType(v as MonthlyRecurrenceType)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="day_of_month">
                          Day of Month
                        </SelectItem>
                        <SelectItem value="day_of_week">Day of Week</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {monthlyType === 'day_of_month' && (
                    <div className="space-y-2">
                      <Label htmlFor="dayOfMonth">Day of Month</Label>
                      <Input
                        id="dayOfMonth"
                        type="number"
                        min={1}
                        max={31}
                        value={dayOfMonth}
                        onChange={(e) => setDayOfMonth(Number(e.target.value))}
                      />
                    </div>
                  )}

                  {monthlyType === 'day_of_week' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Week of Month</Label>
                        <Select
                          value={String(weekOfMonth)}
                          onValueChange={(v) => setWeekOfMonth(Number(v))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1st</SelectItem>
                            <SelectItem value="2">2nd</SelectItem>
                            <SelectItem value="3">3rd</SelectItem>
                            <SelectItem value="4">4th</SelectItem>
                            <SelectItem value="5">Last</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Day of Week</Label>
                        <Select
                          value={String(dayOfWeekMonthly)}
                          onValueChange={(v) => setDayOfWeekMonthly(Number(v))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DAYS_OF_WEEK.map((day) => (
                              <SelectItem
                                key={day.value}
                                value={String(day.value)}
                              >
                                {day.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </>
              )}

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date *</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date (optional)</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings" className="space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Active</Label>
                  <p className="text-muted-foreground text-sm">
                    Inactive habits won&apos;t be scheduled
                  </p>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-schedule</Label>
                  <p className="text-muted-foreground text-sm">
                    Automatically create calendar events with smart duration
                    optimization
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Habits are scheduled before tasks. Urgent tasks may
                    temporarily bump habits if needed.
                  </p>
                </div>
                <Switch
                  checked={autoSchedule}
                  onCheckedChange={setAutoSchedule}
                />
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isEditing ? 'Save Changes' : 'Create Habit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
