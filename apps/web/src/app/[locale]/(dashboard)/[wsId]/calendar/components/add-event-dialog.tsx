import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';

import dayjs from 'dayjs';
import React from 'react';

interface AddEventModalProps {
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

export default function AddEventModal({
  isOpen,
  onClose,
  wsId,
}: AddEventModalProps) {
  const [formData, setFormData] = React.useState({
    name: '',
    description: '',
    total_duration: 1,
    is_splittable: true,
    min_split_duration_minutes: 60,
    max_split_duration_minutes: 120,
    calendar_hours: 'work_hours',
    start_date: '',
    end_date: '',
    priority: 'medium',
  });

  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = React.useState(false);
  const [user, setUser] = React.useState<any>(null);
  const supabase = createClient();

  React.useEffect(() => {
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

  const updateFormData = (field: string, value: string | number | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

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
      priority: 'medium',
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

  const priorityOptions = [
    { value: 'high', label: 'High', color: 'text-red-600', icon: '🔴' },
    { value: 'medium', label: 'Medium', color: 'text-yellow-600', icon: '🟡' },
    { value: 'low', label: 'Low', color: 'text-green-600', icon: '🟢' },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg rounded-xl shadow-lg p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PlusIcon className="h-5 w-5 text-blue-500" />
              <DialogTitle className="text-lg font-semibold">
                Create Task
              </DialogTitle>
            </div>
            {/* Priority icon selector */}
            <div className="flex items-center gap-1">
              {priorityOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateFormData('priority', opt.value)}
                  aria-label={opt.label}
                  title={opt.label}
                  className={`text-xl px-1.5 py-1 rounded-full border transition-all focus:outline-none focus:ring-2 focus:ring-blue-300
                    ${formData.priority === opt.value ? `${opt.color} border-blue-400 bg-zinc-100 dark:bg-zinc-800 scale-110` : 'text-zinc-400 border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                >
                  <span>{opt.icon}</span>
                </button>
              ))}
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-2">
          {/* Basic Information */}
          <div className="rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3 shadow-md transition-shadow hover:shadow-lg">
            <div className="space-y-1">
              <Label
                htmlFor="task-title"
                className="text-xs font-medium text-zinc-600 dark:text-zinc-300"
              >
                Task Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="task-title"
                placeholder="e.g., Project documentation"
                value={formData.name}
                onChange={(e) => updateFormData('name', e.target.value)}
                className={`h-9 text-sm rounded-lg border-zinc-200 dark:border-zinc-700 focus:ring-2 focus:ring-blue-300 transition-all ${errors.name ? 'border-destructive' : ''}`}
              />
              {errors.name && (
                <p className="text-xs text-destructive mt-0.5">{errors.name}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label
                htmlFor="task-description"
                className="text-xs font-medium text-zinc-600 dark:text-zinc-300"
              >
                Description
              </Label>
              <Textarea
                id="task-description"
                placeholder="Details (optional)"
                value={formData.description}
                onChange={(e) => updateFormData('description', e.target.value)}
                rows={2}
                className="h-16 text-sm rounded-lg border-zinc-200 dark:border-zinc-700 focus:ring-2 focus:ring-blue-300 transition-all"
              />
            </div>
          </div>

          {/* Duration Settings */}
          <div className="rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3 shadow-md transition-shadow hover:shadow-lg">
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
                  className={`h-9 text-sm rounded-lg border-zinc-200 dark:border-zinc-700 focus:ring-2 focus:ring-blue-300 transition-all ${errors.total_duration ? 'border-destructive' : ''}`}
                />
                {errors.total_duration && (
                  <p className="text-xs text-destructive mt-0.5">
                    {errors.total_duration}
                  </p>
                )}
              </div>
              <div className="flex items-center space-x-2 mt-5">
                <Checkbox
                  id="split-up"
                  checked={formData.is_splittable}
                  onCheckedChange={(checked) =>
                    updateFormData('is_splittable', checked)
                  }
                />
                <Label htmlFor="split-up" className="text-xs font-normal">
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
                    className={`h-9 text-sm rounded-lg border-zinc-200 dark:border-zinc-700 focus:ring-2 focus:ring-blue-300 transition-all ${errors.min_split_duration_minutes ? 'border-destructive' : ''}`}
                  />
                  {errors.min_split_duration_minutes && (
                    <p className="text-xs text-destructive mt-0.5">
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
                    className={`h-9 text-sm rounded-lg border-zinc-200 dark:border-zinc-700 focus:ring-2 focus:ring-blue-300 transition-all ${errors.max_split_duration_minutes ? 'border-destructive' : ''}`}
                  />
                  {errors.max_split_duration_minutes && (
                    <p className="text-xs text-destructive mt-0.5">
                      {errors.max_split_duration_minutes}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Scheduling Preferences */}
          <div className="rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3 shadow-md transition-shadow hover:shadow-lg">
            <div className="flex items-center gap-2 mb-1">
              <ClockIcon className="h-4 w-4 text-blue-400" />
              <Label className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                Working Hours
              </Label>
            </div>
            <Select
              value={formData.calendar_hours}
              onValueChange={(value) => updateFormData('calendar_hours', value)}
            >
              <SelectTrigger className="h-9 text-sm rounded-lg border-zinc-200 dark:border-zinc-700 focus:ring-2 focus:ring-blue-300 transition-all">
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
              <div className="flex items-end gap-6 w-full">
                {/* Start Date */}
                <div className="w-48">
                  <Label htmlFor="start-date" className="text-xs mb-1 block">
                    Start (optional)
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none flex items-center">
                      <CalendarIcon className="h-5 w-5" />
                    </span>
                    <Input
                      id="start-date"
                      type="datetime-local"
                      value={formData.start_date}
                      onChange={(e) =>
                        updateFormData('start_date', e.target.value)
                      }
                      min={dayjs().format('YYYY-MM-DDTHH:mm')}
                      className="h-10 w-full text-sm rounded-lg border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 focus:ring-2 focus:ring-blue-300 transition-all pl-10 pr-2 shadow-sm focus:shadow-md"
                    />
                  </div>
                </div>
                {/* End Date */}
                <div className="w-48">
                  <Label htmlFor="end-date" className="text-xs mb-1 block">
                    End (optional)
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none flex items-center">
                      <CalendarIcon className="h-5 w-5" />
                    </span>
                    <Input
                      id="end-date"
                      type="datetime-local"
                      value={formData.end_date}
                      onChange={(e) =>
                        updateFormData('end_date', e.target.value)
                      }
                      min={dayjs().format('YYYY-MM-DDTHH:mm')}
                      className={`h-10 w-full text-sm rounded-lg border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 focus:ring-2 focus:ring-blue-300 transition-all pl-10 pr-2 shadow-sm focus:shadow-md ${errors.end_date ? 'border-destructive' : ''}`}
                    />
                  </div>
                  {errors.end_date && (
                    <p className="text-xs text-destructive mt-0.5">
                      {errors.end_date}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="rounded-md bg-blue-50 dark:bg-blue-950 p-2 text-xs text-blue-800 dark:text-blue-200 flex items-center gap-2 mt-1">
              <span>📧</span>
              <span>For {user?.email || 'your account'}</span>
            </div>
          </div>

          {errors.submit && (
            <div className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
              {errors.submit}
            </div>
          )}

          <DialogFooter className="gap-2 mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
              className="h-9 px-5 text-sm rounded-lg border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus:ring-2 focus:ring-blue-300 transition-all"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="h-9 px-5 text-sm rounded-lg bg-blue-500 hover:bg-blue-600 focus:ring-2 focus:ring-blue-300 transition-all text-white font-semibold shadow-md"
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
