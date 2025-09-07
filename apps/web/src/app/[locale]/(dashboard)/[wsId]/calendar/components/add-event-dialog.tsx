import { createClient } from '@tuturuuu/supabase/next/client';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { Button } from '@tuturuuu/ui/button';
import { Calendar } from '@tuturuuu/ui/calendar';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { CalendarIcon, ClockIcon, PlusIcon } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import dayjs from 'dayjs';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface AddEventDialogProps {
  isOpen?: boolean;
  onClose?: () => void;
  wsId?: string;
}

const minutesToHours = (minutes: number) => {
  if (typeof minutes !== 'number' || Number.isNaN(minutes)) return '';
  const hours = minutes / 60;
  return hours.toFixed(1);
};

const hoursToMinutes = (hours: number) => {
  if (typeof hours !== 'number' || Number.isNaN(hours)) return 0;
  return Math.round(hours * 60);
};

export default function AddEventDialog({
  isOpen,
  onClose,
  wsId,
}: AddEventDialogProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    total_duration: 1,
    is_splittable: true,
    min_split_duration_minutes: 60,
    max_split_duration_minutes: 120,
    calendar_hours: 'work_hours',
    start_date: '',
    end_date: '',
    priority: 'normal',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (error) {
        console.error('Error fetching user:', error);
        setErrors({
          submit: 'Failed to fetch user information. Please try again.',
        });
      } else if (user) {
        setUser(user);
      }
    };
    setIsLoading(false);
    getUser();
  }, [supabase]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Task name is required';
    }

    if (formData.total_duration <= 0) {
      newErrors.total_duration = 'Duration must be greater than 0';
    }

    if (formData.is_splittable) {
      if (formData.min_split_duration_minutes <= 0) {
        newErrors.min_split_duration_minutes =
          'Minimum duration must be greater than 0';
      }

      if (formData.max_split_duration_minutes <= 0) {
        newErrors.max_split_duration_minutes =
          'Maximum duration must be greater than 0';
      }

      if (
        formData.min_split_duration_minutes >
        formData.max_split_duration_minutes
      ) {
        newErrors.min_split_duration_minutes =
          'Minimum duration cannot be greater than maximum';
      }
    }

    if (formData.end_date) {
      const endDate = dayjs(formData.end_date);
      if (endDate.isBefore(dayjs())) {
        newErrors.end_date = 'End date cannot be in the past';
      } else if (
        formData.start_date &&
        endDate.isBefore(dayjs(formData.start_date))
      ) {
        newErrors.end_date = 'End date cannot be before start date';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const updateFormData = useCallback(
    (field: string, value: string | number | boolean) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: '' }));
      }
    },
    [errors]
  );

  const prioritySliderOptions = [
    {
      value: 'critical',
      label: 'Critical',
      color: 'bg-red-500',
      icon: '😡',
    },
    {
      value: 'high',
      label: 'High',
      color: 'bg-orange-400',
      icon: '😞',
    },
    {
      value: 'normal',
      label: 'Normal',
      color: 'bg-yellow-400',
      icon: '😐',
    },
    {
      value: 'low',
      label: 'Low',
      color: 'bg-green-500',
      icon: '😊',
    },
  ];

  const getPriorityFromPosition = useCallback((clientX: number) => {
    if (!sliderRef.current) return 'normal';

    const rect = sliderRef.current.getBoundingClientRect();
    const position = (clientX - rect.left) / rect.width;

    if (position <= 0.25) return 'critical';
    if (position <= 0.5) return 'high';
    if (position <= 0.75) return 'normal';
    return 'low';
  }, []);

  const getCurrentPriorityIndex = () => {
    return prioritySliderOptions.findIndex(
      (opt) => opt.value === formData.priority
    );
  };

  const getSliderPosition = () => {
    const index = getCurrentPriorityIndex();
    return (index / (prioritySliderOptions.length - 1)) * 100;
  };

  const handleSliderMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    const newPriority = getPriorityFromPosition(e.clientX);
    updateFormData('priority', newPriority);
  };

  const handleSliderMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const newPriority = getPriorityFromPosition(e.clientX);
    updateFormData('priority', newPriority);
  };

  const handleSliderMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        const newPriority = getPriorityFromPosition(e.clientX);
        updateFormData('priority', newPriority);
      };

      const handleGlobalMouseUp = () => {
        setIsDragging(false);
      };

      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [isDragging, getPriorityFromPosition, updateFormData]);

  const submitToDatabase = async () => {
    if (!wsId) {
      setErrors({ submit: 'Workspace ID is required' });
      return false;
    }

    if (!user) {
      setErrors({ submit: 'Authentication required. Please log in.' });
      return false;
    }

    try {
      setIsLoading(true);

      const taskData = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        total_duration: formData.total_duration,
        is_splittable: formData.is_splittable,
        min_split_duration_minutes: formData.is_splittable
          ? formData.min_split_duration_minutes
          : null,
        max_split_duration_minutes: formData.is_splittable
          ? formData.max_split_duration_minutes
          : null,
        calendar_hours: formData.calendar_hours as
          | 'work_hours'
          | 'personal_hours'
          | 'meeting_hours',
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        priority: formData.priority,
      };

      const response = await fetch(`/api/${wsId}/task/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(taskData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('API error:', errorData);
        setErrors({
          submit: `Failed to create task: ${errorData.error || 'Unknown error'}`,
        });
        return false;
      }

      const data = await response.json();
      console.log('Task created successfully:', data);
      return true;
    } catch (error) {
      console.error('Unexpected error:', error);
      setErrors({ submit: 'An unexpected error occurred. Please try again.' });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const success = await submitToDatabase();
    if (success) {
      handleClose();
    }
  };

  const handleClose = () => {
    setFormData({
      name: '',
      description: '',
      total_duration: 1,
      is_splittable: true,
      min_split_duration_minutes: 30,
      max_split_duration_minutes: 60,
      calendar_hours: 'work_hours',
      start_date: '',
      end_date: '',
      priority: 'normal',
    });
    setErrors({});
    onClose?.();
  };

  const workingHoursOptions = [
    {
      value: 'work_hours',
      label: 'Working Hours',
      icon: '💼',
      description: 'Schedule during standard work hours',
    },
    {
      value: 'personal_hours',
      label: 'Personal Time',
      icon: '⚙️',
      description: 'Schedule at any time of day',
    },
    {
      value: 'meeting_hours',
      label: 'Meeting Hours',
      icon: '📅',
      description: 'Schedule during typical meeting times',
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-lg sm:max-w-lg dark:border-zinc-800 dark:bg-zinc-900">
        <DialogHeader>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <PlusIcon className="h-5 w-5 text-blue-500" />
              <DialogTitle className="font-semibold text-lg">
                Create Task
              </DialogTitle>
            </div>

            <div className="flex w-fit items-center gap-2 rounded-md bg-blue-50 p-2 text-blue-800 text-xs dark:bg-blue-950 dark:text-blue-200">
              <span>📧</span>
              <span>For {user?.email || 'your account'}</span>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 space-y-5">
          {/* Basic Information */}
          <div className="space-y-3 rounded-xl border border-zinc-100 bg-white p-4 shadow-md transition-shadow hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
            <div className="space-y-1">
              <Label
                htmlFor="task-title"
                className="font-medium text-xs text-zinc-600 dark:text-zinc-300"
              >
                Task Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="task-title"
                placeholder="e.g., Project documentation"
                value={formData.name}
                onChange={(e) => updateFormData('name', e.target.value)}
                className={`h-9 rounded-lg border-zinc-200 text-sm transition-all focus:ring-2 focus:ring-blue-300 dark:border-zinc-700 ${errors.name ? 'border-destructive' : ''}`}
              />
              {errors.name && (
                <p className="mt-0.5 text-destructive text-xs">{errors.name}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label
                htmlFor="task-description"
                className="font-medium text-xs text-zinc-600 dark:text-zinc-300"
              >
                Description
              </Label>
              <Textarea
                id="task-description"
                placeholder="Details (optional)"
                value={formData.description}
                onChange={(e) => updateFormData('description', e.target.value)}
                rows={2}
                className="h-16 rounded-lg border-zinc-200 text-sm transition-all focus:ring-2 focus:ring-blue-300 dark:border-zinc-700"
              />
            </div>
          </div>

          {/* Compact Horizontal Priority Slider */}
          <div className="space-y-3 rounded-xl border border-zinc-100 bg-white p-4 shadow-md transition-shadow hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
            <Label className="font-semibold text-xs text-zinc-700 dark:text-zinc-200">
              Priority
            </Label>
            {/* Slider container */}
            <div className="space-y-4">
              {/* Track & Thumb (all in one draggable area) */}
              <div
                ref={sliderRef}
                role="slider"
                aria-label="Priority level"
                aria-valuemin={0}
                aria-valuemax={3}
                aria-valuenow={getCurrentPriorityIndex()}
                aria-valuetext={
                  prioritySliderOptions[getCurrentPriorityIndex()]?.label ||
                  'Normal'
                }
                tabIndex={0}
                className="relative h-8 cursor-pointer select-none rounded focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2"
                onMouseDown={handleSliderMouseDown}
                onMouseMove={handleSliderMouseMove}
                onMouseUp={handleSliderMouseUp}
                onTouchStart={(e) => {
                  if (e.touches[0])
                    handleSliderMouseDown({
                      clientX: e.touches[0].clientX,
                    } as React.MouseEvent);
                }}
                onTouchMove={(e) => {
                  if (e.touches[0])
                    handleSliderMouseMove({
                      clientX: e.touches[0].clientX,
                    } as React.MouseEvent);
                }}
                onTouchEnd={handleSliderMouseUp}
                onKeyDown={(e) => {
                  const currentIndex = getCurrentPriorityIndex();
                  if (
                    currentIndex > 0 &&
                    prioritySliderOptions[currentIndex - 1]?.value
                  ) {
                    updateFormData(
                      'priority',
                      prioritySliderOptions[currentIndex - 1]?.value ?? 'normal'
                    );
                  } else if (
                    e.key === 'ArrowRight' &&
                    currentIndex < prioritySliderOptions.length - 1 &&
                    prioritySliderOptions[currentIndex + 1]?.value
                  ) {
                    updateFormData(
                      'priority',
                      prioritySliderOptions[currentIndex + 1]?.value ?? 'normal'
                    );
                  }
                }}
              >
                {/* Track */}
                <div className="absolute top-3 right-0 left-0 z-10 h-2 rounded-full bg-gradient-to-r from-red-500 via-orange-400 to-green-500 opacity-60" />
                {/* Thumb: selected icon in a styled circle */}
                <div
                  style={{ left: `calc(${getSliderPosition()}% - 14px)` }}
                  className="absolute top-1 z-20 flex flex-col items-center"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full border-4 border-white bg-blue-500 shadow-lg ring-2 ring-blue-400">
                    <span className="text-lg text-white drop-shadow-sm">
                      {prioritySliderOptions[getCurrentPriorityIndex()]?.icon ??
                        '❓'}
                    </span>
                  </div>
                </div>
              </div>
              {/* Priority icons/labels row below track */}
              <div className="flex items-center justify-between px-1">
                {prioritySliderOptions.map((opt, idx) => (
                  <div
                    key={opt?.value ?? idx}
                    className="flex w-10 flex-col items-center"
                  >
                    <span
                      className={`transition-all ${formData.priority === opt?.value ? 'font-bold text-lg' : 'text-base opacity-40'}`}
                    >
                      {opt?.icon ?? '❓'}
                    </span>
                    <span
                      className={`mt-0.5 text-xs transition-all ${formData.priority === opt?.value ? `${opt?.color ?? 'bg-zinc-400'} rounded px-1 font-bold text-white` : 'font-normal text-zinc-400 dark:text-zinc-500'}`}
                    >
                      {opt?.label ?? 'Unknown'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Duration Settings */}
          <div className="space-y-3 rounded-xl border border-zinc-100 bg-white p-4 shadow-md transition-shadow hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="duration" className="text-xs">
                  Total (h) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="duration"
                  type="number"
                  step="0.25"
                  min="0.25"
                  value={formData.total_duration}
                  onChange={(e) =>
                    updateFormData('total_duration', parseFloat(e.target.value))
                  }
                  className={`h-9 rounded-lg border-zinc-200 text-sm transition-all focus:ring-2 focus:ring-blue-300 dark:border-zinc-700 ${errors.total_duration ? 'border-destructive' : ''}`}
                />
                {errors.total_duration && (
                  <p className="mt-0.5 text-destructive text-xs">
                    {errors.total_duration}
                  </p>
                )}
              </div>
              <div className="mt-5 flex items-center space-x-2">
                <Checkbox
                  id="split-up"
                  checked={formData.is_splittable}
                  onCheckedChange={(checked) =>
                    updateFormData('is_splittable', checked)
                  }
                />
                <Label htmlFor="split-up" className="font-normal text-xs">
                  Splittable
                </Label>
              </div>
            </div>
            {formData.is_splittable && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="min-duration" className="text-xs">
                    Min (h) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="min-duration"
                    type="number"
                    step="0.25"
                    min="0.25"
                    value={minutesToHours(formData.min_split_duration_minutes)}
                    onChange={(e) => {
                      const hours = parseFloat(e.target.value);
                      updateFormData(
                        'min_split_duration_minutes',
                        hoursToMinutes(hours)
                      );
                    }}
                    className={`h-9 rounded-lg border-zinc-200 text-sm transition-all focus:ring-2 focus:ring-blue-300 dark:border-zinc-700 ${errors.min_split_duration_minutes ? 'border-destructive' : ''}`}
                  />
                  {errors.min_split_duration_minutes && (
                    <p className="mt-0.5 text-destructive text-xs">
                      {errors.min_split_duration_minutes}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="max-duration" className="text-xs">
                    Max (h) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="max-duration"
                    type="number"
                    step="0.25"
                    min="0.25"
                    value={minutesToHours(formData.max_split_duration_minutes)}
                    onChange={(e) => {
                      const hours = parseFloat(e.target.value);
                      updateFormData(
                        'max_split_duration_minutes',
                        hoursToMinutes(hours)
                      );
                    }}
                    className={`h-9 rounded-lg border-zinc-200 text-sm transition-all focus:ring-2 focus:ring-blue-300 dark:border-zinc-700 ${errors.max_split_duration_minutes ? 'border-destructive' : ''}`}
                  />
                  {errors.max_split_duration_minutes && (
                    <p className="mt-0.5 text-destructive text-xs">
                      {errors.max_split_duration_minutes}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Scheduling Preferences */}
          <div className="space-y-3 rounded-xl border border-zinc-100 bg-white p-4 shadow-md transition-shadow hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-1 flex items-center gap-2">
              <ClockIcon className="h-4 w-4 text-blue-400" />
              <Label className="font-semibold text-xs text-zinc-700 dark:text-zinc-200">
                Working Hours
              </Label>
            </div>
            <Select
              value={formData.calendar_hours}
              onValueChange={(value) => updateFormData('calendar_hours', value)}
            >
              <SelectTrigger className="h-9 rounded-lg border-zinc-200 text-sm transition-all focus:ring-2 focus:ring-blue-300 dark:border-zinc-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {workingHoursOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span>{option.icon}</span>
                      <span>{option.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 flex w-full flex-col items-end gap-4 sm:flex-row">
                {/* Start Date */}
                <div className="w-full">
                  <div className="flex">
                    <Label
                      htmlFor="start-date"
                      className="mb-1 flex items-center gap-1 text-xs"
                    >
                      Start (optional)
                      <CalendarIcon className="h-5 w-5" />
                    </Label>
                  </div>
                  <div className="relative">
                    <Popover
                      open={startDateOpen}
                      onOpenChange={setStartDateOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button className="w-full">
                          {formData.start_date
                            ? dayjs(formData.start_date).format('MMM DD, YYYY')
                            : 'Select date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-auto overflow-hidden p-0"
                        align="start"
                      >
                        <Calendar
                          mode="single"
                          selected={
                            formData.start_date
                              ? new Date(formData.start_date)
                              : undefined
                          }
                          onSelect={(date) => {
                            if (date) {
                              const formattedDate =
                                dayjs(date).format('YYYY-MM-DDTHH:mm');
                              updateFormData('start_date', formattedDate);
                            } else {
                              updateFormData('start_date', '');
                            }
                            setStartDateOpen(false);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* End Date */}
                <div className="w-full">
                  <div className="flex">
                    <Label
                      htmlFor="end-date"
                      className="mb-1 flex items-center gap-1 text-xs"
                    >
                      End (optional)
                      <CalendarIcon className="h-5 w-5" />
                    </Label>
                  </div>

                  <div className="relative">
                    <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                      <PopoverTrigger asChild>
                        <Button className="w-full">
                          {formData.end_date
                            ? dayjs(formData.end_date).format('MMM DD, YYYY')
                            : 'Select date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-auto overflow-hidden p-0"
                        align="start"
                      >
                        <Calendar
                          mode="single"
                          selected={
                            formData.end_date
                              ? new Date(formData.end_date)
                              : undefined
                          }
                          onSelect={(date) => {
                            if (date) {
                              const formattedDate =
                                dayjs(date).format('YYYY-MM-DDTHH:mm');
                              updateFormData('end_date', formattedDate);
                            } else {
                              updateFormData('end_date', '');
                            }
                            setEndDateOpen(false);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  {errors.end_date && (
                    <p className="mt-0.5 text-destructive text-xs">
                      {errors.end_date}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {errors.submit && (
            <div className="rounded-lg bg-destructive/10 p-2 text-destructive text-xs">
              {errors.submit}
            </div>
          )}

          <DialogFooter className="mt-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
              className="h-9 rounded-lg border-zinc-200 px-5 text-sm transition-all hover:bg-zinc-100 focus:ring-2 focus:ring-blue-300 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="h-9 rounded-lg bg-blue-500 px-5 font-semibold text-sm text-white shadow-md transition-all hover:bg-blue-600 focus:ring-2 focus:ring-blue-300"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Creating...
                </>
              ) : (
                <>
                  <PlusIcon className="mr-2 h-4 w-4" />
                  Create
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
