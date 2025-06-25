import { createClient } from '@tuturuuu/supabase/next/client';
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
import { Separator } from '@tuturuuu/ui/separator';
import { Textarea } from '@tuturuuu/ui/textarea';
import dayjs from 'dayjs';
import React from 'react';

interface AddEventModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  wsId?: string;
}


const minutesToHours = (minutes: number) => {
  if (typeof minutes !== 'number' || isNaN(minutes)) return '';
  const hours = minutes / 60;
  return hours.toFixed(1); 
};


const hoursToMinutes = (hours: number) => {
  if (typeof hours !== 'number' || isNaN(hours)) return 0;
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
    time_reference: 'working_time',
    start_date: '',
    end_date: '',
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
          time_reference: formData.time_reference as
          | 'working_time'
          | 'personal_time',
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        // ws_id: wsId,
        creator_id: user.id,
        archived: false,
        completed: false,
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('tasks')
        .insert(taskData)
        .select();

      if (error) {
        console.error('Database error:', error);
        setErrors({ submit: `Failed to create task: ${error.message}` });
        return false;
      }

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
      time_reference: 'working_time',
      start_date: '',
      end_date: '',
    });
    setErrors({});
    onClose?.();
  };

  const workingHoursOptions = [
    {
      value: 'working_time',
      label: 'Working Hours',
      icon: '💼',
      description: 'Schedule during standard work hours',
    },
    {
      value: 'personal_time',
      label: 'Personal Time',
      icon: '⚙️',
      description: 'Schedule at any time of day',
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlusIcon className="h-5 w-5" />
            Create New Task
          </DialogTitle>
          <DialogDescription>
            Schedule a new task with your preferred settings and constraints.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="task-title">
                Task Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="task-title"
                placeholder="e.g., Complete project documentation"
                value={formData.name}
                onChange={(e) => updateFormData('name', e.target.value)}
                className={errors.name ? 'border-destructive' : ''}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-description">Description (Optional)</Label>
              <Textarea
                id="task-description"
                placeholder="Add any additional details about this task..."
                value={formData.description}
                onChange={(e) => updateFormData('description', e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <Separator />

          {/* Duration Settings */}
          <div className="space-y-4">
            <div className="mb-3 flex items-center gap-2">
              <ClockIcon className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Duration Settings</Label>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="duration" className="text-sm">
                  Total Duration (h) <span className="text-destructive">*</span>
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
                  className={errors.total_duration ? 'border-destructive' : ''}
                />
                {errors.total_duration && (
                  <p className="text-xs text-destructive">
                    {errors.total_duration}
                  </p>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="split-up"
                  checked={formData.is_splittable}
                  onCheckedChange={(checked) =>
                    updateFormData('is_splittable', checked)
                  }
                />
                <Label htmlFor="split-up" className="text-sm font-normal">
                  Allow splitting into smaller sessions
                </Label>
              </div>


              {formData.is_splittable && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="min-duration" className="text-sm">
                      Min Duration (h) <span className="text-destructive">*</span>
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
                      className={
                        errors.min_split_duration_minutes
                          ? 'border-destructive'
                          : ''
                      }
                    />
                    {errors.min_split_duration_minutes && (
                      <p className="text-xs text-destructive">
                        {errors.min_split_duration_minutes}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="max-duration" className="text-sm">
                      Max Duration (h) <span className="text-destructive">*</span>
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
                      className={
                        errors.max_split_duration_minutes
                          ? 'border-destructive'
                          : ''
                      }
                    />
                    {errors.max_split_duration_minutes && (
                      <p className="text-xs text-destructive">
                        {errors.max_split_duration_minutes}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded-lg bg-accent/50 p-3 text-xs text-muted-foreground">
                <strong>Duration Guidelines:</strong>
                <ul className="mt-1 space-y-1">
                  <li>
                    • <strong>Total:</strong> How long this task should take
                    overall
                  </li>
                  {formData.is_splittable && (
                    <>
                      <li>
                        • <strong>Min:</strong> Minimum time block needed for
                        meaningful progress
                      </li>
                      <li>
                        • <strong>Max:</strong> Maximum time to work on this
                        task at once
                      </li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          </div>

          <Separator />

          {/* Scheduling Preferences */}
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="mb-2 flex items-center gap-2">
                <ClockIcon className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Working Hours</Label>
              </div>
              <Select
                value={formData.time_reference}
                onValueChange={(value) =>
                  updateFormData('time_reference', value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workingHoursOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        <span>{option.icon}</span>
                        <div>
                          <div className="font-medium">{option.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {option.description}
                          </div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-date" className="text-sm">
                  Start Date (Optional)
                </Label>
                <Input
                  id="start-date"
                  type="datetime-local"
                  value={formData.start_date}
                  onChange={(e) => updateFormData('start_date', e.target.value)}
                  min={dayjs().format('YYYY-MM-DDTHH:mm')}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="end-date" className="text-sm">
                    End Date (Optional)
                  </Label>
                </div>
                <Input
                  id="end-date"
                  type="datetime-local"
                  value={formData.end_date}
                  onChange={(e) => updateFormData('end_date', e.target.value)}
                  min={dayjs().format('YYYY-MM-DDTHH:mm')}
                  className={errors.end_date ? 'border-destructive' : ''}
                />
                {errors.end_date && (
                  <p className="text-xs text-destructive">{errors.end_date}</p>
                )}
              </div>
            </div>

            <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
              <div className="flex items-center gap-2">
                <span>📧</span>
                <span>
                  Tasks will be scheduled for {user?.email || 'your account'}
                </span>
              </div>
            </div>
          </div>

          {errors.submit && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {errors.submit}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-blue-500 hover:bg-blue-600"
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
                  Create Task
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
